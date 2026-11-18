import "server-only";
import { requireAccountScope } from "@/services/auth/authorization";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { readFinancialReport } from "@/lib/analytics/financial/source";
import { validateBookedFinance } from "@/lib/analytics/financial/booked";
import type { FinancialRequest, FinancialSource } from "@/lib/analytics/financial/report";
export async function readSECFinancial(request: FinancialRequest) {
  const result = await readFinancialReport({
    authorizeAdmin: async () => { await requireAccountScope("admin"); return true; },
    openReader: () => async () => {
      const db = await createServerSupabaseClient();
      const { data, error } = await db.rpc("analytics_financial_source", { p_end: request.range.endExclusive, p_mode: request.mode }).abortSignal(AbortSignal.timeout(5000));
      if (error || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("financial_source_unavailable");
      if (data.state !== "available") throw new Error("financial_source_unavailable");
      // Never hide dispute uncertainty in the old refund-only adjustment metric.
      return { ...data, refundsState: Number(data.disputedPayments)>0 ? "insufficient_evidence" : data.refundsState } as unknown as FinancialSource;
    }
  }, request);
  try {
    const db = await createServerSupabaseClient();
    const { data, error } = await db.rpc("analytics_booked_finance", { p_start: request.range.startInclusive, p_end: request.range.endExclusive, p_mode: request.mode }).abortSignal(AbortSignal.timeout(5000));
    return { ...result, booked: error ? null : validateBookedFinance(data) };
  } catch { return { ...result, booked: null }; }
}
