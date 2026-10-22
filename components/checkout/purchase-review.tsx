import type { PurchaseQuote } from "@/services/licensing/purchases";
import { createOrderAction } from "@/services/buyer/actions";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export function PurchaseReview({ quote, trackSlug, checkoutAvailable, testPayment }: { quote: PurchaseQuote; trackSlug: string; checkoutAvailable: boolean; testPayment: boolean }) {
  const s = quote.schedule;
  return <section className="space-y-5" aria-labelledby="transaction-review-title" data-testid="purchase-legal-review">
    <h2 id="transaction-review-title" className="text-xl font-semibold">Review this transaction</h2>
    <p>{s.track.title} · {s.license.name} · {formatCurrency(s.amountCents / 100, s.currency)}</p>
    {s.sourceEvidence ? <p className="break-all text-sm">Approved recording version {s.sourceEvidence.snapshot.masterVersion}. Source reference {s.sourceEvidence.id}. This purchase retains that exact recording and its listed deliverables.</p> : null}
    <dl className="space-y-2 text-sm">
      <div><dt className="font-semibold">Licensee</dt><dd>{s.buyer.legalName} ({s.buyer.entityType}); {s.buyer.address}; {s.buyer.jurisdiction}. Representative: {s.buyer.representative}, {s.buyer.capacity}. Account: {s.buyer.email}</dd></div>
      <div><dt className="font-semibold">Seller and platform role</dt><dd>{s.seller.legalName}; {s.seller.address}; {s.seller.jurisdiction}. {s.terms.platformRole}</dd></div>
      <div><dt className="font-semibold">Project and permitted use</dt><dd>{s.usage.project}; {s.usage.use}; {s.usage.territory}; {s.usage.startsAt} through {s.usage.endsAt}</dd></div>
      <div><dt className="font-semibold">Recording / composition identifiers</dt><dd>{s.track.recordingIdentifier} / {s.track.workIdentifier}</dd></div>
      <div><dt className="font-semibold">Platform fee included in the price</dt><dd>{formatCurrency(s.financial.platformFeeCents / 100, s.currency)} · allocation policy {s.financial.policyVersion}</dd></div>
    </dl>
    {(["master", "publishing"] as const).map(pool => <div key={pool}><h3 className="font-semibold">{pool === "master" ? "Master recording" : "Composition / publishing"} rightsholders</h3><ul className="list-disc pl-5 text-sm">{s.rights[pool].map(h => <li key={h.party.id}>{h.party.legalName}; {h.party.jurisdiction}; {h.ownershipBps / 100}% owned, {h.controlledBps / 100}% controlled; authority: {h.authority}</li>)}</ul></div>)}
    <div><h3 className="font-semibold">Restrictions and exclusions</h3><ul className="list-disc pl-5 text-sm">{s.rights.scope.restrictions.map((r,i) => <li key={i}>{r}</li>)}{s.rights.scope.excludedUses.map((r,i) => <li key={`excluded-${i}`}>Excluded use: {r}</li>)}</ul></div>
    <div><h3 className="font-semibold">Outside clearances</h3><ul className="list-disc pl-5 text-sm">{s.rights.scope.outsideClearances.map(c => <li key={c.kind}>{c.kind}: {c.responsibility}. {c.description}</li>)}</ul></div>
    <div><h3 className="font-semibold">License terms — {s.terms.version}</h3><p className="whitespace-pre-wrap break-words rounded-md border border-border p-4 text-sm" data-testid="exact-license-terms">{s.terms.body}</p><p className="break-all text-xs text-muted-foreground">Transaction schedule SHA-256: {quote.hash}. Exact legal document SHA-256: {s.documentSha256}. Legal terms record SHA-256: {s.termsHash}.</p></div>
    <div><h3 className="font-semibold">Included files for this license</h3>{s.deliveryManifest?.length ? <ul className="list-disc pl-5 text-sm">{s.deliveryManifest.map(a => <li key={a.assetVersionId}>{a.label} · {a.kind} · {a.mimeType} · {a.byteSize.toLocaleString()} bytes</li>)}</ul> : <p className="text-sm">No audio or supporting files are included in this transaction. The issued agreement is provided separately.</p>}</div>
    <details className="text-sm"><summary className="cursor-pointer">Complete transaction schedule and contributor allocations</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md border p-3">{JSON.stringify(s, null, 2)}</pre></details>
    {quote.acceptedAt ? <p role="status" className="text-sm">Accepted on {quote.acceptedAt}. Continuing retains this original schedule and terms. Payment and issuance remain subject to verification.</p> : <p className="text-sm text-muted-foreground">Review this schedule before {quote.expiresAt}. This records your authenticated acceptance and declared authority; it does not represent a rightsholder signature.</p>}
    <form action={createOrderAction} className="space-y-4" data-testid="buyer-checkout-form">
      <input type="hidden" name="trackId" value={s.track.id}/><input type="hidden" name="trackSlug" value={trackSlug}/><input type="hidden" name="licenseSelection" value={s.license.id}/>
      <input type="hidden" name="quoteId" value={quote.id}/><input type="hidden" name="quoteHash" value={quote.hash}/><input type="hidden" name="acceptedConsents" value={JSON.stringify(s.terms.requiredConsents)}/>
      <fieldset disabled={!checkoutAvailable} className="space-y-3">
        <legend className="font-semibold">Accept this transaction and license version {s.terms.version}</legend>
        {s.terms.requiredConsents.map((consent,i) => <label key={i} className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" required name={`consent-${i}`} value="accepted"/>{consent}</label>)}
        <label className="block text-sm">Confirm your full representative name<input className="mt-1 block w-full rounded border bg-background p-2" name="acceptanceRepresentative" required maxLength={200} autoComplete="name"/></label>
        <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" required name="transactionAcceptance" value="accepted"/>I accept this transaction schedule and its exact license terms, and confirm my identity and authority for the stated legal party.</label>
        <Button className="w-full" data-testid="buyer-checkout-submit">{testPayment ? "Accept and continue to Test Checkout" : "Accept and continue to Secure Checkout"}</Button>
      </fieldset>
    </form>
  </section>;
}
