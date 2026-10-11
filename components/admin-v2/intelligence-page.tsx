import { requireSession } from "@/services/auth/session";
import { readSECAnalytics } from "@/services/analytics/read-models";
import { eventSchemas, type EventName } from "@/lib/analytics/schema";
import { dashboardRequest } from "@/lib/analytics/intelligence/dashboard";
import { IntelligenceDashboard, type IntelligenceView } from "./intelligence-dashboard";
export async function IntelligencePage({ view, params }: { view: IntelligenceView; params: Record<string,string|string[]|undefined> }) {
 await requireSession("admin");
 let request;
 try { request = dashboardRequest(params); } catch { return <div role="alert" className="rounded-xl border p-6">Invalid date range. Use valid UTC dates and a bounded range (maximum 93 days including comparison and follow-up). <a href="/admin/analytics">Reset dates</a></div>; }
 const data = await readSECAnalytics(request, Object.keys(eventSchemas) as EventName[]);
 const query = new URLSearchParams({ start: request.range.startInclusive.slice(0,10), end: request.range.endExclusive.slice(0,10), interval: request.granularity, ...(request.comparePrevious ? { compare: "yes" } : {}) });
 return <IntelligenceDashboard data={data} view={view} query={`?${query}`} />;
}
