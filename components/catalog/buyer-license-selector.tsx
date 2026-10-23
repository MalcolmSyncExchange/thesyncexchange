"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAnalytics } from "@/components/analytics/provider";
import { Button } from "@/components/ui/button";
import { LicenseOptionCard } from "./license-option-card";
import { checkoutReviewHref, licenseDetailHref, rememberViewedOffer, type TrackLicenseOffer } from "@/lib/licenses/selection";
import { filterProperties } from "@/lib/analytics/schema";

export const PAYMENT_UNAVAILABLE_MESSAGE = "Checkout is temporarily unavailable. You can still compare and select a license. No order has been created.";

export function BuyerLicenseSelector({ trackId, trackSlug, offers, initialLicenseTypeId, paymentAvailable, invalidSelection = false }: {
  trackId: string; trackSlug: string; offers: TrackLicenseOffer[]; initialLicenseTypeId?: string | null; paymentAvailable: boolean; invalidSelection?: boolean;
}) {
  const initial = offers.find(offer => offer.licenseTypeId === initialLicenseTypeId)?.licenseTypeId || null;
  const [selected, setSelected] = useState<string | null>(initial);
  const selectedRef = useRef(selected);
  const capture = useAnalytics();
  const router = useRouter();
  useEffect(() => {
    // Restore navigation intent without remounting the radios or recording a decision.
    selectedRef.current = initial;
    setSelected(initial);
  }, [initial]);
  function select(offer: TrackLicenseOffer) {
    if (offer.trackId !== trackId || selectedRef.current === offer.licenseTypeId) return;
    selectedRef.current = offer.licenseTypeId;
    setSelected(offer.licenseTypeId);
    try { rememberViewedOffer(window.sessionStorage, offer); } catch { /* Storage is optional. */ }
    const safe = filterProperties("license_selected", { track_id: trackId, license_type: offer.slug, selection_method: "explicit" });
    if (safe) capture("license_selected", safe);
    // Only an identifier enters navigation. Restoration/remount never invokes select.
    router.replace(licenseDetailHref(trackSlug, offer.licenseTypeId), { scroll: false });
  }
  return <section id="licenses" aria-labelledby="license-heading" className="scroll-mt-6 space-y-4" data-testid="buyer-license-selector">
    <h2 id="license-heading" className="text-xl font-semibold">Choose a license</h2>
    <p className="text-sm text-muted-foreground">Compare the available uses and choose the license for your project. Selection does not reserve a price or grant rights.</p>
    {invalidSelection ? <p role="alert" className="text-sm">That license selection is unavailable. Please choose an available license below.</p> : null}
    {!paymentAvailable ? <p role="status" className="rounded-md border border-border p-3 text-sm">{PAYMENT_UNAVAILABLE_MESSAGE} You can continue to a read-only review; payment will remain unavailable.</p> : null}
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-3 text-sm font-medium">Available licenses</legend>
      {offers.map(offer => <LicenseOptionCard key={offer.licenseTypeId} offer={offer} selected={selected === offer.licenseTypeId} onSelect={() => select(offer)} />)}
    </fieldset>
    {!offers.length ? <p role="status" className="text-sm">No license is currently available for this track.</p> : null}
    {selected ? <Button asChild className="min-h-11 w-full whitespace-normal text-center"><Link href={checkoutReviewHref(trackSlug, selected)}>Continue to Checkout</Link></Button>
      : <Button type="button" disabled className="min-h-11 w-full whitespace-normal">Continue to Checkout</Button>}
    <p className="text-xs text-muted-foreground">Reviewing your selection creates no order and starts no payment.</p>
  </section>;
}
