import { Button } from "@/components/ui/button";
import { updateOrderStatusAction } from "@/services/admin/actions";

const ORDER_STATUSES = ["pending", "paid", "fulfilled", "refunded"] as const;

export function OrderStatusForm({ orderId, status }: { orderId: string; status: string }) {
  return (
    <form action={updateOrderStatusAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <select
        name="status"
        defaultValue={status}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        aria-label="Update order status"
      >
        {ORDER_STATUSES.map((option) => (
          <option key={option} value={option}>
            {option.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline">
        Update
      </Button>
    </form>
  );
}
