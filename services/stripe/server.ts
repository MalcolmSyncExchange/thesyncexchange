import Stripe from "stripe";

import { env } from "@/lib/env";
import { assertStripeServerConfiguration, serverEnv } from "@/lib/server-env";
import { appendOrderActivityLog, hasProcessedOrderDedupeKey } from "@/services/orders/activity";
import { generateAgreementArtifactForOrder } from "@/services/agreements/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { isMissingColumnError, warnSchemaFallbackOnce } from "@/services/supabase/schema-compat";
import type { Database } from "@/types/database";

let stripeClient: Stripe | null = null;

type StripeSyncOrderRow = Pick<
  Database["public"]["Tables"]["orders"]["Row"],
  | "id"
  | "status"
  | "stripe_checkout_session_id"
  | "stripe_payment_intent_id"
  | "agreement_url"
  | "agreement_path"
  | "checkout_created_at"
  | "paid_at"
  | "agreement_generated_at"
  | "fulfilled_at"
  | "refunded_at"
>;

export function getStripeServerClient() {
  if (!serverEnv.stripeSecretKey) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(serverEnv.stripeSecretKey, {
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
  buyerEmail,
  buyerUserId,
  trackId,
  licenseTypeId
}: {
  orderId: string;
  trackTitle: string;
  trackSlug: string;
  licenseName: string;
  amountCents: number;
  currency: string;
  buyerEmail?: string;
  buyerUserId?: string;
  trackId?: string;
  licenseTypeId?: string;
}) {
  assertStripeServerConfiguration("Stripe checkout", { requireWebhook: true });
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
      licenseName,
      buyerUserId: buyerUserId || "",
      trackId: trackId || "",
      licenseTypeId: licenseTypeId || ""
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
  session,
  webhookEventId,
  webhookEventType
}: {
  orderId: string;
  session: Stripe.Checkout.Session;
  webhookEventId?: string | null;
  webhookEventType?: string | null;
}) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return null;
  }

  if (webhookEventId && (await hasProcessedOrderDedupeKey(supabase, webhookEventId))) {
    const { data: existingOrder } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
    return existingOrder as Database["public"]["Tables"]["orders"]["Row"] | null;
  }

  const processedAt = new Date().toISOString();
  const sessionOrderId = session.client_reference_id || session.metadata?.orderId || null;

  if (sessionOrderId && sessionOrderId !== orderId) {
    throw new Error("Checkout session does not belong to the requested order.");
  }

  try {
    const existingOrder = await loadOrderForStripeSync(supabase, orderId);
    if (!existingOrder) {
      throw new Error("Order not found for Stripe fulfillment.");
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || null;
    const paidAt =
      session.payment_status === "paid"
        ? existingOrder.paid_at || stripeTimestampToIso(session.created)
        : existingOrder.paid_at;
    const orderStatus =
      existingOrder.status === "fulfilled" || existingOrder.status === "refunded"
        ? existingOrder.status
        : session.payment_status === "paid"
          ? "paid"
          : existingOrder.status;

    const data = await persistStripeSyncState(supabase, orderId, {
      stripe_checkout_session_id: existingOrder.stripe_checkout_session_id || session.id,
      stripe_payment_intent_id: existingOrder.stripe_payment_intent_id || paymentIntentId,
      checkout_created_at: existingOrder.checkout_created_at || stripeTimestampToIso(session.created),
      paid_at: paidAt,
      status: orderStatus,
      last_webhook_event_id: webhookEventId || existingOrder.stripe_checkout_session_id || session.id,
      last_webhook_event_type: webhookEventType || "checkout.session.completed",
      last_webhook_processed_at: processedAt,
      last_webhook_error: null
    });

    await appendOrderActivityLog(supabase, {
      orderId,
      source: "stripe_webhook",
      eventType: webhookEventType || "checkout.session.completed",
      message: `Stripe reported ${session.payment_status} for checkout session ${session.id}.`,
      metadata: {
        sessionId: session.id,
        paymentStatus: session.payment_status,
        paymentIntentId
      },
      dedupeKey: webhookEventId || null
    }).catch(() => undefined);

    if (
      session.payment_status === "paid" &&
      existingOrder.status !== "refunded" &&
      !existingOrder.agreement_generated_at &&
      !existingOrder.agreement_path
    ) {
      await generateAgreementArtifactForOrder(orderId);
    }

    return data as Database["public"]["Tables"]["orders"]["Row"] | null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe fulfillment failed.";

    await persistStripeWebhookFailure(supabase, orderId, {
      last_webhook_event_id: webhookEventId || null,
      last_webhook_event_type: webhookEventType || "checkout.session.completed",
      last_webhook_processed_at: processedAt,
      last_webhook_error: message
    });

    await appendOrderActivityLog(supabase, {
      orderId,
      source: "stripe_webhook",
      eventType: "webhook_processing_failed",
      message,
      metadata: {
        webhookEventId,
        webhookEventType
      },
      dedupeKey: webhookEventId ? `${webhookEventId}:failure` : null
    }).catch(() => undefined);

    throw error;
  }
}

