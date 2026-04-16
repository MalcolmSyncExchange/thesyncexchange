import Link from "next/link";

import { OrderStatusForm } from "@/components/admin/order-status-form";
import { OrderStatusProgress } from "@/components/orders/order-status-progress";
import { OrderStatusBadge } from "@/components/shared/state-badges";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getAdminOrders } from "@/services/admin/queries";

export default async function AdminOrdersPage() {
  const orders = await getAdminOrders();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">License and order management</h1>
      <div className="space-y-4">
        {orders.length ? (
          orders.map((order: any) => (
            <Card key={order.id}>
              <CardContent className="space-y-5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{order.track_title || "Track"}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.license_name || "License"} • {order.buyer_name || "Buyer"} • {formatCurrency(order.amount_paid, order.currency)}
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

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Order ID {order.id}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {order.stripe_checkout_session_id ? <span>Checkout {order.stripe_checkout_session_id.slice(0, 18)}...</span> : null}
                      {order.stripe_payment_intent_id ? <span>Payment {order.stripe_payment_intent_id.slice(0, 18)}...</span> : null}
                      {order.paid_at ? <span>Paid recorded</span> : null}
                      {order.agreement_generated ? (
                        <span>{order.agreement_delivery_blocked ? "Agreement generated, delivery blocked" : "Agreement ready for buyer delivery"}</span>
                      ) : null}
                      {order.last_webhook_processed_at ? <span>Webhook {formatDateTime(order.last_webhook_processed_at)}</span> : null}
                    </div>
                    {order.agreement_ready && order.agreement_url ? (
                      <Link href={order.agreement_url} className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
                        Open Agreement Document
                      </Link>
                    ) : null}
                  </div>
                  <OrderStatusForm orderId={order.id} status={order.order_status} />
                </div>

                {order.last_webhook_error || order.agreement_generation_error ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
                    <p className="font-medium">Fulfillment attention needed</p>
                    {order.last_webhook_error ? <p className="mt-1">Webhook: {order.last_webhook_error}</p> : null}
                    {order.agreement_generation_error ? <p className="mt-1">Agreement: {order.agreement_generation_error}</p> : null}
                    <p className="mt-2">After the underlying issue is fixed, set the order back to Fulfilled to retry agreement generation.</p>
                  </div>
                ) : null}

                {order.schema_degraded || order.activity_degraded ? (
                  <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-900 dark:text-sky-200">
                    <p className="font-medium">Reduced operational visibility</p>
                    {(order.degraded_messages || []).map((message: string) => (
                      <p key={message} className="mt-1">
                        {message}
                      </p>
                    ))}
                  </div>
                ) : null}

                {order.recent_activity?.length ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Recent activity</p>
                    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                      {order.recent_activity.map((event: any) => (
                        <div key={event.id} className="flex flex-wrap items-start justify-between gap-3 text-sm">
                          <div>
                            <p className="font-medium text-foreground">
                              {event.event_type.replace(/_/g, " ").replace(/\b\w/g, (char: string) => char.toUpperCase())}
                            </p>
                            {event.message ? <p className="text-muted-foreground">{event.message}</p> : null}
                          </div>
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{formatDateTime(event.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">No orders yet.</div>
        )}
      </div>
    </div>
  );
}
