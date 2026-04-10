import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderStatusProgress } from "@/components/orders/order-status-progress";
import { OrderStatusBadge } from "@/components/shared/state-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateAgreementPlaceholder } from "@/lib/license";
import { env, hasStripeEnv } from "@/lib/env";
import { getOrderById } from "@/services/buyer/queries";
import { syncOrderFromStripeSessionId } from "@/services/stripe/server";

export default async function LicenseConfirmationPage({
  params,
  searchParams
}: {
  params: { orderId: string };
  searchParams?: { trackId?: string; licenseTypeId?: string; session_id?: string };
}) {
  let order = await getOrderById(params.orderId);

  if (
    order &&
    order.order_status === "pending" &&
    searchParams?.session_id &&
    hasStripeEnv &&
    !env.demoMode
  ) {
    try {
      await syncOrderFromStripeSessionId(order.id, searchParams.session_id);
      order = await getOrderById(params.orderId);
    } catch {
      // If webhook or artifact generation lags, keep the current order snapshot and show the pending notice below.
    }
  }

  const agreement =
    order
      ? {
          orderId: order.id,
          trackTitle: order.track?.title || "Selected Track",
          artistName: "The Sync Exchange Artist",
          licenseName: order.license_type?.name || "License",
          agreementUrl: order.agreement_url || "",
          summary: [
            `License: ${order.license_type?.name || "Pending selection"}`,
            `Status: ${order.order_status}`,
            `Agreement URL: ${order.agreement_url || "Pending"}`
          ]
        }
      : searchParams?.trackId && searchParams?.licenseTypeId
        ? generateAgreementPlaceholder(params.orderId, searchParams.trackId, searchParams.licenseTypeId)
        : null;

  if (!agreement) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>License confirmation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-muted-foreground">
            Agreement generation is currently a clean placeholder system. Legal language, indemnities, and territory definitions require review before production go-live.
          </p>
          {order?.order_status === "pending" ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
              Payment confirmation is still syncing. If this page stays pending after Stripe checkout, verify the Stripe webhook is forwarding to
              {" "}
              <span className="font-medium">/api/webhooks/stripe</span>.
            </div>
          ) : null}
          <div className="rounded-lg border border-border bg-muted/40 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{agreement.trackTitle}</p>
                <p className="text-sm text-muted-foreground">{agreement.artistName}</p>
              </div>
              {order ? <OrderStatusBadge status={order.order_status} /> : null}
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {agreement.summary.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
            {order ? <div className="mt-5"><OrderStatusProgress status={order.order_status} /></div> : null}
          </div>
          <Button asChild>
            <Link href="/buyer/orders">View order history</Link>
          </Button>
          {order?.agreement_url ? (
            <Button asChild variant="outline">
              <Link href={order.agreement_url}>Open generated agreement</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
