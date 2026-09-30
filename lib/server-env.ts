import { env, getDeploymentTarget, getPublicEnvironmentDiagnostics, type EnvironmentIssue } from "@/lib/env";
import {
  assertStripeObjectMode,
  buildPaymentClassification,
  resolvePaymentConfiguration,
  type PaymentMode,
  type OperationalReleaseMode
} from "@/lib/payment-mode.mjs";

const rawSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rawStripeSecretKey = process.env.STRIPE_SECRET_KEY;
const rawStripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const rawPaymentMode = process.env.SYNC_EXCHANGE_PAYMENT_MODE;

export type StripeKeyMode = "test" | "live" | "missing" | "unknown";

export const serverEnv = {
  supabaseServiceRoleKey: rawSupabaseServiceRoleKey,
  stripeSecretKey: rawStripeSecretKey,
  stripeWebhookSecret: rawStripeWebhookSecret,
  paymentMode: rawPaymentMode
};

export const hasStripeSecretEnv = Boolean(serverEnv.stripeSecretKey);
export const hasStripeWebhookEnv = Boolean(serverEnv.stripeSecretKey && serverEnv.stripeWebhookSecret);

export function getMissingOperationalEnvKeys(): string[] {
  return [
    ["SUPABASE_SERVICE_ROLE_KEY", rawSupabaseServiceRoleKey],
    ["STRIPE_SECRET_KEY", rawStripeSecretKey],
    ["STRIPE_WEBHOOK_SECRET", rawStripeWebhookSecret],
    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", env.stripePublishableKey]
  ]
    .filter((entry): entry is [string, undefined] => !entry[1])
    .map(([key]) => key);
}

export function getStripeKeyMode(key: string | undefined, expectedPrefix: "sk" | "pk"): StripeKeyMode {
  if (!key) {
    return "missing";
  }

  const acceptedPrefixes = expectedPrefix === "sk" ? ["sk", "rk"] : ["pk"];

  if (acceptedPrefixes.some((prefix) => key.startsWith(`${prefix}_test_`))) {
    return "test";
  }

  if (acceptedPrefixes.some((prefix) => key.startsWith(`${prefix}_live_`))) {
    return "live";
  }

  return "unknown";
}

export function getServerEnvironmentDiagnostics() {
  const publicDiagnostics = getPublicEnvironmentDiagnostics();
  const deploymentTarget = getDeploymentTarget();
  const issues: EnvironmentIssue[] = [...publicDiagnostics.issues];
  const stripeSecretKeyMode = getStripeKeyMode(rawStripeSecretKey, "sk");
  const stripePublishableKeyMode = getStripeKeyMode(env.stripePublishableKey, "pk");
  const payment = resolvePaymentConfiguration(rawPaymentMode, deploymentTarget);

  if (!payment.valid) {
    issues.push({
      code: payment.issueCode || "invalid_payment_mode",
      severity: "error",
      message: payment.message || "The configured payment mode is invalid."
    });
  }

  if (!rawSupabaseServiceRoleKey) {
    issues.push({
      code: "missing_supabase_service_role_key",
      severity: deploymentTarget === "production" ? "error" : "warning",
      message:
        deploymentTarget === "production"
          ? "SUPABASE_SERVICE_ROLE_KEY is missing. Order fulfillment, agreement generation, and storage verification cannot run in production without it."
          : "SUPABASE_SERVICE_ROLE_KEY is missing. Live fulfillment, agreement generation, and storage verification will be limited."
    });
  }

  if (!rawStripeSecretKey) {
    issues.push({
      code: "missing_stripe_secret_key",
      severity: deploymentTarget === "production" ? "error" : "warning",
      message:
        deploymentTarget === "production"
          ? "STRIPE_SECRET_KEY is missing. Production checkout cannot run without it."
          : "STRIPE_SECRET_KEY is missing. Stripe checkout routes will stay inactive."
    });
  }

  if (!env.stripePublishableKey) {
    issues.push({
      code: "missing_stripe_publishable_key",
      severity: deploymentTarget === "production" ? "error" : "warning",
      message:
        deploymentTarget === "production"
          ? "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing. Production checkout cannot render safely without it."
          : "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing. Client-side Stripe launch surfaces will stay inactive."
    });
  }

  if (!rawStripeWebhookSecret) {
    issues.push({
      code: "missing_stripe_webhook_secret",
      severity: deploymentTarget === "production" ? "error" : "warning",
      message:
        deploymentTarget === "production"
          ? "STRIPE_WEBHOOK_SECRET is missing. Production fulfillment must not launch without a verified webhook signing secret."
          : "STRIPE_WEBHOOK_SECRET is missing. Stripe webhook fulfillment will stay inactive."
    });
  }

  if (
    stripeSecretKeyMode !== "missing" &&
    stripePublishableKeyMode !== "missing" &&
    stripeSecretKeyMode !== "unknown" &&
    stripePublishableKeyMode !== "unknown" &&
    stripeSecretKeyMode !== stripePublishableKeyMode
  ) {
    issues.push({
      code: "stripe_key_mode_mismatch",
      severity: "error",
      message: "Stripe secret and publishable keys are mixing test/live modes. Use matching key modes in the same environment."
    });
  }

  for (const [keyMode, keyName] of [
    [stripeSecretKeyMode, "STRIPE_SECRET_KEY"],
    [stripePublishableKeyMode, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]
  ] as const) {
    if (keyMode === "unknown") {
      issues.push({
        code: "stripe_key_mode_unknown",
        severity: "error",
        message: `${keyName} does not have a recognized Stripe test or live key prefix.`
      });
    }
  }

  if (
    payment.valid &&
    ((stripeSecretKeyMode !== "missing" && stripeSecretKeyMode !== payment.paymentMode) ||
      (stripePublishableKeyMode !== "missing" && stripePublishableKeyMode !== payment.paymentMode))
  ) {
    issues.push({
      code: "stripe_payment_mode_mismatch",
      severity: "error",
      message: `Stripe keys do not match the configured ${payment.paymentMode} payment mode.`
    });
  }

  if (
    deploymentTarget === "production" &&
    (stripeSecretKeyMode === "test" || stripePublishableKeyMode === "test") &&
    rawPaymentMode !== "test"
  ) {
    issues.push({
      code: "stripe_test_mode_in_production",
      severity: "error",
      message: "Stripe test keys in production require explicit SYNC_EXCHANGE_PAYMENT_MODE=test beta configuration."
    });
  }

  return {
    deploymentTarget,
    paymentMode: payment.paymentMode,
    releaseMode: payment.releaseMode,
    livePaymentsEnabled: payment.livePaymentsEnabled,
    stripe: {
      secretKeyMode: stripeSecretKeyMode,
      publishableKeyMode: stripePublishableKeyMode,
      modesMatch:
        stripeSecretKeyMode === "missing" ||
        stripePublishableKeyMode === "missing" ||
        stripeSecretKeyMode === "unknown" ||
        stripePublishableKeyMode === "unknown" ||
        stripeSecretKeyMode === stripePublishableKeyMode
    },
    issues,
    errors: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warning")
  };
}

