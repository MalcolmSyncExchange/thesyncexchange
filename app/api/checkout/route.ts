import { NextResponse } from "next/server";

import { env, hasStripeEnv, hasSupabaseEnv } from "@/lib/env";
import { createStripeCheckoutSession } from "@/services/stripe/server";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import { isMissingColumnError, warnSchemaFallbackOnce } from "@/services/supabase/schema-compat";
import { createServerSupabaseClient } from "@/services/supabase/server";

export async function POST(request: Request) {
  const body = await request.json();
  const orderId = String(body.orderId || "");

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId." }, { status: 400 });
  }

  if (!hasSupabaseEnv || env.demoMode) {
    return NextResponse.json({ error: "Live checkout requires Supabase and demo mode disabled." }, { status: 400 });
  }

  const authSupabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await authSupabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createPrivilegedSupabaseClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      `
        id,
        buyer_user_id,
        track_id,
        license_type_id,
        amount_cents,
        currency,
        status,
        tracks (
          title,
          slug
        ),
        license_types (
          name
        )
      `
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order || (order as any).buyer_user_id !== user.id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if ((order as any).status !== "pending") {
    return NextResponse.json({ error: "Only pending orders can create a new checkout session." }, { status: 409 });
  }

  const [{ data: track }, { data: licenseOption }] = await Promise.all([
    supabase.from("tracks").select("status").eq("id", String((order as any).track_id || "")).maybeSingle(),
    supabase
      .from("track_license_options")
      .select("active")
      .eq("track_id", String((order as any).track_id || ""))
      .eq("license_type_id", String((order as any).license_type_id || ""))
      .maybeSingle()
  ]);

  if (track?.status !== "approved") {
    return NextResponse.json({ error: "This track is no longer approved for checkout." }, { status: 409 });
  }

  if (licenseOption?.active === false || !licenseOption) {
    return NextResponse.json({ error: "This license option is no longer active for checkout." }, { status: 409 });
  }

  if (!hasStripeEnv) {
    return NextResponse.json({ error: "Stripe is not configured for this environment." }, { status: 503 });
  }

  const session = await createStripeCheckoutSession({
    orderId,
    trackTitle: (order as any).tracks?.title || "The Sync Exchange License",
    trackSlug: (order as any).tracks?.slug || "catalog",
    licenseName: (order as any).license_types?.name || "License",
    amountCents: Number((order as any).amount_cents || 0),
    currency: String((order as any).currency || "USD"),
    buyerEmail: user.email || undefined,
    buyerUserId: user.id,
    trackId: String((order as any).track_id || ""),
    licenseTypeId: String((order as any).license_type_id || "")
  });

  const checkoutCreatedAt = new Date().toISOString();
  const primaryUpdate = await supabase
    .from("orders")
    .update({
      stripe_checkout_session_id: session.id,
      checkout_created_at: checkoutCreatedAt
    })
    .eq("id", orderId);

  if (primaryUpdate.error) {
    if (!isMissingColumnError(primaryUpdate.error, "checkout_created_at")) {
      return NextResponse.json({ error: primaryUpdate.error.message }, { status: 500 });
    }

    warnSchemaFallbackOnce(
      "checkout-created-at-write",
      "checkout_created_at is not available yet; order checkout timing will be reduced until migration 0009 is applied.",
      primaryUpdate.error
    );

    const fallbackUpdate = await supabase
      .from("orders")
      .update({
        stripe_checkout_session_id: session.id
      })
      .eq("id", orderId);

    if (fallbackUpdate.error) {
      return NextResponse.json({ error: fallbackUpdate.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    url: session.url,
    orderId,
    sessionId: session.id
  });
}
