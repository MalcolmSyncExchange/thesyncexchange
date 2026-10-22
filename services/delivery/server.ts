import "server-only";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { deliverAsset, fetchPrivateArtifact, type Authorization } from "./transfer.mjs";

export type BuyerAsset = { id: string; kind: string; label: string; byteSize: number; state: string; available: boolean };
type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
async function rpc<T>(client: unknown, name: string, args: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(name, args);
  if (error || data === null) throw new Error("Secure delivery is unavailable.");
  return data as T;
}
export function readPrivateArtifact(input: { bucket: string; path: string; byteSize: number; signal?: AbortSignal }) {
  if (!env.supabaseUrl || !serverEnv.supabaseServiceRoleKey) throw new Error("Secure delivery is unavailable.");
  return fetchPrivateArtifact({ ...input, projectUrl: env.supabaseUrl, serviceKey: serverEnv.supabaseServiceRoleKey });
}
export async function readBuyerAssets(client: unknown, orderId: string) {
  return rpc<BuyerAsset[]>(client, "read_order_assets", { p_order: orderId });
}
export async function handleAssetDownload(request: Request, orderId: string, entitlementId: string) {
  // Lazy creation keeps forbidden origins and read-only probes outside all auth/DB I/O.
  let scoped: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  let privileged: ReturnType<typeof createAdminSupabaseClient>;
  return deliverAsset(request, orderId, entitlementId, {
    randomUUID,
    authenticate: async () => {
      scoped = await createServerSupabaseClient();
      const { data: { user }, error } = await scoped.auth.getUser();
      if (error || !user) return null;
      const profile = await selectUserProfileCompat(scoped, user.id);
      return { id: user.id, role: profile.error ? null : profile.data?.role || null };
    },
    ownsOrder: async (buyerId, id) => {
      const result = await scoped.from("orders").select("id,buyer_user_id").eq("id", id).eq("buyer_user_id", buyerId).maybeSingle();
      return !result.error && result.data?.buyer_user_id === buyerId;
    },
    deny: async (id, entitlement, key) => {
      const { error } = await (scoped as unknown as RpcClient).rpc("record_asset_access_denial", { p_order: id, p_entitlement: entitlement, p_request: key });
      if (error) throw new Error("Secure delivery is unavailable.");
    },
    begin: async (buyerId, id, entitlement, key) => {
      const sessionId = await rpc<string>(scoped, "verify_asset_download_session", {});
      privileged = createAdminSupabaseClient();
      if (!privileged) throw new Error("Secure delivery is unavailable.");
      return rpc<Authorization>(privileged, "begin_asset_download", { p_buyer: buyerId, p_order: id, p_entitlement: entitlement, p_request: key, p_session: sessionId });
    },
    read: (asset, signal) => readPrivateArtifact({ bucket: asset.bucket, path: asset.path, byteSize: asset.byteSize, signal }),
    ticket: async (buyerId, authorization) => {
      const brokerUrl = process.env.SYNC_EXCHANGE_DELIVERY_BROKER_URL;
      if (!brokerUrl || new URL(brokerUrl).protocol !== "https:" || new URL(brokerUrl).pathname !== "/download" || new URL(brokerUrl).search || new URL(brokerUrl).hash || new URL(brokerUrl).username || new URL(brokerUrl).password) throw new Error("Large-file delivery requires the approved broker.");
      const ticket = randomBytes(32).toString("hex");
      const { error } = await (privileged as unknown as RpcClient).rpc("create_asset_delivery_ticket", {
        p_buyer: buyerId, p_authorization: authorization.authorizationId, p_hash: createHash("sha256").update(ticket).digest("hex")
      });
      if (error) throw new Error("Secure delivery is unavailable.");
      return { brokerUrl, ticket };
    },
    finish: (buyerId, authorizationId, outcome) => rpc<boolean>(privileged, "finish_asset_download", {
      p_buyer: buyerId, p_authorization: authorizationId, p_outcome: outcome
    })
  });
}
