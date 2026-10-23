/** Attempt one is immediate. Delays below follow failures of attempts 1..7. */
export const MAX_DELIVERY_ATTEMPTS = 8;
export const RETRY_DELAYS_SECONDS = [60, 300, 900, 3600, 14400, 43200, 86400] as const;

export function nextRetryAt(attemptCount: number, now: Date, random: () => number = Math.random): string | null {
  if (!Number.isInteger(attemptCount) || attemptCount < 1 || attemptCount >= MAX_DELIVERY_ATTEMPTS ||
      !Number.isFinite(now.getTime())) return null;
  // Bounded ±10% jitter. Inject random for deterministic tests.
  const sample = Math.max(0, Math.min(1, random()));
  if (!Number.isFinite(sample)) return null;
  const seconds = RETRY_DELAYS_SECONDS[attemptCount - 1] * (0.9 + 0.2 * sample);
  return new Date(now.getTime() + Math.round(seconds * 1000)).toISOString();
}