export function assertStripeServerConfiguration(
  context: string,
  options: {
    requireWebhook?: boolean;
  } = {}
) {
  const { requireWebhook = false } = options;
  const diagnostics = getServerEnvironmentDiagnostics();

  if (!rawStripeSecretKey) {
    throw new Error(`${context} is unavailable because STRIPE_SECRET_KEY is missing.`);
  }

  if (requireWebhook && !rawStripeWebhookSecret) {
    throw new Error(`${context} is unavailable because STRIPE_WEBHOOK_SECRET is missing.`);
  }

  if (!env.stripePublishableKey) {
    throw new Error(`${context} is unavailable because NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing.`);
  }

  const blockingIssue = diagnostics.errors.find((issue) =>
    [
      "stripe_key_mode_mismatch",
      "stripe_key_mode_unknown",
      "stripe_payment_mode_mismatch",
      "stripe_test_mode_in_production",
      "missing_payment_mode",
      "invalid_payment_mode",
      "live_payments_outside_production",
      "missing_stripe_secret_key",
      "missing_stripe_publishable_key",
      "missing_stripe_webhook_secret"
    ].includes(issue.code)
  );

  if (blockingIssue) {
    throw new Error(blockingIssue.message);
  }
}

export function getPaymentRuntimeConfiguration() {
  const diagnostics = getServerEnvironmentDiagnostics();
  if (diagnostics.errors.length > 0 || (diagnostics.paymentMode !== "test" && diagnostics.paymentMode !== "live")) {
    throw new Error("Payment runtime configuration is invalid.");
  }
  return {
    deploymentTarget: diagnostics.deploymentTarget,
    paymentMode: diagnostics.paymentMode as PaymentMode,
    releaseMode: diagnostics.releaseMode as OperationalReleaseMode,
    livePaymentsEnabled: diagnostics.livePaymentsEnabled,
    expectedLivemode: diagnostics.paymentMode === "live"
  };
}

export function assertStripeRuntimeObject(
  context: string,
  input: { livemode: boolean | undefined; checkoutSessionId?: string | null }
) {
  const runtime = getPaymentRuntimeConfiguration();
  assertStripeObjectMode({ context, paymentMode: runtime.paymentMode, ...input });
  return buildPaymentClassification(runtime.paymentMode, runtime.releaseMode);
}

export function getPaymentActivityMetadata() {
  const runtime = getPaymentRuntimeConfiguration();
  return buildPaymentClassification(runtime.paymentMode, runtime.releaseMode);
}
