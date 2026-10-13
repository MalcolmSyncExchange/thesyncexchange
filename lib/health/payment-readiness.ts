import { parseCapabilityFlags } from "@/lib/admin-v2/payment-readiness";

export const STRIPE_HEALTH_KEYS = [
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
] as const;

export function canObserveDisabledPayments(input: {
  target: string; mode: string; adapterFlag: string | undefined;
  billingPortalFlag: string | undefined; missingOperational: string[]; stagingIdentityVerified?: boolean;
}) {
  // Six OFF switches alone do not disable legacy checkout. Require every Stripe
  // credential to be absent as well, so that its strict execution gate is closed.
  return (input.target === "preview" || input.stagingIdentityVerified === true) && input.mode === "test" &&
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

export const DISABLED_STRIPE_ISSUES = ["missing_stripe_secret_key", "missing_stripe_publishable_key", "missing_stripe_webhook_secret"];
export function blockingHealthIssues<T extends { code: string }>(issues: T[], disabled: boolean): T[] {
  return disabled ? issues.filter(issue => !DISABLED_STRIPE_ISSUES.includes(issue.code)) : issues;
}

/** Independent platform/build identity and project-bound credentials; RPC verifies the signature. */
export function isDedicatedStagingIdentity(vars: Record<string, string | undefined>, target: string) {
  const site = "d8e851a6-ab37-4b0e-9403-9b2c1be65f13";
  const project = "oppijylbkcbiqfuvckgj";
  function claims(value: string | undefined, role: string) {
    try {
      const parts = value?.split(".");
      if (!parts || parts.length !== 3) return false;
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      return payload.ref === project && payload.role === role;
    } catch { return false; }
  }
  return target === "production" && vars.SYNC_EXCHANGE_DEPLOYMENT_CLASS === "dedicated-staging" &&
    vars.SITE_ID === site && vars.TSE_BUILD_NETLIFY_SITE_ID === site &&
    vars.NETLIFY === "true" && (vars.CONTEXT === undefined || vars.CONTEXT === "production") &&
    vars.NEXT_PUBLIC_APP_URL === "https://sync-exchange-posthog-staging.netlify.app" &&
    vars.NEXT_PUBLIC_SUPABASE_URL === `https://${project}.supabase.co` &&
    vars.ANALYTICS_ENABLED === "false" && vars.SYNC_EXCHANGE_DEMO_MODE === "false" &&
    claims(vars.NEXT_PUBLIC_SUPABASE_ANON_KEY, "anon") && claims(vars.SUPABASE_SERVICE_ROLE_KEY, "service_role");
}
