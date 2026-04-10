import { ORDER_STATUS_STEPS } from "@/lib/taxonomy";
import { cn, formatEnumLabel } from "@/lib/utils";
import type { OrderStatus } from "@/types/models";

export function OrderStatusProgress({ status }: { status: OrderStatus }) {
  const activeIndex = ORDER_STATUS_STEPS.indexOf(status === "refunded" ? "fulfilled" : status);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {ORDER_STATUS_STEPS.map((step, index) => {
          const complete = index <= activeIndex;
          return (
            <div key={step} className="flex min-w-0 flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                  complete
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground"
                )}
              >
                {index + 1}
              </div>
              <span className={cn("text-xs", complete ? "text-foreground" : "text-muted-foreground")}>{formatEnumLabel(step)}</span>
              {index < ORDER_STATUS_STEPS.length - 1 ? (
                <div className={cn("h-px flex-1", index < activeIndex ? "bg-primary" : "bg-border")} />
              ) : null}
            </div>
          );
        })}
      </div>
      {status === "refunded" ? <p className="text-xs text-rose-600 dark:text-rose-300">This order has been refunded.</p> : null}
    </div>
  );
}
