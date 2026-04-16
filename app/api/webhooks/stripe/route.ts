import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { env, hasStripeEnv } from "@/lib/env";
import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
import {
  getStripeServerClient,
  markOrderRefundedByPaymentIntent,
  syncOrderFromStripeSession
} from "@/services/stripe/server";

export async function POST(request: Request) {
  if (!hasStripeEnv || !env.stripeWebhookSecret) {
    return NextResponse.json({
      received: false,
      note: "Stripe webhook is inactive until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are configured."
    });
  }

  const stripe = getStripeServerClient();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe client is unavailable." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
  } catch (error) {
    console.warn("[stripe webhook] signature verification failed", error instanceof Error ? error.message : error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to verify Stripe webhook signature."
      },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.client_reference_id || session.metadata?.orderId;

        reportOperationalEvent("stripe_checkout_session_completed", "Stripe checkout completion received.", {
          sessionId: session.id,
          orderId: orderId || null,
          paymentStatus: session.payment_status
        });

        if (orderId) {
          await syncOrderFromStripeSession({
            orderId,
            session,
            webhookEventId: event.id,
            webhookEventType: event.type
          });
          revalidateBuyerOrderPaths(orderId);
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id || "";

        if (paymentIntentId) {
          const order = await markOrderRefundedByPaymentIntent(paymentIntentId, event.id, event.type);
          reportOperationalEvent("stripe_charge_refunded", "Stripe refund received.", {
            paymentIntentId,
            orderId: order?.id || null
          });
          revalidateBuyerOrderPaths(order?.id);
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    reportOperationalError("stripe_webhook_processing_failed", error, {
      eventId: event.id,
      eventType: event.type
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Stripe webhook fulfillment failed."
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

function revalidateBuyerOrderPaths(orderId?: string | null) {
  revalidatePath("/buyer/dashboard");
  revalidatePath("/buyer/orders");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/orders");
  if (orderId) {
    revalidatePath(`/license-confirmation/${orderId}`);
  }
}
