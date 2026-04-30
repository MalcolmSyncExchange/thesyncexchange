const rawPrimaryAppUrl = normalizeOptionalEnv(process.env.NEXT_PUBLIC_APP_URL);
const rawFallbackSiteUrl = normalizeOptionalEnv(process.env.NEXT_PUBLIC_SITE_URL);
const rawAppUrl = rawPrimaryAppUrl || rawFallbackSiteUrl;
const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const rawStripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const explicitDemoMode = process.env.SYNC_EXCHANGE_DEMO_MODE;

function normalizeOptionalEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function resolveDemoMode(value: string | undefined) {
  return value === "true";
}

export type DeploymentTarget = "local" | "preview" | "production";

export type EnvironmentIssue = {
  code: string;
  severity: "warning" | "error";
  message: string;
};

export const env = {
  configuredAppUrl: rawAppUrl,
  appUrl: rawAppUrl || "http://127.0.0.1:3000",
  supabaseUrl: rawSupabaseUrl,
  supabaseAnonKey: rawSupabaseAnonKey,
  avatarsBucket: process.env.NEXT_PUBLIC_SUPABASE_AVATARS_BUCKET || "avatars",
  coverArtBucket: process.env.NEXT_PUBLIC_SUPABASE_COVER_ART_BUCKET || "cover-art",
  trackAudioBucket: process.env.NEXT_PUBLIC_SUPABASE_TRACK_AUDIO_BUCKET || "track-audio",
  trackPreviewsBucket: process.env.NEXT_PUBLIC_SUPABASE_TRACK_PREVIEWS_BUCKET || "track-previews",
  agreementsBucket: process.env.NEXT_PUBLIC_SUPABASE_AGREEMENTS_BUCKET || "agreements",
  stripePublishableKey: rawStripePublishableKey,
  demoMode: resolveDemoMode(explicitDemoMode)
};

export const hasSupabaseEnv = Boolean(rawSupabaseUrl && rawSupabaseAnonKey);

export function isLocalhostHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1";
}

export function getDeploymentTarget(): DeploymentTarget {
  const vercelEnv = process.env.VERCEL_ENV;
  const netlifyContext = process.env.CONTEXT;

  if (vercelEnv === "production" || netlifyContext === "production") {
    return "production";
  }

  if (vercelEnv === "preview" || netlifyContext === "deploy-preview" || netlifyContext === "branch-deploy") {
    return "preview";
  }

  return "local";
}

export function getMissingCoreEnvKeys(): string[] {
  return [
    ["NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL", rawAppUrl],
    ["NEXT_PUBLIC_SUPABASE_URL", rawSupabaseUrl],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", rawSupabaseAnonKey]
  ]
    .filter((entry): entry is [string, undefined] => !entry[1])
    .map(([key]) => key);
}

export function getPublicEnvironmentDiagnostics() {
  const deploymentTarget = getDeploymentTarget();
  const issues: EnvironmentIssue[] = [];

  if (!rawAppUrl) {
    issues.push({
      code: "missing_app_url",
      severity: "error",
      message: "NEXT_PUBLIC_APP_URL is missing. NEXT_PUBLIC_SITE_URL may be used as a fallback, but public auth redirects, metadata URLs, and Stripe return URLs need a configured app origin."
    });
  } else {
    try {
      const appUrl = new URL(rawAppUrl);
      if (isLocalhostHost(appUrl.hostname)) {
        issues.push({
          code: "localhost_app_url",
          severity: deploymentTarget === "production" ? "error" : "warning",
          message:
            deploymentTarget === "production"
              ? "The public app URL points at a local-only address. Production auth emails and Stripe redirects must use the public app domain."
              : "The public app URL points at a local-only address. This is fine locally, but production auth emails and Stripe redirects must use the public app domain."
        });
      }

      if (deploymentTarget === "production" && appUrl.protocol !== "https:") {
        issues.push({
          code: "insecure_app_url_protocol",
          severity: "error",
          message: "The public app URL must use https:// in production."
        });
      }
    } catch {
      issues.push({
        code: "invalid_app_url",
        severity: "error",
        message: "The public app URL is not a valid URL."
      });
    }
  }

  if (!rawSupabaseUrl) {
    issues.push({
      code: "missing_supabase_url",
      severity: "error",
      message: "NEXT_PUBLIC_SUPABASE_URL is missing."
    });
  } else {
    try {
      const supabaseUrl = new URL(rawSupabaseUrl);
      if (deploymentTarget === "production" && supabaseUrl.protocol !== "https:") {
        issues.push({
          code: "insecure_supabase_url_protocol",
          severity: "error",
          message: "NEXT_PUBLIC_SUPABASE_URL must use https:// in production."
        });
      }
    } catch {
      issues.push({
        code: "invalid_supabase_url",
        severity: "error",
        message: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL."
      });
    }
  }

  if (!rawSupabaseAnonKey) {
    issues.push({
      code: "missing_supabase_anon_key",
      severity: "error",
      message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing."
    });
  }

  return {
    deploymentTarget,
    issues,
    errors: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warning")
  };
}

export function getMetadataBaseUrl() {
  const diagnostics = getPublicEnvironmentDiagnostics();

  if (diagnostics.deploymentTarget === "production") {
    const appUrlIssue = diagnostics.errors.find((issue) =>
      ["missing_app_url", "invalid_app_url", "localhost_app_url", "insecure_app_url_protocol"].includes(issue.code)
    );

    if (appUrlIssue) {
      throw new Error(appUrlIssue.message);
    }
  }

  return new URL(env.appUrl);
}
