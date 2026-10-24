"use server";

import { captureCheckoutStarted } from "@/services/analytics/checkout";
import { captureForUser } from "@/services/analytics/actor";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";

import { env, hasSupabaseEnv } from "@/lib/env";
import { assertStripeServerConfiguration, getPaymentActivityMetadata } from "@/lib/server-env";
import { acceptPurchaseQuote, readPurchaseQuote } from "@/services/licensing/purchases";
import { generateAgreementPlaceholder } from "@/lib/license";
import { appendOrderActivityLog } from "@/services/orders/activity";
import { preparePurchaseCompletionCheckout } from "@/services/purchase-completion/server";
import { createStripeCheckoutSession } from "@/services/stripe/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { isMissingColumnError, warnSchemaFallbackOnce } from "@/services/supabase/schema-compat";
import { resolveRoleRedirect } from "@/services/auth/session";
import type { Database } from "@/types/database";
import type { SessionUser } from "@/types/models";
import { getBuyerTrackBySlug } from "@/services/buyer/queries";
import { consumeRateLimit, getRateLimitMessage } from "@/services/security/rate-limit";

export async function createOrderAction(formData: FormData) {
  const user = await requireBuyerUser();
  const trackId = String(formData.get("trackId") || "");
  const trackSlug = String(formData.get("trackSlug") || "");
  const licenseSelection = String(formData.get("licenseSelection") || "");
  const [licenseTypeId] = licenseSelection.split("|");

  if (!trackId || !trackSlug || !licenseTypeId) {
    redirect(`/buyer/checkout/${trackSlug}?error=Missing%20checkout%20details.`);
  }

  if (hasSupabaseEnv && !env.demoMode) {
    const admission = await consumeRateLimit("checkout", user.id);
    if (admission.status !== "allowed") {
      redirect(`/buyer/checkout/${trackSlug}?error=${encodeURIComponent(getRateLimitMessage(admission))}`);
    }
  }

  const track = await getBuyerTrackBySlug(trackSlug, user.id);
  if (!track || track.id !== trackId) {
    redirect(`/buyer/catalog?error=Track%20selection%20is%20no%20longer%20available.`);
  }

  const selectedLicense = track.license_options.find((option) => option.id === licenseTypeId);
  if (!selectedLicense) {
    redirect(`/buyer/checkout/${trackSlug}?error=Selected%20license%20option%20is%20not%20available.`);
  }


  if (!hasSupabaseEnv || env.demoMode) {
    const orderId = `ord_demo_${Date.now()}`;
    const agreement = generateAgreementPlaceholder(orderId, trackId, licenseTypeId);
    redirect(agreement.agreementUrl + `?trackId=${encodeURIComponent(trackId)}&licenseTypeId=${encodeURIComponent(licenseTypeId)}`);
  }

  try {
    assertStripeServerConfiguration("Stripe checkout", { requireWebhook: true });
  } catch (error) {
    redirect(
      `/buyer/checkout/${trackSlug}?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Stripe is not configured for this environment."
      )}`
    );
  }

  const supabase = await createPrivilegedSupabaseClient();
  let reservation;
  try {
    const buyerClient = await createServerSupabaseClient();
    const quote = await readPurchaseQuote(buyerClient, String(formData.get("quoteId") || ""));
    if (quote.schedule.track.id !== trackId || quote.schedule.license.id !== licenseTypeId) throw new Error("Transaction selection mismatch.");
    reservation = await acceptPurchaseQuote(buyerClient, formData);
  } catch {
    redirect(`/buyer/checkout/${trackSlug}?error=${encodeURIComponent("Checkout requires reconciliation. Check your purchases or contact support before retrying.")}`);
  }
  const createdNewOrder = reservation.created_new;
  const orderId = reservation.id;
  const amountCents = reservation.amount_cents;
  let checkoutSessionId: string | null = null;
  let checkoutCreationStarted = false;

  try {
    if (createdNewOrder) {
      await appendOrderActivityLog(supabase, {
        orderId,
        actorId: user.id,
        source: "buyer",
        eventType: "order_created",
        message: "Buyer initiated checkout for a license purchase.",
        metadata: {
          trackId,
          licenseTypeId,
          amountCents,
          ...getPaymentActivityMetadata()
        }
      }).catch(() => undefined);
    }

    // The user-facing checkout form is the canonical purchase entry point. If
    // the Phase 2B adapter is enabled, freeze its trusted delivery contract
    // before Stripe can create a payment session. Missing/false configuration
    // preserves the legacy flow; an invalid enabled configuration fails closed.
    await preparePurchaseCompletionCheckout(orderId);

    // A thrown request can still have created a provider session. Retain its
    // local order reference so a later verified webhook can reconcile it.
    checkoutCreationStarted = true;
    const session = await createStripeCheckoutSession({
      orderId,
      trackTitle: track.title,
      trackSlug: track.slug,
      licenseName: selectedLicense.name,
      amountCents,
      currency: "USD",
      buyerEmail: user.email,
      buyerUserId: user.id,
      trackId,
      licenseTypeId
    });
    checkoutSessionId = session.id;

    const checkoutCreatedAt = new Date().toISOString();
    const checkoutUpdate = await supabase
      .from("orders")
      .update({
        stripe_checkout_session_id: checkoutSessionId,
        checkout_created_at: checkoutCreatedAt
      })
      .eq("id", orderId);

    if (checkoutUpdate.error) {
      if (!isMissingColumnError(checkoutUpdate.error, "checkout_created_at")) {
        throw new Error(checkoutUpdate.error.message);
      }

      warnSchemaFallbackOnce(
        "buyer-checkout-created-at-write",
        "checkout_created_at is not available yet; buyer checkout timing will be reduced until migration 0009 is applied.",
        checkoutUpdate.error
      );

      const fallbackCheckoutUpdate = await supabase
        .from("orders")
        .update({
          stripe_checkout_session_id: checkoutSessionId
        })
        .eq("id", orderId);

      if (fallbackCheckoutUpdate.error) {
        throw new Error(fallbackCheckoutUpdate.error.message);
      }
    }

    await appendOrderActivityLog(supabase, {
      orderId,
      actorId: user.id,
      source: "buyer",
      eventType: createdNewOrder ? "checkout_created" : "checkout_recreated",
      message: createdNewOrder ? "Hosted Stripe Checkout Session created for the order." : "Hosted Stripe Checkout Session recreated for an existing pending order.",
      metadata: {
        sessionId: checkoutSessionId,
        ...getPaymentActivityMetadata()
      }
    }).catch(() => undefined);

    revalidatePath("/buyer/dashboard");
    revalidatePath("/buyer/orders");
    revalidatePath(`/license-confirmation/${orderId}`);

    if (!session.url) {
      throw new Error("Stripe did not return a hosted checkout URL.");
    }

    await captureCheckoutStarted(user.id, orderId, trackId, selectedLicense.slug, session);
    redirect(session.url);
  } catch (checkoutError) {
    unstable_rethrow(checkoutError);
    await captureForUser(user.id, "funnel_step_failed", { step: "checkout", error_code: "checkout_failed", retryable: true });

    // Accepted legal evidence is retained even if preparation fails before the
    // provider call. Retry the original accepted quote; never delete its order.

    const creationUnconfirmed = checkoutCreationStarted && !checkoutSessionId;
    if (creationUnconfirmed) {
      await appendOrderActivityLog(supabase, {
        orderId,
        actorId: user.id,
        source: "system",
        eventType: "checkout_creation_unconfirmed",
        message: "Checkout creation could not be confirmed; pending order retained for reconciliation.",
        metadata: { requiresReconciliation: true, ...getPaymentActivityMetadata() }
      }).catch(() => undefined);
    }

    redirect(
      `/buyer/checkout/${trackSlug}?error=${encodeURIComponent(
        creationUnconfirmed
          ? "Checkout could not be confirmed. Your pending order was preserved. Check your purchases or contact support before trying again."
          : checkoutError instanceof Error ? checkoutError.message : "Unable to start Stripe checkout."
      )}`
    );
  }
}

