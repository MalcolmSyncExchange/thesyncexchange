"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env, hasSupabaseEnv } from "@/lib/env";
import { generateAgreementPlaceholder } from "@/lib/license";
import { createStripeCheckoutSession } from "@/services/stripe/server";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { resolveRoleRedirect } from "@/services/auth/session";
import type { Database } from "@/types/database";
import type { SessionUser } from "@/types/models";
import { getBuyerTrackBySlug } from "@/services/buyer/queries";

export async function createOrderAction(formData: FormData) {
  const user = await requireBuyerUser();
  const trackId = String(formData.get("trackId") || "");
  const trackSlug = String(formData.get("trackSlug") || "");
  const licenseSelection = String(formData.get("licenseSelection") || "");
  const [licenseTypeId] = licenseSelection.split("|");

  if (!trackId || !trackSlug || !licenseTypeId) {
    redirect(`/buyer/checkout/${trackSlug}?error=Missing%20checkout%20details.`);
  }

  const track = await getBuyerTrackBySlug(trackSlug, user.id);
  if (!track || track.id !== trackId) {
    redirect(`/buyer/catalog?error=Track%20selection%20is%20no%20longer%20available.`);
  }

  const selectedLicense = track.license_options.find((option) => option.id === licenseTypeId);
  if (!selectedLicense) {
    redirect(`/buyer/checkout/${trackSlug}?error=Selected%20license%20option%20is%20not%20available.`);
  }

  const amountPaid = selectedLicense.price_override || selectedLicense.base_price;

  if (!hasSupabaseEnv || env.demoMode) {
    const orderId = `ord_demo_${Date.now()}`;
    const agreement = generateAgreementPlaceholder(orderId, trackId, licenseTypeId);
    redirect(agreement.agreementUrl + `?trackId=${encodeURIComponent(trackId)}&licenseTypeId=${encodeURIComponent(licenseTypeId)}`);
  }

  if (!env.stripeSecretKey) {
    redirect(`/buyer/checkout/${trackSlug}?error=Stripe%20is%20not%20configured%20for%20this%20environment.`);
  }

  const supabase = createPrivilegedSupabaseClient();
  const orderId = crypto.randomUUID();
  const amountCents = Math.round(amountPaid * 100);
  let checkoutSessionId: string | null = null;

  try {
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        id: orderId,
        buyer_user_id: user.id,
        track_id: trackId,
        license_type_id: licenseTypeId,
        amount_cents: amountCents,
        currency: "USD",
        status: "pending",
        agreement_url: null
      })
      .select("id")
      .single();

    if (error || !order) {
      throw new Error(error?.message || "Unable to create order.");
    }

    const session = await createStripeCheckoutSession({
      orderId,
      trackTitle: track.title,
      trackSlug: track.slug,
      licenseName: selectedLicense.name,
      amountCents,
      currency: "USD",
      buyerEmail: user.email
    });
    checkoutSessionId = session.id;

    const checkoutCreatedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        stripe_checkout_session_id: checkoutSessionId,
        checkout_created_at: checkoutCreatedAt
      })
      .eq("id", orderId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidatePath("/buyer/dashboard");
    revalidatePath("/buyer/orders");
    revalidatePath(`/license-confirmation/${orderId}`);

    if (!session.url) {
      throw new Error("Stripe did not return a hosted checkout URL.");
    }

    redirect(session.url);
  } catch (checkoutError) {
    if (!checkoutSessionId) {
      await supabase.from("orders").delete().eq("id", orderId);
    }

    redirect(
      `/buyer/checkout/${trackSlug}?error=${encodeURIComponent(
        checkoutError instanceof Error ? checkoutError.message : "Unable to start Stripe checkout."
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
    if (revalidatePathname) revalidatePath(revalidatePathname);
    return;
  }

  const supabase = createPrivilegedSupabaseClient();

  if (nextValue === "true") {
    await supabase.from("favorites").upsert(
      {
        buyer_user_id: user.id,
        track_id: trackId
      },
      { onConflict: "buyer_user_id,track_id" }
    );
  } else {
    await supabase.from("favorites").delete().eq("buyer_user_id", user.id).eq("track_id", trackId);
  }

  revalidatePath("/buyer/dashboard");
  revalidatePath("/buyer/favorites");
  revalidatePath("/buyer/catalog");
  if (revalidatePathname) revalidatePath(revalidatePathname);
}

async function requireBuyerUser(): Promise<SessionUser> {
  if (!hasSupabaseEnv || env.demoMode) {
    const raw = cookies().get("sync-exchange-session")?.value;
    if (!raw) {
      redirect("/login");
    }

    const user = JSON.parse(raw) as SessionUser;
    if (user.role !== "buyer") {
      redirect(resolveRoleRedirect(user.role));
    }

    return user;
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  const { data: persistedProfile } = (await supabase
    .from("user_profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle()) as {
    data: Pick<Database["public"]["Tables"]["user_profiles"]["Row"], "role" | "full_name"> | null;
  };
  const role = persistedProfile?.role || user.user_metadata?.role;
  if (role !== "buyer") {
    redirect(resolveRoleRedirect(role === "artist" || role === "buyer" || role === "admin" ? role : null));
  }

  return {
    id: user.id,
    email: user.email,
    role: "buyer",
    fullName: String(persistedProfile?.full_name || user.user_metadata?.full_name || user.email.split("@")[0])
  };
}
