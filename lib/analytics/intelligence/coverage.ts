/** Coverage is evidence about the source and its watermark, not a guess from wall time. */
export type CoverageState = "observation_window_open" | "observation_window_closed" |
  "late_arrival_allowance_active" | "source_coverage_incomplete" |
  "source_coverage_verified" | "finalized_funnel_result";
export const DEFAULT_LATE_ARRIVAL_MS = 24 * 60 * 60 * 1000;
export type FunnelCoverageInput = {
  windowEndExclusive: string;
  observedThrough: string;
  sourceCoverageVerified: boolean;
  now?: Date;
  lateArrivalMs?: number;
};
export type FunnelCoverage = { states: CoverageState[]; finalized: boolean; lateArrivalDeadline: string | null };

export function assessFunnelCoverage(input: FunnelCoverageInput): FunnelCoverage {
  const now = (input.now ?? new Date()).getTime();
  const end = Date.parse(input.windowEndExclusive);
  const watermark = Date.parse(input.observedThrough);
  const allowance = input.lateArrivalMs ?? DEFAULT_LATE_ARRIVAL_MS;
  if (![now, end, watermark, allowance].every(Number.isFinite) || allowance < 0 ||
      allowance > 30 * DEFAULT_LATE_ARRIVAL_MS) {
    return { states: ["source_coverage_incomplete"], finalized: false, lateArrivalDeadline: null };
  }
  const deadline = end + allowance;
  const states: CoverageState[] = [now < end ? "observation_window_open" : "observation_window_closed"];
  if (now >= end && now < deadline) states.push("late_arrival_allowance_active");
  const verified = input.sourceCoverageVerified && watermark >= deadline;
  states.push(verified ? "source_coverage_verified" : "source_coverage_incomplete");
  const finalized = now >= deadline && verified;
  if (finalized) states.push("finalized_funnel_result");
  return { states, finalized, lateArrivalDeadline: new Date(deadline).toISOString() };
}
