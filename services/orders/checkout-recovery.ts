import { createHash } from "node:crypto";
import type Stripe from "stripe";
import type { AppSupabaseClient } from "@/services/supabase/types";
import { assertAcceptedPurchase } from "@/services/licensing/purchases";

type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
async function rpc(client: AppSupabaseClient, name: string, args: Record<string, unknown>) {
  const result = await (client as unknown as RpcClient).rpc(name, args);
  if (result.error || result.data === undefined) throw new Error("Checkout recovery is unavailable. Check purchases before retrying.");
  return result.data;
}
export async function reserveCheckoutOrder(client: AppSupabaseClient, buyer: string, track: string, license: string) {
  const order = await rpc(client, "reserve_recoverable_checkout", { p_buyer: buyer, p_track: track, p_license: license }) as {
    id: string; created_new: boolean; amount_cents: number; currency: string; stripe_checkout_session_id: string | null;
  };
  if (!order?.id || !Number.isSafeInteger(order.amount_cents) || order.amount_cents <= 0 || order.currency !== "USD") throw new Error("Checkout requires reconciliation. Check your purchases or contact support.");
  return order;
}
export async function hasFrozenCheckoutAttempt(client: AppSupabaseClient, orderId: string) {
  const frozen = await rpc(client, "checkout_has_frozen_attempt", { p_order: orderId });
  if (typeof frozen !== "boolean") throw new Error("Checkout recovery is unavailable.");
  return frozen;
}
export async function expireCheckoutAttempt(client: AppSupabaseClient, orderId: string, sessionId: string) {
  await rpc(client, "finish_checkout_attempt", { p_order: orderId, p_token: null, p_session: sessionId, p_outcome: "expired" });
}

// No fulfillment occurs here. A successful API response means only that a
// Checkout Session exists. Signed webhooks remain payment authority.
export async function recoverableCheckout({ client, stripe, secretKey, params }: {
  client: AppSupabaseClient; stripe: Stripe; secretKey: string; params: Stripe.Checkout.SessionCreateParams;
}) {
  if (params.metadata?.paymentMode !== "test") throw new Error("Recoverable checkout currently accepts TEST payments only.");
  const orderId = String(params.client_reference_id);
  await assertAcceptedPurchase(client, orderId);
  const scope = createHash("sha256").update(secretKey).digest("hex") + ":test";
  const attempt = await rpc(client, "claim_checkout_attempt", { p_order: orderId, p_scope: scope, p_request: params }) as {
    outcome: string; request: Stripe.Checkout.SessionCreateParams; key?: string; token?: string; session_id?: string;
  };
  if (!["create", "retrieve"].includes(attempt?.outcome)) throw new Error("Checkout is processing or requires reconciliation. Check your purchases before retrying.");
  let session: Stripe.Checkout.Session;
  if (attempt.outcome === "retrieve") {
    session = await stripe.checkout.sessions.retrieve(attempt.session_id!);
  } else {
    try {
      session = await stripe.checkout.sessions.create(attempt.request, { idempotencyKey: attempt.key!, timeout: 10000, maxNetworkRetries: 1 });
      assertBoundSession(session, attempt.request);
      await rpc(client, "finish_checkout_attempt", { p_order: orderId, p_token: attempt.token, p_session: session.id, p_outcome: "bound" });
    } catch {
      await rpc(client, "finish_checkout_attempt", { p_order: orderId, p_token: attempt.token, p_session: null, p_outcome: "uncertain" }).catch(() => undefined);
      throw new Error("Checkout could not be confirmed. Your pending order was preserved. Check purchases before retrying.");
    }
  }
  assertBoundSession(session, attempt.request);
  if (session.status === "expired") {
    await rpc(client, "finish_checkout_attempt", { p_order: orderId, p_token: null, p_session: session.id, p_outcome: "expired" });
    throw new Error("Checkout expired without completion. Start again from the catalog.");
  }
  if (session.status !== "open" || session.payment_status !== "unpaid" || !session.url) throw new Error("Checkout is awaiting payment reconciliation. Check your purchases.");
  const url = new URL(session.url);
  if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password || url.port) throw new Error("Checkout authorization could not be verified.");
  return session;
}
function assertBoundSession(session: Stripe.Checkout.Session, params: Stripe.Checkout.SessionCreateParams) {
  if (session.livemode !== false || session.client_reference_id !== params.client_reference_id ||
      session.amount_total !== params.line_items?.[0]?.price_data?.unit_amount ||
      session.currency !== params.line_items?.[0]?.price_data?.currency ||
      (params.expires_at !== undefined && session.expires_at !== params.expires_at) ||
      !/^cs_test_[A-Za-z0-9]+$/.test(session.id)) throw new Error("Checkout Session does not match frozen payment facts.");
  for (const field of ["buyerUserId", "trackId", "licenseTypeId", "orderId"]) {
    if (session.metadata?.[field] !== params.metadata?.[field]) throw new Error("Checkout Session identity mismatch.");
  }
}
