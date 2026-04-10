"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env, hasSupabaseEnv } from "@/lib/env";
import { generateAgreementPlaceholder } from "@/lib/license";
import { createStripeCheckoutSession } from "@/services/stripe/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { resolveRoleRedirect } from "@/services/auth/session";
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

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    redirect(`/buyer/checkout/${trackSlug}?error=Supabase%20service%20role%20key%20is%20missing.`);
  }

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      buyer_user_id: user.id,
      track_id: trackId,
      license_type_id: licenseTypeId,
      amount_paid: amountPaid,
      currency: "USD",
      order_status: "pending",
      agreement_url: null
    })
    .select("id, amount_paid, currency")
    .single();

  if (error || !order) {
    redirect(`/buyer/checkout/${trackSlug}?error=${encodeURIComponent(error?.message || "Unable to create order.")}`);
  }

  if (!env.stripeSecretKey) {
    await supabase.from("orders").delete().eq("id", order.id);
    redirect(`/buyer/checkout/${trackSlug}?error=Stripe%20is%20not%20configured%20for%20this%20environment.`);
  }

  try {
    const session = await createStripeCheckoutSession({
      orderId: order.id,
      trackTitle: track.title,
      trackSlug: track.slug,
      licenseName: selectedLicense.name,
      amount: order.amount_paid,
      currency: order.currency,
      buyerEmail: user.email
    });

    await supabase
      .from("orders")
      .update({
        stripe_checkout_session_id: session.id
      })
      .eq("id", order.id);

    revalidatePath("/buyer/dashboard");
    revalidatePath("/buyer/orders");

    if (!session.url) {
      throw new Error("Stripe did not return a hosted checkout URL.");
    }

    redirect(session.url);
  } catch (checkoutError) {
    await supabase.from("orders").delete().eq("id", order.id);
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

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return;
  }

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

  const role = user.user_metadata?.role;
  if (role !== "buyer") {
    redirect(resolveRoleRedirect(role === "artist" || role === "buyer" || role === "admin" ? role : null));
  }

  return {
    id: user.id,
    email: user.email,
    role: "buyer",
    fullName: String(user.user_metadata?.full_name || user.email.split("@")[0])
  };
}
