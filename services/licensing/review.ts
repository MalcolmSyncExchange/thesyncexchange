import "server-only";
import { requireSession } from "@/services/auth/session";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import { licensingRpc } from "./purchases";

// Explicit administrative commands; never infer approval from catalog status or
// seed business/legal policy. No production approval UI is activated here.
export async function registerLicensingEvidence(input: { objectId: string; sha256: string; reviewReference: string; validUntil: string }) {
  const actor = await requireSession("admin");
  return licensingRpc<string>(await createPrivilegedSupabaseClient(), "register_licensing_evidence", {
    p_actor: actor.id, p_object: input.objectId, p_sha256: input.sha256, p_reference: input.reviewReference, p_valid_until: input.validUntil
  });
}
export async function publishLicensingOffer(input: { trackId: string; licenseId: string; rights: unknown; terms: unknown; financial: unknown; reviewReference: string }) {
  const actor = await requireSession("admin");
  return licensingRpc<string>(await createPrivilegedSupabaseClient(), "publish_licensing_offer", {
    p_actor: actor.id, p_track: input.trackId, p_license: input.licenseId, p_rights: input.rights, p_terms: input.terms, p_financial: input.financial, p_reference: input.reviewReference
  });
}
export async function invalidateLicensingReview(input: { kind: "offer" | "evidence"; id: string; state: "revoked" | "disputed"; reason: string }) {
  const actor = await requireSession("admin");
  // void-returning command deliberately checks error, not truthiness of data.
  const client = await createPrivilegedSupabaseClient();
  const { error } = await (client as unknown as { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: unknown }> }).rpc("invalidate_licensing_review", {
    p_actor: actor.id, p_kind: input.kind, p_id: input.id, p_state: input.state, p_reason: input.reason
  });
  if (error) throw new Error("Unable to invalidate licensing review.");
}