export async function syncOrderFromStripeSessionId(orderId: string, sessionId: string) {
  assertStripeServerConfiguration("Stripe order synchronization", { requireWebhook: true });
  const stripe = getStripeServerClient();
  if (!stripe) {
    return null;
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const sessionOrderId = session.client_reference_id || session.metadata?.orderId || null;
  if (sessionOrderId && sessionOrderId !== orderId) {
    throw new Error("Checkout session does not belong to the requested order.");
  }
  return syncOrderFromStripeSession({ orderId, session });
}

export async function markOrderCheckoutSessionPaymentFailed({
  orderId,
  session,
  webhookEventId,
  webhookEventType
}: {
  orderId: string;
  session: Stripe.Checkout.Session;
  webhookEventId?: string | null;
  webhookEventType?: string | null;
}) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return null;
  }

  if (webhookEventId && (await hasProcessedOrderDedupeKey(supabase, webhookEventId))) {
    const { data: existingOrder } = await supabase.from("orders").select("id, status").eq("id", orderId).maybeSingle();
    return existingOrder as Pick<Database["public"]["Tables"]["orders"]["Row"], "id" | "status"> | null;
  }

  const message = `Stripe reported that checkout session ${session.id} failed to complete payment.`;
  const processedAt = new Date().toISOString();

  await persistStripeWebhookFailure(supabase, orderId, {
    last_webhook_event_id: webhookEventId || null,
    last_webhook_event_type: webhookEventType || "checkout.session.async_payment_failed",
    last_webhook_processed_at: processedAt,
    last_webhook_error: message
  });

  await appendOrderActivityLog(supabase, {
    orderId,
    source: "stripe_webhook",
    eventType: webhookEventType || "checkout.session.async_payment_failed",
    message,
    metadata: {
      sessionId: session.id,
      paymentStatus: session.payment_status
    },
    dedupeKey: webhookEventId || null
  }).catch(() => undefined);

  const { data } = await supabase.from("orders").select("id, status").eq("id", orderId).maybeSingle();
  return data as Pick<Database["public"]["Tables"]["orders"]["Row"], "id" | "status"> | null;
}

export async function markOrderRefundedByPaymentIntent(
  paymentIntentId: string,
  webhookEventId?: string | null,
  webhookEventType?: string | null
) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return null;
  }

  if (webhookEventId && (await hasProcessedOrderDedupeKey(supabase, webhookEventId))) {
    const { data } = await supabase.from("orders").select("id").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
    return data as Pick<Database["public"]["Tables"]["orders"]["Row"], "id"> | null;
  }

  const refundedAt = new Date().toISOString();
  const data = await persistRefundState(supabase, paymentIntentId, {
    status: "refunded",
    refunded_at: refundedAt,
    last_webhook_event_id: webhookEventId || null,
    last_webhook_event_type: webhookEventType || "charge.refunded",
    last_webhook_processed_at: refundedAt,
    last_webhook_error: null
  });

  if (data?.id) {
    await appendOrderActivityLog(supabase, {
      orderId: data.id,
      source: "stripe_webhook",
      eventType: webhookEventType || "charge.refunded",
      message: `Stripe reported a refund for payment intent ${paymentIntentId}.`,
      metadata: {
        paymentIntentId
      },
      dedupeKey: webhookEventId || null
    }).catch(() => undefined);
  }

  return data as Pick<Database["public"]["Tables"]["orders"]["Row"], "id"> | null;
}

function stripeTimestampToIso(timestamp?: number | null) {
  if (!timestamp) {
    return new Date().toISOString();
  }

  return new Date(timestamp * 1000).toISOString();
}

