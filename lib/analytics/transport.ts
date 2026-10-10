import { filterProperties, validActor, type Actor, type EventName } from "./schema.ts";
import { commonProperties, type AnalyticsConfig } from "./config.ts";
export type StoredEvent = { id: string; event: EventName; actor_id: string; actor_role: Actor["role"]; properties: unknown; occurred_at: string; environment: string; is_internal: boolean; is_test: boolean };
export async function sendEvent(config: AnalyticsConfig, row: StoredEvent, request: typeof fetch = fetch): Promise<boolean> {
  const actor = { id: row.actor_id, role: row.actor_role };
  const properties = filterProperties(row.event, row.properties);
  if (!validActor(actor) || !properties || row.environment !== config.environment || !Number.isFinite(Date.parse(row.occurred_at))) return false;
  try {
    const response = await request(`${config.host}/i/v0/e/`, {
      method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error",
      signal: AbortSignal.timeout(3000),
      body: JSON.stringify({ api_key: config.token, uuid: row.id, event: row.event, distinct_id: actor.id, timestamp: row.occurred_at,
        properties: { ...properties, ...commonProperties(config, actor), is_internal: row.is_internal, is_test: row.is_test,
          $geoip_disable: true, $ip: null, $process_person_profile: true } })
    });
    return response.ok;
  } catch { return false; } // Never log request bodies, tokens, or raw errors.
}
