import "server-only";
import { assertStripeRuntimeObject, getPurchaseCompletionAdapterConfiguration } from "@/lib/server-env";
import type Stripe from "stripe";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { analyticsConfig, enqueueEvent } from "./server";

// Only the signature-verified webhook route calls this. Never call from a return page.
export async function recordVerifiedPurchase(orderId: string, session: Stripe.Checkout.Session, providerEventId: string) {
  if (!analyticsConfig() || session.payment_status !== "paid") return;
  // A disabled adapter returns successfully without persisting evidence. Do not count it.
  const adapter = getPurchaseCompletionAdapterConfiguration();
  if (!adapter.enabled || !adapter.providerAccount) return;
  assertStripeRuntimeObject("Analytics verified purchase", { livemode: session.livemode, checkoutSessionId: session.id });
  const db = createAdminSupabaseClient();
  if (!db) throw new Error("analytics_unavailable");
  // The signed event has already been persisted by purchase completion. Read its
  // frozen contract, never today's catalog pricing, eligibility or license data.
  const { data, error } = await db.rpc("get_analytics_verified_purchase", {
    p_order_id: orderId, p_provider_account: adapter.providerAccount, p_provider_event_id: providerEventId
  }).abortSignal(AbortSignal.timeout(3000));
  const proof = data?.[0];
  if (error || !proof) throw new Error("analytics_purchase_not_persisted");
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (proof.order_id !== orderId || proof.checkout_session_id !== session.id || proof.payment_intent_id !== paymentIntentId ||
      (session.client_reference_id || session.metadata?.orderId) !== orderId ||
      proof.amount_minor !== session.amount_total || proof.currency !== session.currency?.toUpperCase() ||
      proof.payment_mode !== "test" || session.livemode !== false) throw new Error("analytics_purchase_evidence_mismatch");
  const license = proof.license_type;
  if (license !== "digital-campaign" && license !== "broadcast" && license !== "exclusive-buyout") throw new Error("analytics_license_invalid");
  await enqueueEvent({ id: proof.buyer_user_id, role: "buyer" }, "purchase_verified", {
    order_id: proof.order_id, track_id: proof.track_id, license_type: license, payment_mode: proof.payment_mode
  }, `purchase:${orderId}`);
  // Null means privacy disabled/declined; explicit collector/worker owns recovery and HTTP delivery.
}
