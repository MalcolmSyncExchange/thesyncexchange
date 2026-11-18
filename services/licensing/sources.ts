import "server-only";
import { requireSession } from "@/services/auth/session";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import { licensingRpc } from "@/services/licensing/purchases";

// No client-chosen Storage coordinates, authority claims or mutable backfill.
export async function reserveApprovedMaster(submissionId: string, masterId: string) {
  const actor = await requireSession("admin");
  return licensingRpc<string>(await createPrivilegedSupabaseClient(), "reserve_approved_source_delivery", {
    p_actor: actor.id, p_submission: submissionId, p_master: masterId
  });
}
export async function linkApprovedDeliverable(input: { assetVersionId: string; submissionId: string; masterId: string; reviewReference: string }) {
  const actor = await requireSession("admin");
  const client = await createPrivilegedSupabaseClient();
  const { error } = await (client as unknown as { rpc(name: string, args: object): PromiseLike<{ error: unknown }> }).rpc("link_approved_delivery_source", {
    p_actor: actor.id, p_asset: input.assetVersionId, p_submission: input.submissionId, p_master: input.masterId, p_reference: input.reviewReference
  });
  if (error) throw new Error("The approved recording and sealed deliverable require review.");
}
export async function reviewPurchaseSource(input: { offerId: string; submissionId: string; expectedRevision: number; reviewReference: string }) {
  const actor = await requireSession("admin");
  return licensingRpc<unknown>(await createPrivilegedSupabaseClient(), "review_purchase_source", {
    p_actor: actor.id, p_offer: input.offerId, p_submission: input.submissionId, p_revision: input.expectedRevision, p_reference: input.reviewReference
  });
}
export async function restrictPurchaseSource(reviewId: string, reason: string) {
  const actor = await requireSession("admin");
  const { error } = await (await createPrivilegedSupabaseClient() as unknown as { rpc(name: string, args: object): PromiseLike<{ error: unknown }> }).rpc("restrict_purchase_source", {
    p_actor: actor.id, p_review: reviewId, p_reason: reason
  });
  if (error) throw new Error("Unable to record the source restriction.");
}
export async function readOrderSourceChain(orderId: string) {
  await requireSession("admin");
  return licensingRpc<unknown>(await createServerSupabaseClient(), "read_order_source_chain", { p_order: orderId });
}

// Large copies require the separately approved worker/runtime capacity; no route,
// automatic upload or hosted execution is enabled by exporting this command.
export async function prepareApprovedMasterCopy(assetVersionId: string, reviewReference: string) {
  const actor = await requireSession("admin");
  const client = await createPrivilegedSupabaseClient();
  const { copyApprovedMaster } = await import("./source-copy.mjs");
  const { readPrivateArtifact } = await import("@/services/delivery/server");
  return copyApprovedMaster(assetVersionId, reviewReference, {
    prepare: id => licensingRpc<import("./source-copy.mjs").ApprovedCopy>(client, "read_approved_master_copy", {p_actor:actor.id,p_asset:id}),
    read: readPrivateArtifact,
    upload: async (destination, bytes, contentType) => {
      const { error } = await client.storage.from(destination.bucket).upload(destination.path, bytes, {contentType,upsert:false});
      if (error) throw new Error("Source copy outcome requires verification.");
    },
    seal: (id,sha256,size,mime,reference) => licensingRpc<boolean>(client,"seal_approved_master_copy",{p_actor:actor.id,p_asset:id,p_sha256:sha256,p_size:size,p_mime:mime,p_reference:reference})
  });
}
