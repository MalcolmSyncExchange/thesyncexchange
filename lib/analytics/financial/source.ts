import { buildFinancialReport, unavailableFinancialSource, validateFinancialRequest, type FinancialRequest, type FinancialSource } from "./report.ts";
export type FinancialDependencies = {
  authorizeAdmin: () => Promise<boolean>;
  /** A trusted complete ledger adapter; opened only after canonical authorization. */
  openReader: () => ((request: FinancialRequest) => Promise<FinancialSource>) | null;
};
export async function readFinancialReport(deps: FinancialDependencies, request: FinancialRequest) {
  if (!await deps.authorizeAdmin()) throw new Error("financial_admin_required");
  validateFinancialRequest(request);
  let source = unavailableFinancialSource();
  try {
    const reader = deps.openReader();
    if (reader) source = await reader(request);
  } catch { source = unavailableFinancialSource("source_failed"); }
  return buildFinancialReport(source, request);
}
