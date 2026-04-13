import type { AppSupabaseClient } from "@/services/supabase/types";
import { isMissingRelationError, warnSchemaFallbackOnce } from "@/services/supabase/schema-compat";
import type { Json } from "@/types/database";

export async function appendOrderActivityLog(
  supabase: AppSupabaseClient,
  {
    orderId,
    actorId,
    source,
    eventType,
    message,
    metadata,
    dedupeKey
  }: {
    orderId: string;
    actorId?: string | null;
    source: "system" | "stripe_webhook" | "admin" | "buyer";
    eventType: string;
    message?: string | null;
    metadata?: Record<string, unknown>;
    dedupeKey?: string | null;
  }
) {
  const { error } = await supabase.from("order_activity_log").insert({
    order_id: orderId,
    actor_id: actorId || null,
    source,
    event_type: eventType,
    message: message || null,
    metadata: (metadata || {}) as Json,
    dedupe_key: dedupeKey || null
  });

  if (error && isMissingRelationError(error, "order_activity_log")) {
    warnSchemaFallbackOnce(
      "order-activity-log-write",
      "order_activity_log is not available yet; order activity auditing is degraded until migration 0010 is applied.",
      error
    );
    return;
  }

  if (error) {
    throw error;
  }
}

export async function hasProcessedOrderDedupeKey(supabase: AppSupabaseClient, dedupeKey?: string | null) {
  if (!dedupeKey) {
    return false;
  }

  const { data, error } = await supabase.from("order_activity_log").select("id").eq("dedupe_key", dedupeKey).maybeSingle();

  if (error && isMissingRelationError(error, "order_activity_log")) {
    warnSchemaFallbackOnce(
      "order-activity-log-read",
      "order_activity_log is not available yet; webhook dedupe and recent activity fall back to best-effort behavior until migration 0010 is applied.",
      error
    );
    return false;
  }

  if (error) {
    throw error;
  }

  return Boolean(data);
}
