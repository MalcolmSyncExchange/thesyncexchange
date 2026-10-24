import { formatOfferPrice, type TrackLicenseOffer } from "@/lib/licenses/selection";
import { cn } from "@/lib/utils";

export function LicenseOptionCard({ offer, selected, onSelect }: { offer: TrackLicenseOffer; selected: boolean; onSelect: () => void }) {
  const id = `license-${offer.licenseTypeId}`;
  return <div className={cn("min-w-0 rounded-lg border p-4", selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border")} data-testid={`license-option-${offer.slug}`}>
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
      <input id={id} type="radio" name="licenseTypeId" value={offer.licenseTypeId} checked={selected} onChange={onSelect}
        aria-describedby={`${id}-summary ${id}-status`} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
      <span className="min-w-0 flex-1 break-words">
        <span className="block font-semibold">{offer.name}</span>
        <span className="mt-1 block text-sm">{formatOfferPrice(offer)} {offer.currency}</span>
        {selected ? <span className="mt-1 block text-xs font-medium">Selected</span> : null}
      </span>
    </label>
    <p id={`${id}-summary`} className="mt-3 break-words text-sm text-muted-foreground">{offer.termsSummary}</p>
    <p id={`${id}-status`} className="mt-2 text-xs text-muted-foreground">{offer.exclusive ? "Exclusive" : "Non-exclusive"}</p>
    {offer.reviewedScope?<div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
      {offer.reviewedScope.noncommercialTest?<p role="status" className="font-medium">Noncommercial synthetic test offer. No approved commercial rights.</p>:null}
      <p><strong>Permitted uses:</strong> {offer.reviewedScope.uses.join(", ")}</p>
      <p><strong>Territories:</strong> {offer.reviewedScope.territories.join(", ")}</p>
      <div><strong>Included deliverables</strong><ul className="mt-1 list-inside list-disc"><li>Generated license agreement after verified fulfillment</li>{offer.reviewedScope.deliverables.map((v,i)=><li key={i}>{v.label} ({v.kind})</li>)}</ul>{!offer.reviewedScope.deliverables.length?<p className="mt-1 text-muted-foreground">Agreement-only delivery; no audio files are included in this reviewed offer.</p>:null}</div>
      {offer.reviewedScope.restrictions.length?<div><strong>Restrictions</strong><ul className="list-inside list-disc">{offer.reviewedScope.restrictions.map((v,i)=><li key={i}>{v}</li>)}</ul></div>:null}
      {offer.reviewedScope.excludedUses.length?<p><strong>Excluded uses:</strong> {offer.reviewedScope.excludedUses.join(", ")}</p>:null}
    </div>:null}
    <details className="mt-3 text-sm">
      <summary className="w-fit cursor-pointer rounded-sm py-2 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View details<span className="sr-only"> for {offer.name}</span></summary>
      <p className="mt-2 break-words text-muted-foreground">{offer.description || offer.termsSummary}</p>
    </details>
  </div>;
}
