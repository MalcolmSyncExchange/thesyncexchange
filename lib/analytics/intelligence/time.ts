export type TimeRange = { startInclusive: string; endExclusive: string };
export type Granularity = "hour" | "day" | "week" | "month";
export const MAX_WINDOW_MS = 93 * 86400000;
export function validateRange(range: TimeRange): void {
  const start = Date.parse(range.startInclusive), end = Date.parse(range.endExclusive);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > MAX_WINDOW_MS)
    throw new Error("analytics_invalid_range");
}
function calendar(ms: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(ms);
  const get = (key: string) => Number(parts.find(part => part.type === key)!.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}
/** Resolve civil midnight, including zones whose offset changes at midnight. */
function midnight(civil: number, timezone: string): number {
  let guess = civil;
  for (let i = 0; i < 8; i++) {
    const next = guess + civil - calendar(guess, timezone);
    if (next === guess) return guess;
    guess = next;
  }
  // A skipped civil midnight begins at the first instant belonging to that date.
  const day = new Date(civil).toISOString().slice(0, 10);
  let earliest = Infinity;
  for (let ms = civil - 18 * 3600000; ms <= civil + 18 * 3600000; ms += 60000) {
    if (new Date(calendar(ms, timezone)).toISOString().slice(0, 10) === day) earliest = Math.min(earliest, ms);
  }
  if (!Number.isFinite(earliest)) throw new Error("analytics_unsupported_calendar_boundary");
  return earliest;
}
export function timeBuckets(range: TimeRange, granularity: Granularity, timezone: string): TimeRange[] {
  validateRange(range);
  if (!["hour", "day", "week", "month"].includes(granularity)) throw new Error("analytics_invalid_granularity");
  const start = Date.parse(range.startInclusive), end = Date.parse(range.endExclusive);
  const local = new Date(calendar(start, timezone)); // Also validates IANA timezone.
  let cursor: number;
  let civil = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  if (granularity === "hour") cursor = start - local.getUTCMinutes() * 60000 - local.getUTCSeconds() * 1000 - start % 1000;
  else {
    if (granularity === "week") civil -= ((local.getUTCDay() + 6) % 7) * 86400000;
    if (granularity === "month") civil = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
    cursor = midnight(civil, timezone);
  }
  const result: TimeRange[] = [];
  while (cursor < end) {
    let next: number;
    if (granularity === "hour") next = cursor + 3600000;
    else {
      const date = new Date(civil);
      civil = granularity === "month" ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) : civil + (granularity === "week" ? 7 : 1) * 86400000;
      next = midnight(civil, timezone);
    }
    if (next <= cursor || result.length >= 2300) throw new Error("analytics_bucket_limit");
    result.push({ startInclusive: new Date(Math.max(start, cursor)).toISOString(), endExclusive: new Date(Math.min(end, next)).toISOString() });
    cursor = next;
  }
  return result;
}
/** Previous comparison has the same elapsed duration; calendar buckets still use the requested zone. */
export function previousPeriod(range: TimeRange): TimeRange {
  validateRange(range);
  const start = Date.parse(range.startInclusive), duration = Date.parse(range.endExclusive) - start;
  return { startInclusive: new Date(start - duration).toISOString(), endExclusive: new Date(start).toISOString() };
}