async function loadOrderForStripeSync(
  supabase: NonNullable<ReturnType<typeof createAdminSupabaseClient>>,
  orderId: string
) {
  const primary = await supabase
    .from("orders")
    .select(
      "id, status, stripe_checkout_session_id, stripe_payment_intent_id, agreement_url, agreement_path, checkout_created_at, paid_at, agreement_generated_at, fulfilled_at, refunded_at"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!primary.error) {
    return primary.data as StripeSyncOrderRow | null;
  }

  if (!isMissingColumnError(primary.error, "agreement_path")) {
    throw new Error(primary.error.message);
  }

  warnSchemaFallbackOnce(
    "stripe-order-read",
    "Order fulfillment metadata columns are not available yet; Stripe sync is using reduced persistence until migration 0010 is applied.",
    primary.error
  );

  const fallback = await supabase
    .from("orders")
    .select("id, status, stripe_checkout_session_id, stripe_payment_intent_id, agreement_url, checkout_created_at, paid_at, agreement_generated_at, fulfilled_at, refunded_at")
    .eq("id", orderId)
    .maybeSingle();

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return fallback.data
    ? ({
        ...fallback.data,
        agreement_path: null
      } as StripeSyncOrderRow)
    : null;
}

async function persistStripeSyncState(
  supabase: NonNullable<ReturnType<typeof createAdminSupabaseClient>>,
  orderId: string,
  values: Database["public"]["Tables"]["orders"]["Update"]
) {
  const primary = await supabase.from("orders").update(values).eq("id", orderId).select("*").maybeSingle();

  if (!primary.error) {
    return primary.data as Database["public"]["Tables"]["orders"]["Row"] | null;
  }

  if (!isMissingColumnError(primary.error, ["last_webhook_event_id", "agreement_path"])) {
    throw new Error(primary.error.message);
  }

  warnSchemaFallbackOnce(
    "stripe-order-write",
    "Order fulfillment metadata columns are not available yet; Stripe sync will skip webhook metadata until migration 0010 is applied.",
    primary.error
  );

  const {
    last_webhook_event_id: _skipEventId,
    last_webhook_event_type: _skipEventType,
    last_webhook_processed_at: _skipProcessedAt,
    last_webhook_error: _skipWebhookError,
    ...fallbackValues
  } = values;

  const fallback = await supabase.from("orders").update(fallbackValues).eq("id", orderId).select("*").maybeSingle();
  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return fallback.data as Database["public"]["Tables"]["orders"]["Row"] | null;
}

async function persistStripeWebhookFailure(
  supabase: NonNullable<ReturnType<typeof createAdminSupabaseClient>>,
  orderId: string,
  values: Pick<
    Database["public"]["Tables"]["orders"]["Update"],
    "last_webhook_event_id" | "last_webhook_event_type" | "last_webhook_processed_at" | "last_webhook_error"
  >
) {
  const primary = await supabase.from("orders").update(values).eq("id", orderId);
  if (!primary.error) {
    return;
  }

  if (!isMissingColumnError(primary.error, "last_webhook_event_id")) {
    throw new Error(primary.error.message);
  }

  warnSchemaFallbackOnce(
    "stripe-webhook-failure-write",
    "Stripe webhook failure metadata columns are not available yet; failures will only appear in logs until migration 0010 is applied.",
    primary.error
  );
}

async function persistRefundState(
  supabase: NonNullable<ReturnType<typeof createAdminSupabaseClient>>,
  paymentIntentId: string,
  values: Database["public"]["Tables"]["orders"]["Update"]
) {
  const primary = await supabase
    .from("orders")
    .update(values)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .select("id")
    .maybeSingle();

  if (!primary.error) {
    return primary.data as Pick<Database["public"]["Tables"]["orders"]["Row"], "id"> | null;
  }

  if (!isMissingColumnError(primary.error, "last_webhook_event_id")) {
    throw new Error(primary.error.message);
  }

  warnSchemaFallbackOnce(
    "stripe-refund-write",
    "Order webhook metadata columns are not available yet; refund syncing will persist status without webhook details until migration 0010 is applied.",
    primary.error
  );

  const {
    last_webhook_event_id: _skipEventId,
    last_webhook_event_type: _skipEventType,
    last_webhook_processed_at: _skipProcessedAt,
    last_webhook_error: _skipWebhookError,
    ...fallbackValues
  } = values;

  const fallback = await supabase
    .from("orders")
    .update(fallbackValues)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .select("id")
    .maybeSingle();

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return fallback.data as Pick<Database["public"]["Tables"]["orders"]["Row"], "id"> | null;
}
