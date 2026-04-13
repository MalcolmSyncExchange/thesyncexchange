import type { OrderStatus } from "@/types/models";

export type OrderLifecycleStep = "pending" | "checkout_created" | "paid" | "agreement_generated" | "fulfilled";

export interface OrderLifecycleSnapshot {
  status: OrderStatus;
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  agreement_url?: string | null;
  agreement_path?: string | null;
  checkout_created_at?: string | null;
  paid_at?: string | null;
  agreement_generated_at?: string | null;
  fulfilled_at?: string | null;
  refunded_at?: string | null;
  agreement_generation_error?: string | null;
}

export const ORDER_LIFECYCLE_STEPS: Array<{ key: OrderLifecycleStep; label: string }> = [
  { key: "pending", label: "Order created" },
  { key: "checkout_created", label: "Checkout created" },
  { key: "paid", label: "Payment confirmed" },
  { key: "agreement_generated", label: "Agreement ready" },
  { key: "fulfilled", label: "Order fulfilled" }
];

export function hasCheckoutBeenCreated(order: OrderLifecycleSnapshot) {
  return Boolean(order.checkout_created_at || order.stripe_checkout_session_id);
}

export function hasPaymentCleared(order: OrderLifecycleSnapshot) {
  return Boolean(
    order.paid_at ||
      order.stripe_payment_intent_id ||
      order.status === "paid" ||
      order.status === "fulfilled" ||
      order.status === "refunded"
  );
}

export function hasAgreementBeenGenerated(order: OrderLifecycleSnapshot) {
  return Boolean(order.agreement_generated_at || order.agreement_url || order.agreement_path);
}

export function hasOrderBeenFulfilled(order: OrderLifecycleSnapshot) {
  return Boolean(order.fulfilled_at || order.status === "fulfilled");
}

export function isOrderRefunded(order: OrderLifecycleSnapshot) {
  return Boolean(order.refunded_at || order.status === "refunded");
}

export function isLifecycleStepComplete(order: OrderLifecycleSnapshot, step: OrderLifecycleStep) {
  switch (step) {
    case "pending":
      return true;
    case "checkout_created":
      return hasCheckoutBeenCreated(order);
    case "paid":
      return hasPaymentCleared(order);
    case "agreement_generated":
      return hasAgreementBeenGenerated(order);
    case "fulfilled":
      return hasOrderBeenFulfilled(order);
    default:
      return false;
  }
}

export function getCurrentLifecycleStep(order: OrderLifecycleSnapshot): OrderLifecycleStep {
  if (hasOrderBeenFulfilled(order) && hasAgreementBeenGenerated(order)) return "fulfilled";
  if (hasAgreementBeenGenerated(order)) return "agreement_generated";
  if (hasPaymentCleared(order)) return "paid";
  if (hasCheckoutBeenCreated(order)) return "checkout_created";
  return "pending";
}

export function hasExtendedOrderMetadata(order: Record<string, unknown>) {
  return "agreement_path" in order && "agreement_generation_error" in order && "last_webhook_event_type" in order;
}

export function timestampForLifecycleStep(order: OrderLifecycleSnapshot, step: OrderLifecycleStep) {
  switch (step) {
    case "pending":
      return null;
    case "checkout_created":
      return order.checkout_created_at || null;
    case "paid":
      return order.paid_at || null;
    case "agreement_generated":
      return order.agreement_generated_at || null;
    case "fulfilled":
      return order.fulfilled_at || null;
    default:
      return null;
  }
}
