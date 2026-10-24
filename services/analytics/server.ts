import "server-only";
import { env, getDeploymentTarget } from "@/lib/env";
import { resolveAnalyticsConfig, commonProperties } from "@/lib/analytics/config";
import { filterProperties, validActor, type Actor, type EventName, type EventProperties } from "@/lib/analytics/schema";
import { sendEvent, type StoredEvent } from "@/lib/analytics/transport";
import { nextRetryAt } from "@/lib/analytics/retry";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import type { Json } from "@/types/database";

export function analyticsConfig() {
  try { return resolveAnalyticsConfig({ ...process.env, SYNC_EXCHANGE_DEMO_MODE: String(env.demoMode) }, getDeploymentTarget()); }
  catch { return null; }
}
export async function enqueueEvent<E extends EventName>(actor: Actor, event: E, properties: EventProperties<E>, dedupeKey?: string): Promise<string | null> {
  const config = analyticsConfig();
  const safe = filterProperties(event, properties);
  if (!config || !validActor(actor) || !safe) return null;
  const db = createAdminSupabaseClient();
  if (!db) throw new Error("analytics_unavailable");
  const flags = commonProperties(config, actor);
  const { data, error } = await db.rpc("enqueue_analytics_event", {
    p_environment: config.environment, p_event: event, p_actor_id: actor.id, p_actor_role: actor.role,
    p_properties: safe as Json, p_dedupe_key: dedupeKey || crypto.randomUUID(),
    p_is_internal: flags.is_internal, p_is_test: flags.is_test || (event === "purchase_verified" && "payment_mode" in safe && safe.payment_mode === "test")
  }).abortSignal(AbortSignal.timeout(3000));
  if (error) throw new Error("analytics_enqueue_failed");
  return data;
}
export type DeliveryAttempt = "accepted" | "failed" | "empty" | "unavailable";
export async function attemptDelivery(id?: string): Promise<DeliveryAttempt> {
  const config = analyticsConfig();
  if (!config) return "empty";
  const db = createAdminSupabaseClient();
  if (!db) return "unavailable";
  const { data, error } = await db.rpc("claim_analytics_event", { p_environment: config.environment, ...(id ? { p_id: id } : {}) }).abortSignal(AbortSignal.timeout(3000));
  if (error) return "unavailable";
  const row = data?.[0];
  if (!row || !row.lease_id) return "empty";
  const permission = await db.rpc("analytics_delivery_allowed", { p_id: row.id, p_lease: row.lease_id }).abortSignal(AbortSignal.timeout(3000));
  if (permission.error) return "unavailable";
  if (permission.data !== true) return "empty";
  const outcome = await sendEvent(config, row as StoredEvent);
  if (outcome.kind === "accepted") {
    const { data: completed, error: ackError } = await db.rpc("complete_analytics_event", {
      p_id: row.id, p_lease_id: row.lease_id
    }).abortSignal(AbortSignal.timeout(3000));
    return !ackError && completed ? "accepted" : "unavailable";
  }
  const retryAt = outcome.kind === "retryable" || outcome.kind === "unknown"
    ? nextRetryAt(row.attempt_count, new Date()) : null;
  const { data: failed, error: failError } = await db.rpc("fail_analytics_event", { p_id: row.id, p_lease_id: row.lease_id,
    p_category: outcome.category, p_retry_at: retryAt }).abortSignal(AbortSignal.timeout(3000));
  return !failError && failed ? "failed" : "unavailable";
}
export async function deliverEvent(id?: string): Promise<boolean> { return (await attemptDelivery(id)) === "accepted"; }
// Ordinary analytics must not affect signup, saving, or checkout outcomes.
export async function captureEvent<E extends Exclude<EventName, "purchase_verified">>(actor: Actor, event: E, properties: EventProperties<E>, dedupeKey?: string) {
  try { await enqueueEvent(actor, event, properties, dedupeKey); } catch { /* pending rows can be retried; no private logging */ }
}
