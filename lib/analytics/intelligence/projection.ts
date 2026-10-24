import { eventSchemas, filterProperties, validActor, type EventName } from "../schema.ts";
import type { FunnelObservation } from "./contracts.ts";

/** Map one Phase 1 outbox row to the privacy-limited Phase 2 read contract. */
export function projectOutboxObservation(input: unknown): FunnelObservation | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  if (typeof row.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id) ||
      typeof row.actor_id !== "string" || (row.actor_role !== "artist" && row.actor_role !== "buyer") ||
      !validActor({ id: row.actor_id, role: row.actor_role }) || typeof row.event !== "string" ||
      !Object.hasOwn(eventSchemas, row.event) || typeof row.occurred_at !== "string" ||
      !Number.isFinite(Date.parse(row.occurred_at)) || (row.environment !== "preview" && row.environment !== "production") ||
      typeof row.is_test !== "boolean" || typeof row.is_internal !== "boolean") return null;
  const event = row.event as EventName;
  const safe = filterProperties(event, row.properties);
  if (!safe) return null;
  const properties = safe as Record<string, unknown>;
  const id = (name: string) => typeof properties[name] === "string" ? properties[name] as string : undefined;
  return { eventId: row.id, actorId: row.actor_id, actorRole: row.actor_role, event,
    occurredAt: row.occurred_at, environment: row.environment, isTest: row.is_test, isInternal: row.is_internal,
    ...(event === "catalog_reviewed" ? { reviewState: properties.state as "approved"|"changes_requested"|"rejected" } : {}),
    ...(event === "submission_completed" ? { isResubmission: properties.is_resubmission as boolean } : {}),
    ...(id("deal_id") ? { dealId: id("deal_id") } : {}), trackId: id("track_id"), orderId: id("order_id"),
    submissionAttemptId: id("submission_attempt_id"), checkoutAttemptId: id("checkout_attempt_id") };
}
