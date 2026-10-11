import { projectOutboxObservation } from "./projection.ts";
import { validateRange, type TimeRange } from "./time.ts";
import type { ReadSource } from "./read-models.ts";
import type { EventName } from "../schema.ts";

export const SOURCE_PAGE_SIZE = 500;
export const SOURCE_ROW_LIMIT = 10000;
export type SourceQuery = TimeRange & { environment: "preview" | "production"; offset: number; limit: number };
export type SourcePage = { rows: unknown[] | null; error: boolean };
export type SourceDependencies = {
  /** Must read authenticated session and public.user_profiles.role. */
  authorizeAdmin: () => Promise<boolean>;
  /** Called only after authorization. Return a narrowly scoped service-role reader. */
  openReader: () => ((query: SourceQuery) => Promise<SourcePage>) | null;
};
/** Injectable orchestration for local mocks. Production wiring lives in a server-only module. */
export async function readAnalyticsSource(deps: SourceDependencies, range: TimeRange,
  environment: "preview" | "production", instrumentedEvents: readonly EventName[]): Promise<ReadSource> {
  if (!await deps.authorizeAdmin()) throw new Error("analytics_admin_required");
  validateRange(range);
  if (environment !== "preview" && environment !== "production") throw new Error("analytics_invalid_environment");
  const base: ReadSource = { state: "unavailable_source", type: "local_outbox", observations: [], instrumentedEvents,
    queriedRange: range, observedThrough: range.startInclusive, coverageVerified: false, lastUpdatedAt: null };
  try {
    const readPage = deps.openReader();
    if (!readPage) return base;
    const observations: ReadSource["observations"][number][] = [];
    const delivery: NonNullable<ReadSource["delivery"]> = { pending: 0, processing: 0, retry_scheduled: 0, held: 0, exhausted: 0, delivered: 0 };
    const seen = new Set<string>();
    // One sentinel page distinguishes exactly-at-cap results from truncated results.
    for (let offset = 0; offset <= SOURCE_ROW_LIMIT; offset += SOURCE_PAGE_SIZE) {
      const page = await readPage({ ...range, environment, offset, limit: SOURCE_PAGE_SIZE });
      if (page.error || !Array.isArray(page.rows)) return base;
      if (page.rows.length > SOURCE_PAGE_SIZE || observations.length + page.rows.length > SOURCE_ROW_LIMIT)
        return { ...base, state: "insufficient_evidence" };
      for (const raw of page.rows) {
        const row = projectOutboxObservation(raw);
        const status = (raw as Record<string, unknown>).delivery_status;
        if (!row || row.environment !== environment || row.isTest || row.isInternal || seen.has(row.eventId) ||
          Date.parse(row.occurredAt) < Date.parse(range.startInclusive) || Date.parse(row.occurredAt) >= Date.parse(range.endExclusive) ||
          typeof status !== "string" || !Object.hasOwn(delivery, status)) return { ...base, state: "insufficient_evidence" };
        seen.add(row.eventId);
        observations.push(row);
        delivery[status as keyof typeof delivery]!++;
      }
      if (page.rows.length < SOURCE_PAGE_SIZE) return { ...base, state: "available", observations, delivery };
    }
    return { ...base, state: "insufficient_evidence" };
  } catch { return base; }
}
