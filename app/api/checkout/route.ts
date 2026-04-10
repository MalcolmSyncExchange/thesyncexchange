import { NextResponse } from "next/server";

import { env, hasStripeEnv, hasSupabaseEnv } from "@/lib/env";
import { createStripeCheckoutSession } from "@/services/stripe/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
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

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role key is missing." }, { status: 500 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select(
      `
        id,
        buyer_user_id,
        amount_paid,
        currency,
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

  if (!hasStripeEnv) {
    return NextResponse.json({ error: "Stripe is not configured for this environment." }, { status: 503 });
  }

  const session = await createStripeCheckoutSession({
    orderId,
    trackTitle: (order as any).tracks?.title || "The Sync Exchange License",
    trackSlug: (order as any).tracks?.slug || "catalog",
    licenseName: (order as any).license_types?.name || "License",
    amount: Number((order as any).amount_paid || 0),
    currency: String((order as any).currency || "USD"),
    buyerEmail: user.email || undefined
  });

  await supabase
    .from("orders")
    .update({
      stripe_checkout_session_id: session.id
    })
    .eq("id", orderId);

  return NextResponse.json({
    url: session.url,
    orderId,
    sessionId: session.id
  });
}
