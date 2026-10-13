import { parseCapabilityFlags } from "@/lib/admin-v2/payment-readiness";

export const STRIPE_HEALTH_KEYS = [
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
] as const;

export function canObserveDisabledPayments(input: {
  target: string; mode: string; adapterFlag: string | undefined;
  billingPortalFlag: string | undefined; missingOperational: string[];
}) {
  // Six OFF switches alone do not disable legacy checkout. Require every Stripe
  // credential to be absent as well, so that its strict execution gate is closed.
  return input.target === "preview" && input.mode === "test" &&
    input.adapterFlag === "false" && input.billingPortalFlag === "false" &&
    STRIPE_HEALTH_KEYS.every(key => input.missingOperational.includes(key));
}

export function classifyHealthPayments(eligible: boolean, rows: unknown) {
  const flags = eligible ? parseCapabilityFlags(rows) : null;
  const disabled = Boolean(flags && Object.values(flags).every(value => value === false));
  return {
    status: disabled ? "disabled" : eligible && !flags ? "unknown" : "required",
    credentialsRequired: !disabled
  } as const;
}

export function blockingOperationalKeys(missing: string[], disabled: boolean) {
  return disabled ? missing.filter(key => !STRIPE_HEALTH_KEYS.some(stripeKey => stripeKey === key)) : missing;
}
