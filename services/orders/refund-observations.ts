import "server-only";
import type Stripe from "stripe";
import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { serverEnv, assertStripeRuntimeObject } from "@/lib/server-env";
export async function retainRefundObservation(event: Stripe.Event, evidenceSha256: string, providerCreatedAt: string) {
  const refund = event.data.object as Stripe.Refund;
  assertStripeRuntimeObject("Refund evidence", { livemode: event.livemode });
  if (event.account != null || !["refund.created", "refund.updated", "refund.failed"].includes(event.type)) throw Error("Unsupported refund evidence.");
  const client = createAdminSupabaseClient(); if (!client || !serverEnv.stripeSecretKey) throw Error("Refund evidence unavailable.");
  const intent = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
  const { error } = await (client as unknown as { rpc(name: string, args: object): PromiseLike<{ error: unknown }> }).rpc("record_checkout_refund_observation", {
    p_scope: createHash("sha256").update(serverEnv.stripeSecretKey).digest("hex") + ":test",
    p_evidence: { providerEventId: event.id, eventType: event.type, refundId: refund.id, paymentIntentId: intent, amountMinor: refund.amount,
      currency: refund.currency.toUpperCase(), status: refund.status, evidenceSha256, providerCreatedAt, livemode: event.livemode }
  });
  if (error) throw Error("Refund evidence requires reconciliation.");
}
