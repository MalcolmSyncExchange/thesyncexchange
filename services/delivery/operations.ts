import "server-only";
import { z } from "zod";
import { env, hasSupabaseEnv } from "@/lib/env";
import { resolveMaintenanceMode } from "@/lib/maintenance-mode.mjs";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { hasPrivilegedAssurance } from "@/services/auth/security";
import { PaymentError } from "@/services/orders/payment-request";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), order: z.string().uuid() }).strict(),
  z.object({ action: z.literal("list"), page: z.number().int().min(1).max(10000), size: z.number().int().min(1).max(50) }).strict(),
  z.object({ action: z.literal("operate"), order: z.string().uuid(), key: z.string().uuid(), command: z.enum(["record_review", "close_expired_attempts", "restrict_access"]), reason: z.string().trim().min(5).max(2000), reference: z.string().trim().min(5).max(500) }).strict()
]);
export async function performDeliveryRequest(input: unknown) {
  const p = schema.parse(input);
  if (!hasSupabaseEnv || env.demoMode || resolveMaintenanceMode(process.env.SYNC_EXCHANGE_MAINTENANCE_MODE).blocksApplication) throw new PaymentError(503, "DELIVERY_UNAVAILABLE");
  const client = await createServerSupabaseClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new PaymentError(401, "AUTH_REQUIRED");
  const profile = await selectUserProfileCompat(client, user.id);
  if (profile.error || !["buyer", "admin"].includes(profile.data?.role || "") || (p.action !== "read" && profile.data?.role !== "admin") || (profile.data?.role === "admin" && !await hasPrivilegedAssurance(client))) throw new PaymentError(403, "ACCESS_DENIED");
  // SSR identity remains attached to SQL; active-session/owner/MFA checks are
  // repeated at each RPC. These operations never acquire service credentials.
  const args = p.action === "read" ? { p_order: p.order } : p.action === "list" ? { p_page: p.page, p_size: p.size } : { p_order: p.order, p_request: p.key, p_command: p.command, p_reason: p.reason, p_reference: p.reference };
  const name = p.action === "read" ? "delivery_order_status" : p.action === "list" ? "delivery_operations" : "delivery_admin_action";
  const result = await (client as unknown as { rpc(name: string, args: object): PromiseLike<{ data: unknown; error: { code?: string } | null }> }).rpc(name, args);
  if (result.error || result.data === null) throw new PaymentError(result.error?.code === "42501" ? 403 : result.error?.code === "40001" ? 409 : 503, "DELIVERY_REVIEW_REQUIRED");
  return result.data;
}
