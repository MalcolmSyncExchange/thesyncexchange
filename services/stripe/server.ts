import Stripe from "stripe";

import { env } from "@/lib/env";
import { generateAgreementArtifactForOrder } from "@/services/agreements/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";

let stripeClient: Stripe | null = null;

export function getStripeServerClient() {
  if (!env.stripeSecretKey) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(env.stripeSecretKey, {
      apiVersion: "2024-06-20"
    });
  }

  return stripeClient;
}

export function getOrderConfirmationUrl(orderId: string) {
  return `${env.appUrl}/license-confirmation/${orderId}`;
}

export async function createStripeCheckoutSession({
  orderId,
  trackTitle,
  trackSlug,
  licenseName,
  amount,
  currency,
  buyerEmail
}: {
  orderId: string;
  trackTitle: string;
  trackSlug: string;
  licenseName: string;
  amount: number;
  currency: string;
  buyerEmail?: string;
}) {
  const stripe = getStripeServerClient();
  if (!stripe) {
    throw new Error("Stripe secret key is not configured.");
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: orderId,
    customer_email: buyerEmail,
    metadata: {
      orderId,
      trackSlug,
      licenseName
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: Math.round(amount * 100),
          product_data: {
            name: `${trackTitle} - ${licenseName}`,
            description: "The Sync Exchange hosted sync licensing checkout."
          }
        }
      }
    ],
    payment_intent_data: {
      metadata: {
        orderId
      }
    },
    success_url: `${getOrderConfirmationUrl(orderId)}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.appUrl}/buyer/checkout/${trackSlug}?error=${encodeURIComponent("Checkout was canceled before payment was completed.")}`
  });
}

export async function syncOrderFromStripeSession({
  orderId,
  session
}: {
  orderId: string;
  session: Stripe.Checkout.Session;
}) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return null;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;
  const orderStatus = session.payment_status === "paid" ? "paid" : "pending";

  const { data, error } = await supabase
    .from("orders")
    .update({
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      order_status: orderStatus
    })
    .eq("id", orderId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (orderStatus === "paid") {
    await generateAgreementArtifactForOrder(orderId);
  }

  return data;
}

export async function syncOrderFromStripeSessionId(orderId: string, sessionId: string) {
  const stripe = getStripeServerClient();
  if (!stripe) {
    return null;
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return syncOrderFromStripeSession({ orderId, session });
}

export async function markOrderRefundedByPaymentIntent(paymentIntentId: string) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("orders")
    .update({
      order_status: "refunded"
    })
    .eq("stripe_payment_intent_id", paymentIntentId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
