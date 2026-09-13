import "server-only";

import { getDeploymentTarget } from "@/lib/env";
import { createAdminSupabaseClient } from "@/services/supabase/admin";

const operations = ["checkout", "upload", "server-upload"] as const;
export type RateLimitOperation = (typeof operations)[number];
// The RPC returns the minimum remaining budget after incrementing all counters.
// These response bounds mirror 0021; they do not control database admission.
const responseBounds: Record<RateLimitOperation, { maxRemaining: number; maxRetryAfter: number }> = {
  checkout: { maxRemaining: 5 - 1, maxRetryAfter: 3600 },
  upload: { maxRemaining: 20 - 1, maxRetryAfter: 86400 },
  "server-upload": { maxRemaining: 10 - 1, maxRetryAfter: 86400 }
};
export type RateLimitResult =
  | { status: "allowed"; remaining: number; retryAfter: 0; resetAt: string }
  | { status: "rate-limited"; remaining: number; retryAfter: number; resetAt: string }
  | { status: "unavailable"; retryAfter: number };

const unavailable = (): RateLimitResult => ({ status: "unavailable", retryAfter: 15 });

// Call only after authentication and canonical role/ownership validation.
// verifiedUserId must come from auth.getUser(), never a request body or header.
export async function consumeRateLimit(operation: RateLimitOperation, verifiedUserId: string): Promise<RateLimitResult> {
  try {
    if (!operations.includes(operation) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(verifiedUserId)) {
      return unavailable();
    }

    const target = getDeploymentTarget();
    if (!["production", "preview", "local"].includes(target)) return unavailable();
    const supabase = createAdminSupabaseClient();
    if (!supabase) return unavailable();

    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_namespace: `tse:${target}`,
      p_operation: operation,
      p_subject: verifiedUserId
    }).abortSignal(AbortSignal.timeout(3000));

    if (error || !Array.isArray(data) || data.length !== 1) return unavailable();
    const row = data[0];
    const bounds = responseBounds[operation];
    if (
      !row || typeof row.allowed !== "boolean" ||
      !Number.isSafeInteger(row.remaining) || row.remaining < 0 || row.remaining > bounds.maxRemaining ||
      !Number.isSafeInteger(row.retry_after_seconds) || row.retry_after_seconds < 0 ||
      row.retry_after_seconds > bounds.maxRetryAfter ||
      typeof row.reset_at !== "string" || !Number.isFinite(Date.parse(row.reset_at)) ||
      (row.allowed ? row.retry_after_seconds !== 0 : row.retry_after_seconds < 1 || row.remaining !== 0)
    ) return unavailable();

    return row.allowed
      ? { status: "allowed", remaining: row.remaining, retryAfter: 0, resetAt: row.reset_at }
      : { status: "rate-limited", remaining: row.remaining, retryAfter: row.retry_after_seconds, resetAt: row.reset_at };
  } catch {
    // Missing migration, network errors and timeouts must never admit requests.
    return unavailable();
  }
}

export function getRateLimitMessage(result: Exclude<RateLimitResult, { status: "allowed" }>) {
  return result.status === "rate-limited"
    ? `Too many requests. Please try again in ${result.retryAfter} seconds.`
    : "This service is temporarily unavailable. Please try again shortly.";
}

export function rateLimitErrorResponse(result: RateLimitResult): Response | null {
  if (result.status === "allowed") return null;
  return Response.json({ error: getRateLimitMessage(result) }, {
    status: result.status === "rate-limited" ? 429 : 503,
    headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "private, no-store" }
  });
}
