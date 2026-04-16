import Link from "next/link";

import { OrderStatusProgress } from "@/components/orders/order-status-progress";
import { OrderStatusBadge } from "@/components/shared/state-badges";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getBuyerOrders } from "@/services/buyer/queries";
import { requireSession } from "@/services/auth/session";

export default async function BuyerOrdersPage() {
  const user = await requireSession("buyer");
  const orders = await getBuyerOrders(user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Orders and license history</h1>
      <div className="space-y-4">
        {orders.length ? (
          orders.map((order: any) => (
            <Card key={order.id}>
              <CardContent className="space-y-5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{order.track?.title || "Track"}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.license_type?.name || "License"} • {formatCurrency(order.amount_paid, order.currency)}
                    </p>
                  </div>
                  <div className="space-y-2 text-right">
                    <OrderStatusBadge status={order.order_status} />
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{formatDateTime(order.created_at)}</p>
                  </div>
                </div>

                <OrderStatusProgress
                  status={order.order_status}
                  stripe_checkout_session_id={order.stripe_checkout_session_id}
                  stripe_payment_intent_id={order.stripe_payment_intent_id}
                  agreement_url={order.agreement_url}
                  checkout_created_at={order.checkout_created_at}
                  paid_at={order.paid_at}
                  agreement_generated_at={order.agreement_generated_at}
                  fulfilled_at={order.fulfilled_at}
                  refunded_at={order.refunded_at}
                />

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <p className="text-muted-foreground">
                    {order.agreement_generation_error
                      ? "Payment cleared, but agreement generation needs attention from the Sync Exchange team."
                      : order.agreement_delivery_blocked
                        ? "Payment cleared and the document was generated, but secure delivery is blocked until the Supabase fulfillment metadata migration is applied."
                      : order.agreement_ready
                      ? "Agreement generated and ready for download."
                      : order.paid_at
                        ? "Payment received. Agreement generation is in progress."
                        : order.checkout_created_at
                          ? "Checkout created. Payment confirmation will appear here once Stripe completes."
                          : "Order is being prepared for checkout."}
                  </p>
                  <div className="flex items-center gap-4">
                    <Link href={`/license-confirmation/${order.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                      View Confirmation
                    </Link>
                    {order.agreement_ready && order.agreement_url ? (
                      <Link href={order.agreement_url} className="font-medium text-foreground underline-offset-4 hover:underline">
                        Open Agreement Document
                      </Link>
                    ) : null}
                  </div>
                </div>

                {order.agreement_generation_error ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
                    Agreement delivery is still being finalized: {order.agreement_generation_error}
                  </div>
                ) : null}

                {order.schema_degraded ? (
                  <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-900 dark:text-sky-200">
                    {(order.degraded_messages || []).map((message: string) => (
                      <p key={message} className="mt-1 first:mt-0">
                        {message}
                      </p>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">No license orders yet.</div>
        )}
      </div>
    </div>
  );
}
