import "server-only";
import { requireAccountScope } from "@/services/auth/authorization";
import { readFinancialReport } from "@/lib/analytics/financial/source";
import type { FinancialRequest } from "@/lib/analytics/financial/report";
/** Existing single-event RPC cannot establish complete payment/refund coverage.
 * Do not read analytics_outbox, guess from orders.status, or query private ledgers
 * with broader privileges. A separately reviewed bounded projection is required.
 */
export async function readSECFinancial(request: FinancialRequest) {
  return readFinancialReport({
    authorizeAdmin: async () => { await requireAccountScope("admin"); return true; },
    openReader: () => null
  }, request);
}
