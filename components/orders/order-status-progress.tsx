import {
  getCurrentLifecycleStep,
  isLifecycleStepComplete,
  isOrderRefunded,
  ORDER_LIFECYCLE_STEPS,
  timestampForLifecycleStep
} from "@/lib/orders";
import { cn, formatDateTime } from "@/lib/utils";
import type { OrderStatus } from "@/types/models";

type OrderStatusProgressProps = {
  status: OrderStatus;
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  agreement_url?: string | null;
  checkout_created_at?: string | null;
  paid_at?: string | null;
  agreement_generated_at?: string | null;
  fulfilled_at?: string | null;
  refunded_at?: string | null;
};

export function OrderStatusProgress(props: OrderStatusProgressProps) {
  const activeStep = getCurrentLifecycleStep(props);
  const activeIndex = ORDER_LIFECYCLE_STEPS.findIndex((step) => step.key === activeStep);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {ORDER_LIFECYCLE_STEPS.map((step, index) => {
          const complete = isLifecycleStepComplete(props, step.key);
          const timestamp = timestampForLifecycleStep(props, step.key);

          return (
            <div key={step.key} className="flex min-w-0 flex-1 items-center gap-2">
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
              <div className="min-w-0">
                <p className={cn("text-xs", complete ? "text-foreground" : "text-muted-foreground")}>{step.label}</p>
                {timestamp ? <p className="text-[11px] text-muted-foreground">{formatDateTime(timestamp)}</p> : null}
              </div>
              {index < ORDER_LIFECYCLE_STEPS.length - 1 ? (
                <div className={cn("h-px flex-1", index < activeIndex ? "bg-primary" : "bg-border")} />
              ) : null}
            </div>
          );
        })}
      </div>
      {isOrderRefunded(props) ? <p className="text-xs text-rose-600 dark:text-rose-300">This order has been refunded.</p> : null}
    </div>
  );
}
