import { NextResponse } from "next/server";

import { env, hasSupabaseEnv } from "@/lib/env";
import { assertStripeServerConfiguration } from "@/lib/server-env";
import { appendOrderActivityLog } from "@/services/orders/activity";
import { getStoredOrderPricingMismatch, loadTrustedCheckoutDetails } from "@/services/orders/checkout-pricing";
import { createStripeCheckoutSession } from "@/services/stripe/server";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import { isMissingColumnError, warnSchemaFallbackOnce } from "@/services/supabase/schema-compat";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { consumeRateLimit, rateLimitErrorResponse } from "@/services/security/rate-limit";

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

  const profile = await selectUserProfileCompat(authSupabase, user.id);
  if (profile.error) {
    return NextResponse.json({ error: "Unable to verify account access right now." }, { status: 503 });
  }
  if (profile.data?.role !== "buyer") {
    return NextResponse.json({ error: "Buyer access is required." }, { status: 403 });
  }

  const supabase = createPrivilegedSupabaseClient();

  let trustedCheckout;
  try {
    trustedCheckout = await loadTrustedCheckoutDetails(supabase, orderId);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to validate this checkout."
      },
      { status: 409 }
    );
  }

  if (!trustedCheckout || trustedCheckout.order.buyer_user_id !== user.id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (trustedCheckout.order.status !== "pending") {
    return NextResponse.json({ error: "Only pending orders can create a new checkout session." }, { status: 409 });
  }

  try {
    assertStripeServerConfiguration("Stripe checkout API", { requireWebhook: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Stripe is not configured for this environment."
      },
      { status: 503 }
    );
  }

  const admission = await consumeRateLimit("checkout", user.id);
  const limitedResponse = rateLimitErrorResponse(admission);
  if (limitedResponse) return limitedResponse;

  const pricingMismatch = getStoredOrderPricingMismatch(trustedCheckout);
  if (pricingMismatch.amountMismatch || pricingMismatch.currencyMismatch) {
    const correction = await supabase
      .from("orders")
      .update({
        amount_cents: trustedCheckout.amountCents,
        currency: trustedCheckout.currency
      })
      .eq("id", orderId)
      .eq("status", "pending");

    if (correction.error) {
      return NextResponse.json({ error: correction.error.message }, { status: 500 });
    }

    await appendOrderActivityLog(supabase, {
      orderId,
      actorId: user.id,
      source: "system",
      eventType: "checkout_price_reconciled",
      message: "Pending order price was reconciled to the trusted license price before checkout.",
      metadata: pricingMismatch
    }).catch(() => undefined);
  }

  const session = await createStripeCheckoutSession({
    orderId,
    trackTitle: trustedCheckout.trackTitle,
    trackSlug: trustedCheckout.trackSlug,
    licenseName: trustedCheckout.licenseName,
    amountCents: trustedCheckout.amountCents,
    currency: trustedCheckout.currency,
    buyerEmail: user.email || undefined,
    buyerUserId: user.id,
    trackId: trustedCheckout.order.track_id,
    licenseTypeId: trustedCheckout.order.license_type_id
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

  await appendOrderActivityLog(supabase, {
    orderId,
    actorId: user.id,
    source: "buyer",
    eventType: "checkout_created_via_api",
    message: "Hosted Stripe Checkout Session created through the checkout API route.",
    metadata: {
      sessionId: session.id
    }
  }).catch(() => undefined);

  return NextResponse.json({
    url: session.url,
    orderId,
    sessionId: session.id
  });
}
