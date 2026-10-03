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
const rawStripeAccountId = process.env.STRIPE_ACCOUNT_ID;
const rawPurchaseCompletionAdapterEnabled = process.env.SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED;
// Netlify TOML context values exist at build time. Preserve only the explicit
// preview setting for Functions; never supply a fallback for production.
const rawPaymentMode = process.env.SYNC_EXCHANGE_PAYMENT_MODE ??
  (getDeploymentTarget() === "preview" ? process.env.TSE_BUILD_PREVIEW_PAYMENT_MODE : undefined);
const rawBillingPortalEnabled = process.env.SYNC_EXCHANGE_BILLING_PORTAL_ENABLED;

export type StripeKeyMode = "test" | "live" | "missing" | "unknown";
export type BillingPortalFlagState = "enabled" | "disabled" | "missing" | "invalid";

export const serverEnv = {
  supabaseServiceRoleKey: rawSupabaseServiceRoleKey,
  stripeSecretKey: rawStripeSecretKey,
  stripeWebhookSecret: rawStripeWebhookSecret,
  stripeAccountId: rawStripeAccountId,
  purchaseCompletionAdapterEnabled: rawPurchaseCompletionAdapterEnabled,
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

  if (
    rawPurchaseCompletionAdapterEnabled !== undefined &&
    rawPurchaseCompletionAdapterEnabled !== "" &&
    rawPurchaseCompletionAdapterEnabled !== "true" &&
    rawPurchaseCompletionAdapterEnabled !== "false"
  ) {
    issues.push({
      code: "invalid_purchase_completion_adapter_flag",
      severity: "warning",
      message: "The Phase 2B payment adapter flag is invalid and has been treated as OFF."
    });
  }

  if (rawPurchaseCompletionAdapterEnabled === "true" && !/^acct_[A-Za-z0-9]+$/.test(rawStripeAccountId || "")) {
    issues.push({
      code: "missing_purchase_completion_provider_account",
      severity: "error",
      message: "The Phase 2B payment adapter requires a valid server-only STRIPE_ACCOUNT_ID."
    });
  }

  if (rawPurchaseCompletionAdapterEnabled === "true" && (!payment.valid || payment.paymentMode !== "test")) {
    issues.push({
      code: "purchase_completion_adapter_requires_test_mode",
      severity: "error",
      message: "The Phase 2B payment adapter is TEST-only and requires explicit test payment mode."
    });
  }

  if (rawPurchaseCompletionAdapterEnabled === "true" && deploymentTarget === "production") {
    issues.push({
      code: "purchase_completion_adapter_production_prohibited",
      severity: "error",
      message: "The Phase 2B payment adapter is not authorized for the production deployment target."
    });
  }

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
      "missing_stripe_webhook_secret",
      "missing_purchase_completion_provider_account",
      "purchase_completion_adapter_requires_test_mode",
      "purchase_completion_adapter_production_prohibited"
    ].includes(issue.code)
  );

  if (blockingIssue) {
    throw new Error(blockingIssue.message);
  }
}

// Read-only pages must remain accessible when payment execution is unavailable.
// This projection contains no keys; execution still uses the strict validator below.
export function getPaymentDisplayConfiguration() {
  const diagnostics = getServerEnvironmentDiagnostics();
  const checkoutAvailable = diagnostics.errors.length === 0 &&
    (diagnostics.paymentMode === "test" || diagnostics.paymentMode === "live");
  return {
    paymentMode: diagnostics.paymentMode,
    checkoutAvailable,
    livePaymentsEnabled: checkoutAvailable && diagnostics.livePaymentsEnabled,
    issueCodes: diagnostics.errors.map(issue => issue.code)
  };
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

export function getBillingPortalRuntimeConfiguration() {
  const diagnostics = getServerEnvironmentDiagnostics();
  const normalized = typeof rawBillingPortalEnabled === "string" ? rawBillingPortalEnabled.trim().toLowerCase() : "";
  const flagState: BillingPortalFlagState =
    normalized === "true" ? "enabled" : normalized === "false" ? "disabled" : normalized ? "invalid" : "missing";
  const productionBeta = diagnostics.releaseMode === "production_beta";
  const environmentValid = diagnostics.errors.length === 0;
  const enabled = flagState === "enabled" && environmentValid && !productionBeta;

  return {
    enabled,
    flagState,
    releaseMode: diagnostics.releaseMode as OperationalReleaseMode,
    reason: productionBeta
      ? "production_beta"
      : !environmentValid
        ? "environment_invalid"
        : flagState === "invalid"
          ? "invalid_flag"
          : flagState === "enabled"
            ? "enabled"
            : "not_enabled"
  } as const;
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

export function getPurchaseCompletionAdapterConfiguration() {
  const enabled = rawPurchaseCompletionAdapterEnabled === "true";
  const flagValid =
    rawPurchaseCompletionAdapterEnabled === undefined ||
    rawPurchaseCompletionAdapterEnabled === "" ||
    rawPurchaseCompletionAdapterEnabled === "false" ||
    rawPurchaseCompletionAdapterEnabled === "true";
  const accountValid = Boolean(rawStripeAccountId && /^acct_[A-Za-z0-9]+$/.test(rawStripeAccountId));
  const deploymentTarget = getDeploymentTarget();
  const targetValid = deploymentTarget !== "production";
  const payment = resolvePaymentConfiguration(rawPaymentMode, deploymentTarget);

  return {
    enabled: enabled && flagValid && accountValid && targetValid && payment.valid && payment.paymentMode === "test",
    requested: enabled,
    flagValid,
    accountValid,
    targetValid,
    providerAccount: accountValid ? rawStripeAccountId : undefined,
    reason: !flagValid
      ? "invalid_flag"
      : !enabled
        ? "disabled"
      : !accountValid
          ? "missing_or_invalid_stripe_account"
          : !targetValid
            ? "production_target_prohibited"
          : !payment.valid || payment.paymentMode !== "test"
            ? "test_payment_mode_required"
            : "enabled"
  } as const;
}
