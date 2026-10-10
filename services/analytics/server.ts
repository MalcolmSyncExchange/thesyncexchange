import "server-only";
import { env, getDeploymentTarget } from "@/lib/env";
import { resolveAnalyticsConfig, commonProperties } from "@/lib/analytics/config";
import { filterProperties, validActor, type Actor, type EventName, type EventProperties } from "@/lib/analytics/schema";
import { sendEvent, type StoredEvent } from "@/lib/analytics/transport";
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
export async function deliverEvent(id?: string): Promise<boolean> {
  const config = analyticsConfig();
  if (!config) return false;
  const db = createAdminSupabaseClient();
  if (!db) return false;
  const { data, error } = await db.rpc("claim_analytics_event", { p_environment: config.environment, ...(id ? { p_id: id } : {}) }).abortSignal(AbortSignal.timeout(3000));
  if (error) return false;
  const row = data?.[0];
  if (!row) return false;
  if (!(await sendEvent(config, row as StoredEvent))) return false;
  const { error: ackError } = await db.from("analytics_outbox").update({ delivered_at: new Date().toISOString(), lease_until: null })
    .eq("id", row.id).eq("lease_id", row.lease_id!).abortSignal(AbortSignal.timeout(3000));
  return !ackError;
}
// Ordinary analytics must not affect signup, saving, or checkout outcomes.
export async function captureEvent<E extends Exclude<EventName, "purchase_verified">>(actor: Actor, event: E, properties: EventProperties<E>, dedupeKey?: string) {
  try { const id = await enqueueEvent(actor, event, properties, dedupeKey); if (id) await deliverEvent(id); } catch { /* pending rows can be retried; no private logging */ }
}
