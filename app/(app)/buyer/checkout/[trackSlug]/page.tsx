import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { preparePurchaseQuoteAction } from "@/services/licensing/actions";
import { licensingRpc, readPurchaseQuote, type PurchaseQuote } from "@/services/licensing/purchases";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { PurchaseReview } from "@/components/checkout/purchase-review";
import { getBuyerTrackBySlug } from "@/services/buyer/queries";
import { requireSession } from "@/services/auth/session";
import { getPaymentDisplayConfiguration } from "@/lib/server-env";

export default async function CheckoutPage(
  props: {
    params: Promise<{ trackSlug: string }>;
    searchParams?: Promise<{ error?: string; quote?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const user = await requireSession("buyer");
  const track = await getBuyerTrackBySlug(params.trackSlug, user.id);
  if (!track) notFound();
  const payment = getPaymentDisplayConfiguration();
  const testPayment = payment.paymentMode === "test";
  let quote: PurchaseQuote | null = null;
  let quoteError = false;
  let choices: Array<{ licenseId: string; uses: string[]; territories: string[] }> = [];
  try { choices = await licensingRpc(await createServerSupabaseClient(), "read_licensing_choices", { p_track: track.id }); } catch { /* Missing approval/schema fails closed. */ }
  if (searchParams?.quote) {
    try {
      quote = await readPurchaseQuote(await createServerSupabaseClient(), searchParams.quote);
      if (quote.schedule.track.id !== track.id) { quote = null; quoteError = true; }
    } catch { quoteError = true; }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold">License checkout</h1>
      {!payment.checkoutAvailable ? (
        <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm">
          Checkout is temporarily unavailable. You can review license options, but payment cannot start. Please contact support if this continues.
        </div>
      ) : null}
      {testPayment ? (
        <div className="rounded-lg border-2 border-amber-500 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100" role="status">
          <p className="font-bold">TEST MODE — NO REAL PAYMENT</p>
          <p className="mt-1">Use Stripe test payment details only. This checkout creates a test transaction and no commercial license rights.</p>
        </div>
      ) : null}
      {searchParams?.error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">{searchParams.error}</div>
      ) : null}
      {quoteError ? <p role="alert">This transaction review is unavailable for your account. Prepare a new review or contact support to recover an existing purchase.</p> : null}
      <div className={quote ? "space-y-6" : "grid gap-6 lg:grid-cols-[1fr,360px]"}>
        {!quote ? <Card>
          <CardHeader>
            <CardTitle>{track.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{track.description}</p>
            {track.license_options.map((option) => (
              <div key={option.id} className="rounded-md border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{option.name}</p>
                    <p className="text-sm text-muted-foreground">{option.terms_summary}</p>
                  </div>
                  <p className="font-medium">{formatCurrency(option.price_override ?? option.base_price)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card> : null}
        <Card>
          <CardHeader>
            <CardTitle>{quote ? "Transaction-specific legal review" : "Legal party and intended use"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {quote ? <PurchaseReview quote={quote} trackSlug={track.slug} checkoutAvailable={payment.checkoutAvailable} testPayment={testPayment}/> : <>
            <p className="text-sm text-muted-foreground">Identify the legal party and requested usage. The next step presents the exact rights schedule, fee and versioned terms before you accept or start payment. An approved catalog listing alone is insufficient for clearance.</p>
            <form action={preparePurchaseQuoteAction} className="space-y-4" data-testid="purchase-quote-form">
              <input type="hidden" name="trackId" value={track.id} />
              <input type="hidden" name="trackSlug" value={track.slug} />
              {choices.length === 0 ? <p role="status" className="text-sm">No current reviewed rights and legal offer is available. Payment is blocked pending review.</p> : null}
              <fieldset disabled={!payment.checkoutAvailable || choices.length === 0} className="space-y-3">
                <legend className="sr-only">Choose a license</legend>
                {track.license_options.map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center justify-between rounded-md border border-border p-4 text-sm"
                    data-testid={`license-option-${option.slug || option.id}`}
                  >
                    <div>
                      <p className="font-medium">{option.name}</p>
                      <p className="text-muted-foreground">{option.terms_summary}</p>
                      <p className="text-muted-foreground">Cleared usage categories: {choices.find(c => c.licenseId === option.id)?.uses.join(", ") || "Review required"}. Territories: {choices.find(c => c.licenseId === option.id)?.territories.join(", ") || "Review required"}.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{formatCurrency(option.price_override ?? option.base_price)}</span>
                      <input
                        type="radio"
                        name="licenseTypeId"
                        value={option.id}
                        disabled={!choices.some(c => c.licenseId === option.id)}
                        defaultChecked={option.id === track.license_options.find(o => choices.some(c => c.licenseId === o.id))?.id}
                        aria-label={option.name}
                        data-testid={`license-radio-${option.slug || option.id}`}
                      />
                    </div>
                  </label>
                ))}
                <label className="block text-sm">Legal party type<select name="entityType" required className="mt-1 block w-full rounded border bg-background p-2"><option value="individual">Individual</option><option value="company">Company / legal entity</option></select></label>
                {[
                  ["legalName", "Full legal party name", 200], ["registrationNumber", "Company registration number (required for companies)", 100],
                  ["jurisdiction", "Legal jurisdiction / country", 100], ["address", "Legal party address", 500],
                  ["representative", "Your full representative name", 200], ["capacity", "Your authority / capacity", 200],
                  ["project", "Project or production title", 200], ["use", "Requested usage category (as cleared for this license)", 100], ["territory", "Requested territory (as cleared for this license)", 100]
                ].map(([name,label,max]) => <label key={String(name)} className="block text-sm">{label}<input name={String(name)} maxLength={Number(max)} required={name !== "registrationNumber"} className="mt-1 block w-full rounded border bg-background p-2"/></label>)}
                <label className="block text-sm">Usage starts<input name="startsAt" type="date" required className="mt-1 block w-full rounded border bg-background p-2"/></label>
                <label className="block text-sm">Usage ends<input name="endsAt" type="date" required className="mt-1 block w-full rounded border bg-background p-2"/></label>
              </fieldset>
              <Button disabled={!payment.checkoutAvailable || choices.length === 0} className="w-full" data-testid="buyer-checkout-submit">
                Review exact transaction and license terms
              </Button>
            </form>
            </>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
