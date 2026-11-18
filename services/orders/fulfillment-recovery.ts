import type { AppSupabaseClient } from "@/services/supabase/types";
import { createHash } from "node:crypto";
import type { VerifiedStripePaymentEvidence } from "@/services/purchase-completion/server";
type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export async function fulfillmentRecoveryRpc(client: AppSupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await (client as unknown as RpcClient).rpc(name, args);
  if (error) throw new Error("Payment fulfillment requires reconciliation.");
  return data;
}
export async function holdCheckoutOrder(client: AppSupabaseClient, orderId: string, reason: "payment_failed" | "refund" | "refund_full" | "dispute") {
  await fulfillmentRecoveryRpc(client, "hold_checkout_order", { p_order: orderId, p_reason: reason });
}
export async function retainVerifiedCheckoutPayment(client: AppSupabaseClient, orderId: string, evidence: VerifiedStripePaymentEvidence, secretKey: string) {
  if (evidence.livemode) throw new Error("Recovery evidence currently accepts TEST payments only.");
  const scope = createHash("sha256").update(secretKey).digest("hex") + ":test";
  if (evidence.paymentState !== "PAID") await retainAdverseCheckoutPayment(client, evidence, secretKey);
  await fulfillmentRecoveryRpc(client, "record_verified_checkout_payment", { p_order: orderId, p_scope: scope, p_evidence: evidence });
}
export async function retainAdverseCheckoutPayment(client: AppSupabaseClient, evidence: VerifiedStripePaymentEvidence, secretKey: string) {
  if (evidence.livemode || evidence.paymentState === "PAID") throw new Error("TEST adverse payment evidence required.");
  const scope = createHash("sha256").update(secretKey).digest("hex") + ":test";
  await fulfillmentRecoveryRpc(client, "record_checkout_adverse_event", { p_scope: scope, p_evidence: evidence });
}
