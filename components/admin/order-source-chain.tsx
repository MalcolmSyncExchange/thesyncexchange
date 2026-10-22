import { readOrderSourceChain } from "@/services/licensing/sources";
import { shouldUseDemoData } from "@/lib/env";
export async function OrderSourceChain({ orderId }: { orderId: string }) {
  if (shouldUseDemoData()) return null;
  let chain: unknown;
  try { chain = await readOrderSourceChain(orderId); }
  catch { return <p className="text-sm text-muted-foreground">Source trace is unavailable. Older purchases require evidence review before delivery.</p>; }
  return <details className="rounded-md border p-3"><summary className="cursor-pointer font-medium">Submission and licensing evidence chain</summary>
      <p className="mt-2 text-sm">Original source, rights, acceptance, verified payment, license and delivery identifiers. Historical evidence does not establish current access.</p>
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(chain, null, 2)}</pre>
    </details>;
}
