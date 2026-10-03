import type { ReactNode } from "react";

/** A native POST form cannot be speculatively prefetched like a navigation link. */
export function AgreementDownloadForm({ orderId, children, className }: {
  orderId: string; children: ReactNode; className?: string;
}) {
  return (
    <form method="post" action={`/api/orders/${encodeURIComponent(orderId)}/agreement/download`}>
      <button type="submit" className={className || "text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2"}>
        {children}
      </button>
    </form>
  );
}
