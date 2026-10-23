import { filterProperties, validActor, type Actor, type EventName } from "./schema.ts";
import { commonProperties, type AnalyticsConfig } from "./config.ts";
export type StoredEvent = { id: string; event: EventName; actor_id: string; actor_role: Actor["role"]; properties: unknown; occurred_at: string; environment: string; is_internal: boolean; is_test: boolean };
export type FailureCategory = "network_error" | "timeout" | "rate_limited" | "server_error" | "client_rejected" | "configuration_error" | "unknown_error";
export type DeliveryOutcome =
  | { kind: "accepted"; meaning: "ingestion_only" }
  | { kind: "retryable" | "permanent" | "configuration" | "unknown"; category: FailureCategory };
export async function sendEvent(config: AnalyticsConfig, row: StoredEvent, request: typeof fetch = fetch): Promise<DeliveryOutcome> {
  const actor = { id: row.actor_id, role: row.actor_role };
  const properties = filterProperties(row.event, row.properties);
  if (!validActor(actor) || !properties || row.environment !== config.environment || !Number.isFinite(Date.parse(row.occurred_at)))
    return { kind: "configuration", category: "configuration_error" };
  try {
    const response = await request(`${config.host}/i/v0/e/`, {
      method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error",
      signal: AbortSignal.timeout(3000),
      body: JSON.stringify({ api_key: config.token, uuid: row.id, event: row.event, distinct_id: actor.id, timestamp: row.occurred_at,
        properties: { ...properties, ...commonProperties(config, actor), is_internal: row.is_internal, is_test: row.is_test,
          $geoip_disable: true, $ip: null, $process_person_profile: true } })
    });
    if (response.ok) return { kind: "accepted", meaning: "ingestion_only" };
    if (response.status === 429) return { kind: "retryable", category: "rate_limited" };
    if (response.status >= 500) return { kind: "retryable", category: "server_error" };
    if (response.status === 401 || response.status === 403)
      return { kind: "configuration", category: "configuration_error" };
    if (response.status >= 400) return { kind: "permanent", category: "client_rejected" };
    return { kind: "unknown", category: "unknown_error" };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return { kind: "retryable", category: "timeout" };
    if (error instanceof TypeError) return { kind: "retryable", category: "network_error" };
    return { kind: "unknown", category: "unknown_error" };
  } // Never persist or log request bodies, tokens, headers or raw errors.
}
