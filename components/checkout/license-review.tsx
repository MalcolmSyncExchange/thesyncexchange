"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { formatOfferPrice, licenseDetailHref, previousOfferRevision, type CheckoutReview } from "@/lib/licenses/selection";

const subscribe = () => () => {};
function PaymentButton({ disabled, testPayment }: { disabled: boolean; testPayment: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={disabled || pending} className="min-h-11 w-full whitespace-normal" data-testid="buyer-checkout-submit">
    {pending ? "Preparing transaction review…" : testPayment ? "Continue to Test Transaction Review" : "Continue to Transaction Review"}
  </Button>;
}

export function LicenseReview({ review, paymentAvailable, testPayment, changed = false, action }: {
  review: CheckoutReview; paymentAvailable: boolean; testPayment: boolean; changed?: boolean; action: (data: FormData) => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const { offer } = review;
  const previous = useSyncExternalStore(subscribe, () => {
    try { return previousOfferRevision(window.sessionStorage, offer); } catch { return null; }
  }, () => null);
  const offerChanged = changed || Boolean(previous && previous !== offer.revision);
  return <section aria-labelledby="review-heading" className="min-w-0 space-y-5 rounded-lg border border-border bg-card p-5" data-testid="buyer-license-review">
    <h2 id="review-heading" className="text-xl font-semibold">{offer.name}</h2>
    {offerChanged ? <p role="alert" className="rounded-md border border-border p-3 text-sm">The price or license details have changed. Review the current offer below before confirming again.</p> : null}
    <p className="text-lg font-semibold">{formatOfferPrice(offer)} {offer.currency}</p>
    <p className="break-words text-sm">{offer.termsSummary}</p>
    <p className="text-sm text-muted-foreground">{offer.exclusive ? "Exclusive" : "Non-exclusive"}</p>
    <details className="text-sm"><summary className="w-fit cursor-pointer rounded-sm py-2 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring">View details</summary><p className="mt-2 break-words">{offer.description || offer.termsSummary}</p></details>
    <Link className="inline-block rounded-sm py-2 text-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring" href={licenseDetailHref(review.trackSlug, offer.licenseTypeId)}>Change license</Link>
    <p className="text-sm text-muted-foreground">This is a read-only review. No order has been created. Selection does not reserve a price or grant rights.</p>
    {!paymentAvailable ? <p role="status" id="payment-unavailable" className="rounded-md border border-border p-3 text-sm">Payment is temporarily unavailable. You can review this license or return to compare other options.</p> : null}
    <form action={action} className="space-y-4" data-testid="buyer-checkout-form">
      <input type="hidden" name="trackId" value={review.trackId} />
      <input type="hidden" name="trackSlug" value={review.trackSlug} />
      <input type="hidden" name="licenseTypeId" value={offer.licenseTypeId} />
      <input type="hidden" name="reviewRevision" value={offer.revision} />
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-sm focus-within:ring-2 focus-within:ring-ring">
        <input type="checkbox" name="reviewConfirmed" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
        <span className="text-sm">I have reviewed this license and its current price.</span>
      </label>
      <PaymentButton disabled={!paymentAvailable || !confirmed} testPayment={testPayment} />
    </form>
  </section>;
}
