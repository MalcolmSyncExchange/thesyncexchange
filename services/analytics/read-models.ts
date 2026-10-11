import "server-only";
import { getAnalyticsActor } from "./actor";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { readAnalyticsSource } from "@/lib/analytics/intelligence/source-reader";
import { buildSECReadModels, type ReadRequest } from "@/lib/analytics/intelligence/read-models";
import type { EventName } from "@/lib/analytics/schema";
import { previousPeriod, validateRange } from "@/lib/analytics/intelligence/time";

/** No route, scheduler, event delivery or dashboard UI is installed by Slice 3. */
export async function readSECAnalytics(request: ReadRequest, instrumentedEvents: readonly EventName[]) {
  validateRange(request.range);
  const queryRange = {
    startInclusive: request.comparePrevious ? previousPeriod(request.range).startInclusive : request.range.startInclusive,
    endExclusive: new Date(Date.parse(request.range.endExclusive) + request.maxStepLagMs * 4).toISOString()
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
          .range(query.offset, query.offset + query.limit - 1).abortSignal(AbortSignal.timeout(5000));
        return { rows: data, error: !!error };
      };
    }
  }, queryRange, request.environment, instrumentedEvents);
  return buildSECReadModels(source, request);
}
