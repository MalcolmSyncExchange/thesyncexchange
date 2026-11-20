import "server-only";
import { getAccountingReport } from "@/services/finance/reports";
import { artistFinancialTotals } from "@/lib/finance/portal.mjs";

// One RPC statement provides a consistent database snapshot. Never sum separate
// pages into an apparently authoritative balance while payments may be changing.
export async function getArtistFinancialOverview() {
  const report = await getAccountingReport("artist", 1, 50);
  if (report.total > 50) return { state: "limited" as const, totals: [] };
  if (report.orders.length !== report.total) throw Error("Incomplete accounting evidence.");
  return { state: "available" as const, totals: artistFinancialTotals(report.orders) };
}
