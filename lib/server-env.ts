import { env, getDeploymentTarget, getPublicEnvironmentDiagnostics, type EnvironmentIssue } from "@/lib/env";

const rawSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rawStripeSecretKey = process.env.STRIPE_SECRET_KEY;
const rawStripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export type StripeKeyMode = "test" | "live" | "missing" | "unknown";

export const serverEnv = {
  supabaseServiceRoleKey: rawSupabaseServiceRoleKey,
  stripeSecretKey: rawStripeSecretKey,
  stripeWebhookSecret: rawStripeWebhookSecret
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

  if (key.startsWith(`${expectedPrefix}_test_`)) {
    return "test";
  }

  if (key.startsWith(`${expectedPrefix}_live_`)) {
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

  if (deploymentTarget === "production" && (stripeSecretKeyMode === "test" || stripePublishableKeyMode === "test")) {
    issues.push({
      code: "stripe_test_mode_in_production",
      severity: "error",
      message: "Stripe keys are still in test mode while the deployment target is production. Switch both keys to live mode before launch."
    });
  }

  return {
    deploymentTarget,
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
      "stripe_test_mode_in_production",
      "missing_stripe_secret_key",
      "missing_stripe_publishable_key",
      "missing_stripe_webhook_secret"
    ].includes(issue.code)
  );

  if (blockingIssue) {
    throw new Error(blockingIssue.message);
  }
}
