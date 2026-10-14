import { isDedicatedStagingDeploymentIdentity } from "../staging-identity.ts";
import type { Actor } from "./schema.ts";
export type AnalyticsEnvironment = "production" | "preview";
export type AnalyticsConfig = { token: string; host: string; environment: AnalyticsEnvironment; internalIds: string[]; testIds: string[] };
export function resolveAnalyticsConfig(vars: Record<string, string | undefined>, target: string): AnalyticsConfig | null {
  if (vars.ANALYTICS_ENABLED !== "true" || vars.SYNC_EXCHANGE_DEMO_MODE === "true" || !["production", "preview"].includes(target)) return null;
  // Fail closed on a staging claim that does not satisfy the independently
  // captured platform/build identity contract. Never fall back to production.
  const stagingClaim = vars.SYNC_EXCHANGE_DEPLOYMENT_CLASS === "dedicated-staging" ||
    vars.SITE_ID === "d8e851a6-ab37-4b0e-9403-9b2c1be65f13" ||
    vars.TSE_BUILD_NETLIFY_SITE_ID === "d8e851a6-ab37-4b0e-9403-9b2c1be65f13" ||
    vars.NEXT_PUBLIC_APP_URL === "https://sync-exchange-posthog-staging.netlify.app" ||
    vars.NEXT_PUBLIC_SUPABASE_URL === "https://oppijylbkcbiqfuvckgj.supabase.co";
  const dedicatedStaging = target === "production" && stagingClaim;
  if (dedicatedStaging && !isDedicatedStagingDeploymentIdentity(vars, target)) return null;
  if (target === "preview" && vars.CONTEXT === "production") return null;
  const environment: AnalyticsEnvironment = dedicatedStaging ? "preview" : target as AnalyticsEnvironment;
  // Distinct variables; no cross-environment fallback, even when one is absent.
  const token = environment === "production" ? vars.POSTHOG_PRODUCTION_TOKEN : vars.POSTHOG_PREVIEW_TOKEN;
  const host = vars.POSTHOG_HOST;
  if (!host || !token || !/^phc_[A-Za-z0-9]+$/.test(token) || !["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(host)) return null;
  if (dedicatedStaging && host !== "https://us.i.posthog.com") return null;
  if (vars.POSTHOG_PRODUCTION_TOKEN && vars.POSTHOG_PREVIEW_TOKEN &&
    vars.POSTHOG_PRODUCTION_TOKEN === vars.POSTHOG_PREVIEW_TOKEN) return null;
  return { token, host, environment, internalIds: (vars.ANALYTICS_INTERNAL_USER_IDS || "").split(",").map(x => x.trim()), testIds: (vars.ANALYTICS_TEST_USER_IDS || "").split(",").map(x => x.trim()) };
}
export function commonProperties(config: AnalyticsConfig, actor: Actor) {
  return { app: "the-sync-exchange", event_version: 1, environment: config.environment, role: actor.role,
    is_internal: actor.role === "admin" || config.internalIds.includes(actor.id),
    is_test: config.environment !== "production" || config.testIds.includes(actor.id) };
}
