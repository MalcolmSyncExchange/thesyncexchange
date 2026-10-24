import { validateReportRequest } from "./read-models.ts";
import { validateRange, timeBuckets, type Granularity } from "./time.ts";
import type { MetricCard } from "./read-models.ts";
export function dashboardRequest(params: Record<string, string | string[] | undefined>, now = new Date()) {
  const scalar = (key: string) => typeof params[key] === "string" ? params[key] as string : undefined;
  const end = scalar("end") ?? now.toISOString().slice(0,10);
  const start = scalar("start") ?? new Date(Date.parse(end) - 16 * 86400000).toISOString().slice(0,10);
  if (![start,end].every(x => /^\d{4}-\d{2}-\d{2}$/.test(x) && new Date(x).toISOString().slice(0,10) === x)) throw new Error("Choose valid dates.");
  const range = { startInclusive: start + "T00:00:00.000Z", endExclusive: end + "T00:00:00.000Z" };
  validateRange(range);
  const followUpEnd = Date.parse(range.endExclusive) + 6 * 86400000;
  const queryStart = Date.parse(range.startInclusive) - (scalar("compare") === "yes" ? Date.parse(range.endExclusive) - Date.parse(range.startInclusive) : 0);
  validateRange({ startInclusive: new Date(queryStart).toISOString(), endExclusive: new Date(followUpEnd).toISOString() });
  const granularity = (scalar("interval") ?? "day") as Granularity;
  timeBuckets(range, granularity, "UTC");
  const trackPage = Number(scalar("trackPage") ?? "1");
  const request = { range, environment: (scalar("environment") ?? "preview") as "preview"|"production", timezone: "UTC", granularity, now, maxStepLagMs: 86400000, comparePrevious: scalar("compare") === "yes", seriesMetric: scalar("seriesMetric") ?? "track_preview_started", trackPage };
  validateReportRequest(request);
  return request;
}
export function metricText(card: MetricCard) {
  return card.metric.value === null ? "Unavailable" : card.metric.value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
export function confidence(card: MetricCard) {
  return `${card.metric.state.replaceAll("_", " ")} · ${card.coverage.finalized ? "Finalized" : "Provisional"}`;
}
