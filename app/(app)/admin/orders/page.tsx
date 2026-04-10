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
                      {order.agreement_generated_at ? <span>Agreement ready</span> : null}
                    </div>
                    {order.agreement_url ? (
                      <Link href={order.agreement_url} className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
                        Open agreement artifact
                      </Link>
                    ) : null}
                  </div>
                  <OrderStatusForm orderId={order.id} status={order.order_status} />
                </div>
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
