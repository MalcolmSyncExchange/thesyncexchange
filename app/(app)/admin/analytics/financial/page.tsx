import { requireAccountScope } from "@/services/auth/authorization";
import { dashboardRequest } from "@/lib/analytics/intelligence/dashboard";
import { readSECFinancial } from "@/services/analytics/financial";
import { validateFinancialRequest, type FinancialRequest } from "@/lib/analytics/financial/report";
import { FinancialDashboard } from "@/components/admin-v2/financial-dashboard";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
 await requireAccountScope("admin");
 const params = await searchParams;
 let request: FinancialRequest;
 try {
   const base = dashboardRequest(params);
   request = { range: base.range, mode: (params.mode ?? "test") as FinancialRequest["mode"], granularity: base.granularity as FinancialRequest["granularity"], comparePrevious: base.comparePrevious };
   validateFinancialRequest(request);
 } catch { return <div role="alert" className="rounded-xl border p-6">Invalid financial filters. Choose test or live, daily/weekly/monthly intervals, and a bounded UTC date range. <a href="/admin/analytics/financial">Reset filters</a></div>; }
 return <FinancialDashboard data={await readSECFinancial(request)} />;
}
