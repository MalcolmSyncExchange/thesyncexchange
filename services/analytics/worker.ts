import "server-only";
import { attemptDelivery, analyticsConfig } from "./server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
export async function collectAnalyticsEvidence(): Promise<number> {
  const config = analyticsConfig();
  if (!config) return 0;
  const db = createAdminSupabaseClient();
  if (!db) throw new Error("analytics_collection_unavailable");
  const { data, error } = await db.rpc("collect_analytics_events", { p_environment: config.environment, p_limit: 200, p_internal_ids: config.internalIds, p_test_ids: config.testIds }).abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error("analytics_collection_unavailable");
  return data ?? 0;
}

/** Server entrypoint for a future scheduler. No schedule or public route is installed. */
export async function runAnalyticsDeliveryBatch(limit = 10): Promise<{ attempted: number; accepted: number }> {
  try { await collectAnalyticsEvidence(); } catch { /* Existing outbox retries remain independently recoverable. Last successful collection is visible in SEC. */ }
  const bound = Math.min(10, Math.max(0, Math.trunc(limit)));
  let attempted = 0;
  let accepted = 0;
  for (; attempted < bound;) {
    const outcome = await attemptDelivery();
    if (outcome === "empty") break;
    if (outcome === "unavailable") throw new Error("analytics_delivery_unavailable");
    attempted++;
    if (outcome === "accepted") accepted++;
  }
  return { attempted, accepted };
}