export async function toggleFavoriteAction(formData: FormData) {
  const user = await requireBuyerUser();
  const trackId = String(formData.get("trackId") || "");
  const nextValue = String(formData.get("nextValue") || "");
  const revalidatePathname = String(formData.get("revalidatePathname") || "");

  if (!trackId) {
    return;
  }

  if (!hasSupabaseEnv || env.demoMode) {
    revalidatePath("/buyer/dashboard");
    revalidatePath("/buyer/favorites");
    revalidatePath("/buyer/catalog");
    if (/^\/buyer\/(?:catalog|favorites|artists)(?:\/[a-zA-Z0-9_-]+)?$/.test(revalidatePathname)) revalidatePath(revalidatePathname);
    return;
  }

  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(trackId) || !["true","false"].includes(nextValue)) return {error:"Invalid favorite selection."};
  const supabase = await createServerSupabaseClient();
  const {error}=await (supabase as unknown as {rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{error:unknown}>}).rpc("marketplace_set_favorite",{p_track:trackId,p_value:nextValue==="true"});
  if(error)return {error:"Unable to update this favorite. The track may no longer be available."};

  revalidatePath("/buyer/dashboard");
  revalidatePath("/buyer/favorites");
  revalidatePath("/buyer/catalog");
  if (/^\/buyer\/(?:catalog|favorites|artists)(?:\/[a-zA-Z0-9_-]+)?$/.test(revalidatePathname)) revalidatePath(revalidatePathname);
}

async function requireBuyerUser(): Promise<SessionUser> {
  if (!hasSupabaseEnv || env.demoMode) {
    const raw = (await cookies()).get("sync-exchange-session")?.value;
    if (!raw) {
      redirect("/login");
    }

    const user = JSON.parse(raw) as SessionUser;
    if (user.role !== "buyer") {
      redirect(resolveRoleRedirect(user.role));
    }

    return user;
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  const persistedProfileResult = await selectUserProfileCompat(supabase, user.id);
  const persistedProfile = persistedProfileResult.data as Pick<
    Database["public"]["Tables"]["user_profiles"]["Row"],
    "role" | "full_name"
  > | null;
  const role = persistedProfile?.role;
  if (role !== "buyer") {
    redirect(resolveRoleRedirect(role === "artist" || role === "admin" ? role : null));
  }

  return {
    id: user.id,
    email: user.email,
    role: "buyer",
    fullName: String(persistedProfile?.full_name || user.user_metadata?.full_name || user.email.split("@")[0])
  };
}
