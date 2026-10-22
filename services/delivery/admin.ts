import "server-only";
import { requireSession } from "@/services/auth/session";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import { licensingRpc } from "@/services/licensing/purchases";

export async function reserveDeliveryVariant(input: { trackId: string; sourceObjectId: string; kind: "master" | "instrumental" | "clean" | "stems" | "alternate" | "supporting" }) {
  const actor = await requireSession("admin");
  return licensingRpc<string>(await createPrivilegedSupabaseClient(), "reserve_delivery_variant", {
    p_actor: actor.id, p_track: input.trackId, p_source: input.sourceObjectId, p_kind: input.kind
  });
}

export async function reviewLicenseDeliverables(input: { offerId: string; assets: Array<{ assetVersionId: string; label: string }>; reviewReference: string }) {
  const actor = await requireSession("admin");
  return licensingRpc<unknown>(await createPrivilegedSupabaseClient(), "review_license_deliverables", {
    p_actor: actor.id, p_offer: input.offerId, p_assets: input.assets, p_reference: input.reviewReference
  });
}
export async function restrictOrderDelivery(orderId: string, reason: string) {
  const actor = await requireSession("admin");
  const client = await createPrivilegedSupabaseClient();
  const { error } = await (client as unknown as { rpc(name: string, args: object): PromiseLike<{ error: unknown }> }).rpc("restrict_order_delivery", {
    p_actor: actor.id, p_order: orderId, p_reason: reason
  });
  if (error) throw new Error("Unable to restrict order delivery.");
}
export async function readDeliveryAudit(orderId: string) {
  await requireSession("admin");
  return licensingRpc<{ attempts: unknown[]; revocations: unknown[]; restriction: unknown }>(await createServerSupabaseClient(), "read_order_delivery_audit", { p_order: orderId });
}
