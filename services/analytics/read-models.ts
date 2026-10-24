import "server-only";
import { getAnalyticsActor } from "./actor";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { readAnalyticsSource } from "@/lib/analytics/intelligence/source-reader";
import { buildSECReadModels, validateReportRequest, type ReadRequest } from "@/lib/analytics/intelligence/read-models";
import { FUNNELS } from "@/lib/analytics/intelligence/contracts";
import type { EventName } from "@/lib/analytics/schema";
import { previousPeriod } from "@/lib/analytics/intelligence/time";

/** Eight seconds shared across authorization/pagination; reserve two for aggregation. */
export async function readSECAnalytics(request: ReadRequest, instrumentedEvents: readonly EventName[]) {
  const deadlineAt = Date.now() + 10000;
  request = { ...request, seriesMetric: request.seriesMetric ?? "track_preview_started" };
  validateReportRequest(request);
  const queryRange = {
    startInclusive: request.comparePrevious ? previousPeriod(request.range).startInclusive : request.range.startInclusive,
    endExclusive: new Date(Date.parse(request.range.endExclusive) + request.maxStepLagMs * Math.max(...Object.values(FUNNELS).map(f => f.steps.length - 1))).toISOString()
  };
  const source = await readAnalyticsSource({
    authorizeAdmin: async () => (await getAnalyticsActor())?.role === "admin",
    openReader: () => {
      const db = createAdminSupabaseClient();
      if (!db) return null;
      return async query => {
        const { data, error } = await db.from("analytics_outbox")
          .select("id,actor_id,actor_role,event,occurred_at,environment,is_test,is_internal,properties,delivery_status")
          .eq("environment", query.environment).in("actor_role", ["artist", "buyer"]).eq("is_test", false).eq("is_internal", false)
          .gte("occurred_at", query.startInclusive).lt("occurred_at", query.endExclusive)
          .order("occurred_at", { ascending: true }).order("id", { ascending: true })
          .range(query.offset, query.offset + query.limit - 1).abortSignal(AbortSignal.any([query.signal, AbortSignal.timeout(5000)]));
        return { rows: data, error: !!error };
      };
    }
  }, queryRange, request.environment, instrumentedEvents);
  const result = buildSECReadModels(source, { ...request, deadlineAt: Math.min(deadlineAt, Date.now() + 2000) });
  if (Date.now() >= deadlineAt) throw new Error("analytics_report_deadline");
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 2000000) throw new Error("analytics_report_payload_budget");
  if (Date.now() >= deadlineAt) throw new Error("analytics_report_deadline");
  return result;
}
