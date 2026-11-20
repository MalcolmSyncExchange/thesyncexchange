import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { env, hasSupabaseEnv } from "@/lib/env";
import { resolveMaintenanceMode } from "@/lib/maintenance-mode.mjs";
import { getStripeCheckoutSessionMode } from "@/lib/payment-mode.mjs";
import { assertStripeServerConfiguration, getPaymentRuntimeConfiguration } from "@/lib/server-env";
import { captureCheckoutStarted } from "@/services/analytics/checkout";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { assertAcceptedPurchase } from "@/services/licensing/purchases";
import { preparePurchaseCompletionCheckout } from "@/services/purchase-completion/server";
import { createStripeCheckoutSession } from "@/services/stripe/server";
import { consumeRateLimit, rateLimitErrorResponse } from "@/services/security/rate-limit";
import { readPaymentRequest, PaymentError, paymentHeaders } from "@/services/orders/payment-request";
export async function POST(request: Request) {
  try {
    const { orderId } = z.object({ orderId: z.string().uuid() }).strict().parse(await readPaymentRequest(request));
    if (!hasSupabaseEnv || env.demoMode || resolveMaintenanceMode(process.env.SYNC_EXCHANGE_MAINTENANCE_MODE).blocksApplication) throw new PaymentError(503, "CHECKOUT_UNAVAILABLE");
    const client = await createServerSupabaseClient(); const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) throw new PaymentError(401, "AUTH_REQUIRED");
    const profile = await selectUserProfileCompat(client, user.id);
    const active = await client.rpc("auth_session_is_active");
    if (profile.error || profile.data?.role !== "buyer" || active.error || active.data !== true) throw new PaymentError(403, "BUYER_ACCESS_REQUIRED");
    const scope = await client.from("orders").select("id,buyer_user_id,status,stripe_checkout_session_id").eq("id", orderId).eq("buyer_user_id", user.id).maybeSingle();
    if (scope.error || !scope.data || scope.data.buyer_user_id !== user.id) throw new PaymentError(404, "ORDER_UNAVAILABLE");
    if (scope.data.status !== "pending") throw new PaymentError(409, "CHECK_PURCHASE_STATUS");
    try { assertStripeServerConfiguration("Stripe checkout API", { requireWebhook: true }); } catch { throw new PaymentError(503,"CHECKOUT_UNAVAILABLE"); }
    const paymentRuntime = getPaymentRuntimeConfiguration();
    if (paymentRuntime.deploymentTarget === "production" && process.env.SYNC_EXCHANGE_MARKETPLACE_CHECKOUT_ENABLED !== "true") throw new PaymentError(503, "CHECKOUT_RELEASE_GATE_CLOSED");
    const stripe_checkout_session_id = scope.data.stripe_checkout_session_id;
    const storedSessionMode = stripe_checkout_session_id ? getStripeCheckoutSessionMode(stripe_checkout_session_id) : null;
    if (stripe_checkout_session_id && storedSessionMode !== paymentRuntime.paymentMode) throw new PaymentError(409, "PAYMENT_ENVIRONMENT_MISMATCH");
    const privileged = await createPrivilegedSupabaseClient(); const accepted = await assertAcceptedPurchase(privileged, orderId); const s = accepted.snapshot;
    if (s.currency !== "USD" || !Number.isSafeInteger(s.amountCents) || s.amountCents < 1 || s.buyer.userId !== user.id) throw new PaymentError(409, "TRANSACTION_REVIEW_REQUIRED");
    // Exact accepted evidence is authoritative. Never mutate or substitute a
    // current catalog price, title or legal scope during recovery.
    const limited = rateLimitErrorResponse(await consumeRateLimit("checkout", user.id)); if (limited) return limited;
    try { await preparePurchaseCompletionCheckout(orderId); } catch { throw new PaymentError(503,"CHECKOUT_UNAVAILABLE"); }
    const session = await createStripeCheckoutSession({ orderId, trackTitle: s.track.title, trackSlug: s.track.id, licenseName: s.license.name,
      amountCents: s.amountCents, currency: s.currency, buyerEmail: user.email, buyerUserId: user.id, trackId: s.track.id, licenseTypeId: s.license.id });
    await captureCheckoutStarted(user.id, orderId, s.track.id, s.license.slug, session).catch(() => {});
    return NextResponse.json({ url: session.url, orderId }, { headers: paymentHeaders });
  } catch (error) {
    const status = error instanceof PaymentError ? error.status : error instanceof ZodError || error instanceof SyntaxError || error instanceof TypeError ? 400 : 409;
    return NextResponse.json({ error: error instanceof PaymentError ? error.code : status === 400 ? "CHECK_REQUIRED_FIELDS" : "CHECKOUT_REQUIRES_RECOVERY" }, { status, headers: paymentHeaders });
  }
}
