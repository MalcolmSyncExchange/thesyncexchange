import "server-only";
import { z } from "zod";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { hasPrivilegedAssurance } from "@/services/auth/security";
import { env, hasSupabaseEnv } from "@/lib/env";
import { resolveMaintenanceMode } from "@/lib/maintenance-mode.mjs";
import { mediaRpc, UploadError, type MediaClient } from "@/services/media/uploads";
export { UploadError as LicensingError };
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), page: z.number().int().min(1).max(10000), size: z.number().int().min(1).max(50) }).strict(),
  z.object({ action: z.literal("read"), order: z.string().uuid() }).strict(),
  z.object({ action: z.literal("lifecycle"), order: z.string().uuid(), revision: z.number().int().nonnegative(), key: z.string().uuid(), command: z.enum(["annotate","terminate","revoke"]), reason: z.string().trim().min(5).max(2000), reference: z.string().trim().min(5).max(500) }).strict(),
  z.object({ action: z.literal("offer"), track: z.string().uuid(), license: z.string().uuid() }).strict(),
  z.object({ action: z.literal("configure"), track: z.string().uuid(), license: z.string().uuid(), expected: z.string().uuid(), contract: z.record(z.string(),z.unknown()), reference: z.string().trim().min(5).max(500) }).strict()
]);
export async function performLicensingRequest(value: unknown) {
  const p = input.parse(value);
  if (!hasSupabaseEnv || env.demoMode || resolveMaintenanceMode(process.env.SYNC_EXCHANGE_MAINTENANCE_MODE).blocksApplication) throw new UploadError(503,"LICENSING_UNAVAILABLE");
  const client = await createServerSupabaseClient(); const {data:{user},error} = await client.auth.getUser(); if(error || !user) throw new UploadError(401,"AUTH_REQUIRED");
  const {data:profile,error:roleError} = await selectUserProfileCompat(client,user.id);
  const admin = ["lifecycle","offer","configure"].includes(p.action);
  if (roleError || !profile || !["buyer","artist","admin"].includes(profile.role || "") || (admin && profile.role !== "admin") || (profile.role === "admin" && !(await hasPrivilegedAssurance(client)))) throw new UploadError(403,"ACCESS_DENIED");
  const c = client as unknown as MediaClient;
  if(p.action === "list") return mediaRpc(c,"license_records",{p_page:p.page,p_size:p.size});
  if(p.action === "read") return mediaRpc(c,"license_record",{p_order:p.order});
  if(p.action === "offer") return mediaRpc(c,"license_offer_contract",{p_track:p.track,p_license:p.license});
  if(p.action === "configure") return mediaRpc(c,"license_configure_contract",{p_track:p.track,p_license:p.license,p_expected:p.expected,p_contract:p.contract,p_reference:p.reference});
  return mediaRpc(c,"license_lifecycle_command",{p_order:p.order,p_revision:p.revision,p_request:p.key,p_action:p.command,p_reason:p.reason,p_reference:p.reference});
}
