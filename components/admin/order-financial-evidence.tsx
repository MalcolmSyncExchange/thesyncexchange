import { shouldUseDemoData } from "@/lib/env";
import { readFinancialOrder } from "@/services/finance/server";
export async function OrderFinancialEvidence({orderId}:{orderId:string}) {
  if (shouldUseDemoData()) return null;
  let report;
  try { report = await readFinancialOrder(orderId); }
  catch { return <p className="text-sm text-muted-foreground">Financial ledger evidence is unavailable. Reconciliation requires review.</p>; }
  return <details className="rounded-md border p-3">
    <summary className="cursor-pointer font-medium">Financial ledger and reconciliation</summary>
    <p className="mt-2 text-sm">Synthetic accounting evidence. Payouts remain disabled. Amounts use integer minor currency units.</p>
    <p className="mt-2 text-sm">{report.matched ? "Current recorded evidence reconciles." : "Review required: " + report.issues.join(", ")}</p>
    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(report,null,2)}</pre>
  </details>;
}
