import { readDeliveryAudit } from "@/services/delivery/admin";
import { shouldUseDemoData } from "@/lib/env";

export async function OrderDeliveryAudit({ orderId }: { orderId: string }) {
  if (shouldUseDemoData()) return null;
  let audit: Awaited<ReturnType<typeof readDeliveryAudit>>;
  try { audit = await readDeliveryAudit(orderId); }
  catch { return <p className="text-sm text-muted-foreground">Secure delivery audit is unavailable. Do not infer that no events occurred.</p>; }
  return <details className="rounded-md border p-3"><summary className="cursor-pointer font-medium">Secure asset delivery audit · {audit.attempts.length} recent attempts</summary>
    <p className="mt-2 text-sm">Authorization and verified server preparation do not prove the buyer received a file. Up to 100 events per section are shown.</p>
    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(audit, null, 2)}</pre>
  </details>;
}
