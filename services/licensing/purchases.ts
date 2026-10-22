import type { AppSupabaseClient } from "@/services/supabase/types";

export type LegalParty = { legalName: string; entityType: "individual" | "company"; jurisdiction: string; address: string; registrationNumber?: string; userId?: string; id?: string };
export type PurchaseSchedule = {
  schemaVersion: "TSE-PURCHASE-1";
  buyer: LegalParty & { userId: string; email: string; representative: string; capacity: string };
  seller: LegalParty & { userId: string };
  offerId: string;
  rights: { master: Array<{ party: LegalParty & { id: string }; ownershipBps: number; controlledBps: number; evidenceId: string; authority: string }>; publishing: Array<{ party: LegalParty & { id: string }; ownershipBps: number; controlledBps: number; evidenceId: string; authority: string }>; scope: { uses: string[]; territories: string[]; restrictions: string[]; excludedUses: string[]; validFrom: string; validUntil: string; outsideClearances: Array<{ kind: string; responsibility: string; description: string }> } };
  track: { id: string; title: string; recordingIdentifier: string; workIdentifier: string };
  license: { id: string; name: string; slug: string; exclusive: boolean };
  usage: { project: string; use: string; territory: string; startsAt: string; endsAt: string };
  terms: { version: string; body: string; platformRole: string; approvalReference: string; requiredConsents: string[]; acceptUntil: string; issueUntil: string };
  termsHash: string; documentSha256: string; amountCents: number; currency: string;
  financial: { policyVersion: string; commissionBps: number; platformFeeCents: number; allocations: Array<{ partyId: string; bps: number; amountCents: number }> };
  sourceEvidence?: { id: string; hash: string; reviewedAt: string; reviewedBy: string; reviewReference: string; snapshot: { submissionId: string; masterId: string; masterVersion: string; masterSha256: string; masterReviewId: string } };
  deliveryManifest?: Array<{ assetVersionId: string; kind: string; label: string; objectVersion: string; sha256: string; byteSize: number; mimeType: string }>;
  orderId?: string; quoteId?: string; quotedAt?: string;
  acceptance?: { buyerId: string; acceptedAt: string; method: string; scheduleHash: string; termsHash: string; documentVersion: string; representative: string; capacity: string; consents: string[]; sessionId: string | null; statement: string };
};
export type PurchaseQuote = { id: string; schedule: PurchaseSchedule; hash: string; expiresAt: string; acceptedAt?: string | null; orderId?: string | null };
export type AcceptedPurchase = { snapshot: PurchaseSchedule; hash: string };
type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export async function licensingRpc<T>(client: AppSupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (client as unknown as Rpc).rpc(name, args);
  if (error || !data) throw new Error("Rights, legal-party details or transaction acceptance require review. Resume the original purchase or contact support.");
  return data as T;
}
export async function readPurchaseQuote(client: AppSupabaseClient, quoteId: string) {
  return licensingRpc<PurchaseQuote>(client, "read_purchase_quote", { p_quote: quoteId });
}
export async function acceptPurchaseQuote(client: AppSupabaseClient, form: FormData) {
  let consents: unknown;
  try { consents = JSON.parse(String(form.get("acceptedConsents") || "null")); } catch { throw new Error("Review the exact transaction terms before continuing."); }
  if (form.get("transactionAcceptance") !== "accepted" || !Array.isArray(consents) || consents.some(c => typeof c !== "string")) throw new Error("Transaction-specific legal acceptance is required.");
  if (consents.some((_, i) => form.get(`consent-${i}`) !== "accepted")) throw new Error("Every transaction-specific consent must be accepted.");
  return licensingRpc<{ id: string; created_new: boolean; amount_cents: number; currency: string; track_id: string; license_type_id: string }>(client, "accept_purchase_quote", {
    p_quote: String(form.get("quoteId") || ""), p_hash: String(form.get("quoteHash") || ""), p_consents: consents, p_representative: String(form.get("acceptanceRepresentative") || "")
  });
}
export async function assertAcceptedPurchase(client: AppSupabaseClient, orderId: string) {
  return licensingRpc<AcceptedPurchase>(client, "assert_accepted_purchase", { p_order: orderId });
}
