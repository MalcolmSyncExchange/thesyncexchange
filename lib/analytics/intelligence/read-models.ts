import { FUNNELS, numberMetric, sourceMetric, unavailableMetric, type FunnelObservation, type FunnelName, type Metric, type SourceState } from "./contracts.ts";
import { assessFunnelCoverage, type FunnelCoverage } from "./coverage.ts";
import { calculateFunnel, type FunnelReport } from "./funnel.ts";
import { previousPeriod, timeBuckets, validateRange, type TimeRange, type Granularity } from "./time.ts";
import type { EventName } from "../schema.ts";

export type ReadSource = {
  state: SourceState;
  type: "local_outbox" | "fixture";
  observations: readonly FunnelObservation[];
  instrumentedEvents: readonly EventName[];
  queriedRange: TimeRange;
  /** Independently verified watermark, never latest event or ingestion acknowledgement. */
  observedThrough: string;
  coverageVerified: boolean;
  lastUpdatedAt: string | null;
  delivery?: Partial<Record<"pending" | "processing" | "retry_scheduled" | "held" | "exhausted" | "delivered", number>>;
};
export type MetricCard = {
  id: string; label: string; metric: Metric<number>; range: TimeRange;
  comparison: { range: TimeRange; metric: Metric<number>; coverage: FunnelCoverage } | null;
  sourceType: ReadSource["type"]; coverage: FunnelCoverage; lastUpdatedAt: string | null;
};
export type SECReadModels = {
  trackPage: { page: number; pageSize: number; total: number | null; pages: number | null };
  intelligence: MetricCard[];
  funnels: { id: FunnelName; report: FunnelReport; comparison: FunnelReport | null; coverage: FunnelCoverage; metrics: MetricCard[] }[];
  marketplace: MetricCard[];
  tracks: { trackId: string; metrics: MetricCard[] }[];
  eventHealth: MetricCard[];
  series: { range: TimeRange; metrics: MetricCard[] }[];
};
export type ReadRequest = {
  range: TimeRange; environment: "preview" | "production"; timezone: string; granularity: Granularity;
  now: Date; maxStepLagMs: number; lateArrivalMs?: number; comparePrevious?: boolean;
  /** Named cohorts remain internal; actor membership is never included in aggregate responses. */
  cohortActorIds?: ReadonlySet<string>;
  trackPage?: number;
  seriesMetric?: string;
  deadlineAt?: number;
};
const activity: Record<"artist" | "buyer", readonly EventName[]> = {
  artist: ["onboarding_started", "onboarding_completed", "submission_started", "submission_completed"],
  buyer: ["catalog_searched", "track_preview_started", "license_selected", "checkout_started", "purchase_verified"]
};
function coverage(source: ReadSource, request: ReadRequest, range: TimeRange, followUpSteps = 0): FunnelCoverage {
  return assessFunnelCoverage({ windowEndExclusive: new Date(Date.parse(range.endExclusive) + request.maxStepLagMs * followUpSteps).toISOString(),
    observedThrough: source.observedThrough, sourceCoverageVerified: source.state === "available" && source.coverageVerified,
    now: request.now, lateArrivalMs: request.lateArrivalMs });
}
function normalized(source: ReadSource, request: ReadRequest): ReadSource {
  if (source.observations.length > 10000) return { ...source, state: "insufficient_evidence", observations: [] };
  if (source.state !== "available") return { ...source, observations: [] };
  const byId = new Map<string, FunnelObservation>();
  for (const row of source.observations) {
    if (row.environment !== request.environment || row.isTest || row.isInternal ||
        (request.cohortActorIds && !request.cohortActorIds.has(row.actorId))) continue;
    if (!Number.isFinite(Date.parse(row.occurredAt))) return { ...source, state: "insufficient_evidence", observations: [] };
    const old = byId.get(row.eventId);
    if (old && JSON.stringify(old) !== JSON.stringify(row)) return { ...source, state: "insufficient_evidence", observations: [] };
    byId.set(row.eventId, row);
  }
  return { ...source, observations: [...byId.values()] };
}
export const SERIES_METRIC_IDS = ["active_artists", "repeat_artists", "active_buyers", "repeat_buyers", "signup_completed", "onboarding_started", "onboarding_completed", "submission_started", "submission_completed", "catalog_searched", "track_preview_started", "license_selected", "checkout_started", "purchase_verified", "resubmissions", "buyer_signups", "catalog_review_approval_percent", "published_tracks", "rights_approved", "catalog_published", "asset_delivery_completed", "asset_delivery_failed", "refund_verified", "dispute_verified"] as const;
export function validateReportRequest(request: ReadRequest) {
  validateRange(request.range);
  if (!["preview","production"].includes(request.environment)) throw new Error("analytics_invalid_environment");
  if (request.seriesMetric !== undefined && !SERIES_METRIC_IDS.some(id => id === request.seriesMetric)) throw new Error("analytics_invalid_series_metric");
  if (request.granularity === "hour" && Date.parse(request.range.endExclusive) - Date.parse(request.range.startInclusive) > 7 * 86400000)
    throw new Error("Hourly reports support at most seven days. Choose a shorter range or a daily interval.");
  if (!Number.isInteger(request.trackPage ?? 1) || (request.trackPage ?? 1) < 1 || (request.trackPage ?? 1) > 10)
    throw new Error("analytics_invalid_track_page");
}
function checkDeadline(request: ReadRequest) {
  if (request.deadlineAt !== undefined && Date.now() >= request.deadlineAt) throw new Error("analytics_report_deadline");
}
// Parse and sort once. Lower bounds preserve half-open windows and equal timestamps.
function rangeReader(source: ReadSource, request: ReadRequest) {
  const sorted = source.observations.map(row => ({ row, time: Date.parse(row.occurredAt) }))
    .sort((a, b) => a.time - b.time || a.row.eventId.localeCompare(b.row.eventId));
  const lower = (time: number) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (sorted[mid].time < time) lo = mid + 1; else hi = mid; }
    return lo;
  };
  return (range: TimeRange) => {
    checkDeadline(request);
    return sorted.slice(lower(Date.parse(range.startInclusive)), lower(Date.parse(range.endExclusive))).map(item => item.row);
  };
}
function availability(source: ReadSource, events: readonly EventName[], range: TimeRange): SourceState {
  if (source.state !== "available") return source.state;
  if (Date.parse(source.queriedRange.startInclusive) > Date.parse(range.startInclusive) || Date.parse(source.queriedRange.endExclusive) < Date.parse(range.endExclusive)) return "insufficient_evidence";
  return events.every(event => source.instrumentedEvents.includes(event)) ? "available" : "unavailable_instrumentation";
}
function aggregate(source: ReadSource, range: TimeRange, rows: readonly FunnelObservation[], requestedMetric?: string): Map<string, { label: string; metric: Metric<number> }> {
  const result = new Map<string, { label: string; metric: Metric<number> }>();
  const add = (id: string, label: string, events: readonly EventName[], count: () => number) => {
    if (requestedMetric && id !== requestedMetric) return;
    const state = availability(source, events, range);
    result.set(id, { label, metric: state === "available" ? numberMetric(count()) : sourceMetric(state) });
  };
  for (const role of ["artist", "buyer"] as const) {
    const eligible = rows.filter(row => row.actorRole === role && activity[role].includes(row.event));
    const counts = new Map<string, number>();
    for (const row of eligible) counts.set(row.actorId, (counts.get(row.actorId) ?? 0) + 1);
    add(`active_${role}s`, `Active ${role}s`, activity[role], () => counts.size);
    add(`repeat_${role}s`, `Repeat ${role} engagement`, activity[role], () => [...counts.values()].filter(count => count >= 2).length);
  }
  for (const [event, label] of Object.entries({ signup_completed: "Signups", onboarding_started: "Onboarding entries", onboarding_completed: "Onboarding completions",
    submission_started: "Submission attempts", submission_completed: "Completed submissions", catalog_searched: "Searches", track_preview_started: "Previews",
    license_selected: "License selections", checkout_started: "Checkout attempts", purchase_verified: "Verified purchases" }) as [EventName, string][]) {
    const role = ["signup_completed", "onboarding_started", "onboarding_completed", "submission_started", "submission_completed"].includes(event) ? "artist" : ["catalog_searched", "track_preview_started", "license_selected", "checkout_started", "purchase_verified"].includes(event) ? "buyer" : null;
    add(event, label, [event], () => rows.filter(row => row.event === event && (!role || row.actorRole === role)).length);
  }
  for (const event of ["rights_approved", "catalog_published", "asset_delivery_completed", "asset_delivery_failed", "refund_verified", "dispute_verified"] as const)
    add(event, event.replaceAll("_", " "), [event], () => rows.filter(row => row.event === event).length);
  add("buyer_signups", "New Buyer registrations", ["signup_completed"], () => rows.filter(row => row.event === "signup_completed" && row.actorRole === "buyer").length);
  const reviewed = rows.filter(row=>row.event==="catalog_reviewed");
  add("catalog_review_approval_percent", "Catalog review approval % (decisions)", ["catalog_reviewed"], ()=>100*reviewed.filter(row=>row.reviewState==="approved").length/reviewed.length);
  if ((!requestedMetric || requestedMetric==="catalog_review_approval_percent") && availability(source,["catalog_reviewed"],range)==="available" && (!reviewed.length || reviewed.some(row=>!row.reviewState))) result.set("catalog_review_approval_percent",{label:"Catalog review approval % (decisions)",metric:unavailableMetric(!reviewed.length?"not_applicable":"insufficient_evidence")});
  add("published_tracks", "Unique tracks published in window", ["catalog_published"], ()=>new Set(rows.filter(row=>row.event==="catalog_published"&&row.trackId).map(row=>row.trackId)).size);
  const submissions = rows.filter(row => row.event === "submission_completed" && row.actorRole === "artist");
  add("resubmissions", "Resubmissions", ["submission_completed"], () => submissions.filter(row => row.isResubmission === true).length);
  if ((!requestedMetric || requestedMetric === "resubmissions") && submissions.some(row => row.isResubmission === undefined)) result.set("resubmissions", { label: "Resubmissions", metric: sourceMetric("insufficient_evidence") });
  return result;
}
/** Pure aggregate boundary: no event, actor, order, search text or payload is returned. */
export function buildSECReadModels(raw: ReadSource, request: ReadRequest): SECReadModels {
  validateReportRequest(request);
  checkDeadline(request);
  if (!Number.isFinite(request.now.getTime()) || !Number.isFinite(request.maxStepLagMs) || request.maxStepLagMs <= 0 || request.maxStepLagMs > 7 * 86400000)
    throw new Error("analytics_invalid_observation_window");
  let source = normalized(raw, request);
  if (raw.observations.length > 10000) source = { ...source, state: "insufficient_evidence", observations: [] };
  const rowsIn = rangeReader(source, request);
  const previous = request.comparePrevious ? previousPeriod(request.range) : null;
  const card = (id: string, label: string, metric: Metric<number>, range = request.range, comparisonMetric?: Metric<number>, followUpSteps = 0): MetricCard => ({
    id, label, metric, range, sourceType: source.type, lastUpdatedAt: source.lastUpdatedAt,
    coverage: coverage(metric.value === null ? { ...source, coverageVerified: false } : source, request, range, followUpSteps), comparison: previous && comparisonMetric ? {
      range: previous, metric: comparisonMetric, coverage: coverage(comparisonMetric.value === null ? { ...source, coverageVerified: false } : source, request, previous, followUpSteps) } : null
  });
  const current = aggregate(source, request.range, rowsIn(request.range)), before = previous ? aggregate(source, previous, rowsIn(previous)) : null;
  const marketplace = [...current].map(([id, item]) => card(id, item.label, item.metric, request.range, before?.get(id)?.metric));
  const funnels = (Object.keys(FUNNELS) as FunnelName[]).map(id => {
    checkDeadline(request);
    const definition = FUNNELS[id];
    const calculate = (range: TimeRange) => {
      const followThrough = new Date(Date.parse(range.endExclusive) + request.maxStepLagMs * (definition.steps.length - 1)).toISOString();
      const required = { startInclusive: range.startInclusive, endExclusive: followThrough };
      const state = availability(source, definition.steps, required);
      return calculateFunnel({ funnel: id, source: state, instrumentedEvents: source.instrumentedEvents, observations: source.observations,
        environment: request.environment, deadlineAt: request.deadlineAt, window: { ...range, observedThrough: followThrough, maxStepLagMs: request.maxStepLagMs } });
    };
    const report = calculate(request.range), comparison = previous ? calculate(previous) : null;
    const metrics: MetricCard[] = [];
    const push = (key: string, label: string, metric: Metric<number>, other?: Metric<number>) => metrics.push(card(`${id}.${key}`, label, metric, request.range, other, definition.steps.length - 1));
    report.steps.forEach((step, i) => {
      push(`${step.event}.actors`, `${step.event} unique actors`, step.actors, comparison?.steps[i].actors);
      push(`${step.event}.attempts`, `${step.event} matched attempts`, step.matchedAttempts, comparison?.steps[i].matchedAttempts);
    });
    report.transitions.forEach((step, i) => {
      for (const key of ["converted", "conversionPercent", "attemptConversionPercent", "dropped", "dropOffPercent", "medianSeconds"] as const)
        push(`${step.from}.${step.to}.${key}`, `${step.from} to ${step.to} ${key}`, step[key], comparison?.transitions[i][key]);
    });
    push("overall", "Overall actor conversion %", report.overallConversionPercent, comparison?.overallConversionPercent);
    push("attempt_conversion", "Overall attempt conversion %", report.overallAttemptConversionPercent, comparison?.overallAttemptConversionPercent);
    push("median_seconds", "Median time to completion", report.completionMedianSeconds, comparison?.completionMedianSeconds);
    if (id === "buyer_checkout") {
      push("abandonment", "Checkout actors without observed purchase", report.transitions[1].dropped, comparison?.transitions[1].dropped);
      push("abandonment_percent", "Checkout drop-off %", report.transitions[1].dropOffPercent, comparison?.transitions[1].dropOffPercent);
    }
    return { id, report, comparison, coverage: coverage(report.steps[0].actors.value === null ? { ...source, coverageVerified: false } : source, request, request.range, definition.steps.length - 1), metrics };
  });
  const trackIds = [...new Set([...rowsIn(request.range), ...(previous ? rowsIn(previous) : [])].filter(row => row.actorRole === "buyer" && activity.buyer.includes(row.event)).map(row => row.trackId).filter((id): id is string => !!id))].sort();
  if (trackIds.length > 500) throw new Error("analytics_track_result_limit");
  const page = request.trackPage ?? 1, pageSize = 50, pages = Math.ceil(trackIds.length / pageSize);
  if (source.state === "available" && page > Math.max(1, pages)) throw new Error("analytics_track_page_out_of_range");
  const grouped = new Map<string, FunnelObservation[]>();
  for (const row of source.observations) if (row.trackId) {
    const group = grouped.get(row.trackId) ?? []; group.push(row); grouped.set(row.trackId, group);
  }
  const tracks = trackIds.slice((page - 1) * pageSize, page * pageSize).map(trackId => {
    checkDeadline(request);
    const trackRows = rangeReader({ ...source, observations: grouped.get(trackId) ?? [] }, request);
    const prior = previous ? aggregate(source, previous, trackRows(previous)) : null;
    return { trackId, metrics: [...aggregate(source, request.range, trackRows(request.range))].filter(([id]) => ["track_preview_started", "license_selected", "checkout_started", "purchase_verified", "active_buyers", "repeat_buyers"].includes(id)).map(([id, item]) =>
      card(`track.${id}`, item.label, item.metric, request.range, prior?.get(id)?.metric)) };
  });
  const eventHealth = ["pending", "processing", "retry_scheduled", "held", "exhausted", "delivered"].map(status => card(`delivery.${status}`, status,
    source.state !== "available" ? sourceMetric(source.state) : source.delivery?.[status as keyof NonNullable<ReadSource["delivery"]>] === undefined ? sourceMetric("insufficient_evidence") : numberMetric(source.delivery[status as keyof NonNullable<ReadSource["delivery"]>]!), source.queriedRange));
  return { trackPage: { page, pageSize, total: source.state === "available" ? trackIds.length : null, pages: source.state === "available" ? pages : null }, intelligence: [...marketplace, ...funnels.map(funnel => funnel.metrics.find(metric => metric.id.endsWith(".overall"))!)],
    marketplace, funnels, tracks, eventHealth, series: timeBuckets(request.range, request.granularity, request.timezone).map(range => {
      checkDeadline(request);
      const duration = Date.parse(request.range.endExclusive) - Date.parse(request.range.startInclusive);
      const priorRange = { startInclusive: new Date(Date.parse(range.startInclusive) - duration).toISOString(), endExclusive: new Date(Date.parse(range.endExclusive) - duration).toISOString() };
      const prior = previous ? aggregate(source, priorRange, rowsIn(priorRange), request.seriesMetric) : null;
      return { range, metrics: [...aggregate(source, range, rowsIn(range), request.seriesMetric)].map(([id, item]) => {
        const priorMetric = prior?.get(id)?.metric;
        const result = card(id, item.label, item.metric, range, priorMetric);
        if (result.comparison) result.comparison = { ...result.comparison, range: priorRange, coverage: coverage(priorMetric?.value === null ? { ...source, coverageVerified: false } : source, request, priorRange) };
        return result;
      }) };
    }) };
}
