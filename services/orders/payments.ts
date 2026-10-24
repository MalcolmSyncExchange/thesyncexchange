import "server-only";
import { z } from "zod";
import { env, hasSupabaseEnv } from "@/lib/env";
import { resolveMaintenanceMode } from "@/lib/maintenance-mode.mjs";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { hasPrivilegedAssurance } from "@/services/auth/security";
import { generateAgreementArtifactForOrder } from "@/services/agreements/server";
import { PaymentError } from "@/services/orders/payment-request";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), order: z.string().uuid() }).strict(),
  z.object({ action: z.literal("list"), page: z.number().int().min(1).max(10000), size: z.number().int().min(1).max(50) }).strict(),
  z.object({ action: z.literal("operate"), order: z.string().uuid(), key: z.string().uuid(), command: z.enum(["annotate", "retry_fulfillment"]), reason: z.string().trim().min(5).max(2000), reference: z.string().trim().min(5).max(500) }).strict()
]);
type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }> };
async function call<T>(client: Rpc, name: string, args: Record<string, unknown>): Promise<T> {
  const r = await client.rpc(name, args); if (r.error) throw new PaymentError(r.error.code === "42501" ? 403 : r.error.code === "40001" ? 409 : 503, "PAYMENT_REVIEW_REQUIRED"); return r.data as T;
}
export async function performPaymentRequest(input: unknown) {
  const p = schema.parse(input);
  if (!hasSupabaseEnv || env.demoMode || resolveMaintenanceMode(process.env.SYNC_EXCHANGE_MAINTENANCE_MODE).blocksApplication) throw new PaymentError(503, "PAYMENTS_UNAVAILABLE");
  const client = await createServerSupabaseClient(); const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new PaymentError(401, "AUTH_REQUIRED");
  const { data: profile, error: roleError } = await selectUserProfileCompat(client, user.id);
  if (roleError || !profile || !["buyer", "admin"].includes(profile.role || "") || (p.action !== "read" && profile.role !== "admin") || (profile.role === "admin" && !(await hasPrivilegedAssurance(client)))) throw new PaymentError(403, "ACCESS_DENIED");
  const rpc = client as unknown as Rpc;
  if (p.action === "read") return call(rpc, "checkout_order_state", { p_order: p.order });
  if (p.action === "list") return call(rpc, "checkout_operations", { p_page: p.page, p_size: p.size });
  // SQL rechecks the active MFA session, immutable acceptance, verified payment,
  // adverse holds and rights before granting the fenced operation.
  const r = await call<{ outcome: string; token?: string }>(rpc, "request_checkout_operation", { p_order: p.order, p_request: p.key, p_action: p.command, p_reason: p.reason, p_reference: p.reference });
  if (r.outcome !== "execute") return r;
  const privileged = await createPrivilegedSupabaseClient() as unknown as Rpc;
  let success = false;
  try { await generateAgreementArtifactForOrder(p.order); success = true; }
  finally { await call(privileged, "finish_checkout_operation", { p_request: p.key, p_token: r.token, p_success: success }); }
  return { outcome: "complete" };
}
