import type { Actor } from "./schema.ts";
export type AnalyticsEnvironment = "production" | "preview";
export type AnalyticsConfig = { token: string; host: string; environment: AnalyticsEnvironment; internalIds: string[]; testIds: string[] };
export function resolveAnalyticsConfig(vars: Record<string, string | undefined>, target: string): AnalyticsConfig | null {
  if (vars.ANALYTICS_ENABLED !== "true" || vars.SYNC_EXCHANGE_DEMO_MODE === "true" || !["production", "preview"].includes(target)) return null;
  // Distinct variables prevent a preview from silently falling back to production.
  const token = target === "production" ? vars.POSTHOG_PRODUCTION_TOKEN : vars.POSTHOG_PREVIEW_TOKEN;
  const host = vars.POSTHOG_HOST;
  if (!host || !token || !/^phc_[A-Za-z0-9]+$/.test(token) || !["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(host)) return null;
  if (target === "preview" && token === vars.POSTHOG_PRODUCTION_TOKEN) return null;
  return { token, host, environment: target as AnalyticsEnvironment, internalIds: (vars.ANALYTICS_INTERNAL_USER_IDS || "").split(",").map(x => x.trim()), testIds: (vars.ANALYTICS_TEST_USER_IDS || "").split(",").map(x => x.trim()) };
}
export function commonProperties(config: AnalyticsConfig, actor: Actor) {
  return { app: "the-sync-exchange", event_version: 1, environment: config.environment, role: actor.role,
    is_internal: actor.role === "admin" || config.internalIds.includes(actor.id),
    is_test: config.environment !== "production" || config.testIds.includes(actor.id) };
}
