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

                <OrderStatusProgress status={order.order_status} />

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <p className="text-muted-foreground">
                    Agreement: {order.agreement_url ? "Generated and ready" : "Generating"}
                  </p>
                  <div className="flex items-center gap-4">
                    <Link href={`/license-confirmation/${order.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                      View confirmation
                    </Link>
                    {order.agreement_url ? (
                      <Link href={order.agreement_url} className="font-medium text-foreground underline-offset-4 hover:underline">
                        Open agreement
                      </Link>
                    ) : null}
                  </div>
                </div>
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
