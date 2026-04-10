import Stripe from "stripe";

import { env } from "@/lib/env";
import { generateAgreementArtifactForOrder } from "@/services/agreements/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import type { Database } from "@/types/database";

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
  amountCents,
  currency,
  buyerEmail
}: {
  orderId: string;
  trackTitle: string;
  trackSlug: string;
  licenseName: string;
  amountCents: number;
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
          unit_amount: Math.round(amountCents),
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

  const { data: existingOrder, error: existingOrderError } = await supabase
    .from("orders")
    .select(
      "id, status, stripe_checkout_session_id, stripe_payment_intent_id, agreement_url, checkout_created_at, paid_at, agreement_generated_at, fulfilled_at, refunded_at"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (existingOrderError) {
    throw new Error(existingOrderError.message);
  }

  if (!existingOrder) {
    throw new Error("Order not found for Stripe fulfillment.");
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;
  const paidAt = session.payment_status === "paid" ? existingOrder.paid_at || stripeTimestampToIso(session.created) : existingOrder.paid_at;
  const orderStatus =
    existingOrder.status === "fulfilled" || existingOrder.status === "refunded"
      ? existingOrder.status
      : session.payment_status === "paid"
        ? "paid"
        : existingOrder.status;

  const { data, error } = await supabase
    .from("orders")
    .update({
      stripe_checkout_session_id: existingOrder.stripe_checkout_session_id || session.id,
      stripe_payment_intent_id: existingOrder.stripe_payment_intent_id || paymentIntentId,
      checkout_created_at: existingOrder.checkout_created_at || stripeTimestampToIso(session.created),
      paid_at: paidAt,
      status: orderStatus
    })
    .eq("id", orderId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (
    session.payment_status === "paid" &&
    existingOrder.status !== "refunded" &&
    !existingOrder.agreement_generated_at &&
    !existingOrder.agreement_url
  ) {
    await generateAgreementArtifactForOrder(orderId);
  }

  return data as Database["public"]["Tables"]["orders"]["Row"] | null;
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

  const refundedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "refunded",
      refunded_at: refundedAt
    })
    .eq("stripe_payment_intent_id", paymentIntentId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as Pick<Database["public"]["Tables"]["orders"]["Row"], "id"> | null;
}

function stripeTimestampToIso(timestamp?: number | null) {
  if (!timestamp) {
    return new Date().toISOString();
  }

  return new Date(timestamp * 1000).toISOString();
}
