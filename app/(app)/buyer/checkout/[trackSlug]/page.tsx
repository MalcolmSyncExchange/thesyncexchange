import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { createOrderAction } from "@/services/buyer/actions";
import { getBuyerTrackBySlug } from "@/services/buyer/queries";
import { requireSession } from "@/services/auth/session";

export default async function CheckoutPage({
  params,
  searchParams
}: {
  params: { trackSlug: string };
  searchParams?: { error?: string };
}) {
  const user = await requireSession("buyer");
  const track = await getBuyerTrackBySlug(params.trackSlug, user.id);
  if (!track) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold">License checkout</h1>
      {searchParams?.error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">{searchParams.error}</div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
        <Card>
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
                  <p className="font-medium">{formatCurrency(option.price_override || option.base_price)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Checkout status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a license option to create a pending order and continue into secure Stripe checkout. Your order record stays attached to the payment session so confirmation and admin reporting stay in sync.
            </p>
            <form action={createOrderAction} className="space-y-4" data-testid="buyer-checkout-form">
              <input type="hidden" name="trackId" value={track.id} />
              <input type="hidden" name="trackSlug" value={track.slug} />
              <div className="space-y-3">
                {track.license_options.map((option, index) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center justify-between rounded-md border border-border p-4 text-sm"
                    data-testid={`license-option-${option.slug || option.id}`}
                  >
                    <div>
                      <p className="font-medium">{option.name}</p>
                      <p className="text-muted-foreground">{option.terms_summary}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{formatCurrency(option.price_override || option.base_price)}</span>
                      <input
                        type="radio"
                        name="licenseSelection"
                        value={`${option.id}|${option.price_override || option.base_price}`}
                        defaultChecked={index === 0}
                        data-testid={`license-radio-${option.slug || option.id}`}
                      />
                    </div>
                  </label>
                ))}
              </div>
              <Button className="w-full" data-testid="buyer-checkout-submit">Continue to Secure Checkout</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
