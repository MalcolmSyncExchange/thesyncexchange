import Link from "next/link";
import { requireSession } from "@/services/auth/session";
import { loadBuyerInvoices } from "@/services/buyer/invoices";
import { formatMinor } from "@/lib/finance/accounting.mjs";
export const dynamic = "force-dynamic";
export default async function BuyerBillingPage() {
  await requireSession("buyer");
  const history = await loadBuyerInvoices();
  return <div className="space-y-6"><header><p className="text-sm uppercase tracking-widest text-muted-foreground">Buyer workspace</p><h1 className="mt-2 text-3xl font-semibold">Billing</h1><p className="mt-3 text-muted-foreground">Purchase records, payment and refund status, invoices and billing details for your account.</p></header>
    <section className="grid gap-4 sm:grid-cols-2"><Link className="rounded-xl border bg-card p-6 space-y-2" href="/buyer/orders"><h2 className="text-xl font-semibold">Purchase history</h2><p>Review each license, payment status, refunds and delivery holds.</p><span className="block underline">View your purchases</span></Link><Link className="rounded-xl border bg-card p-6 space-y-2" href="/buyer/settings#account-billing"><h2 className="text-xl font-semibold">Billing details</h2><p>Review your company and billing email. Payment method management follows the billing portal release checks.</p><span className="block underline">Open account settings</span></Link></section>
    <section className="rounded-xl border bg-card p-6 space-y-4"><h2 className="text-xl font-semibold">Recent invoices</h2><p className="text-sm text-muted-foreground">Amounts below are amounts paid in the invoice currency. Marketplace purchase records are separate; an empty invoice history does not mean you have no purchases.</p>
      {history.status==="unavailable"?<p role="status">Invoice history is temporarily unavailable. Purchase history and account settings remain available.</p>:history.invoices.length?<ul className="divide-y">{history.invoices.map(invoice=><li key={invoice.id} className="flex flex-wrap justify-between gap-3 py-4"><div><p>{new Date(invoice.date).toLocaleDateString("en-US",{timeZone:"UTC"})} · {invoice.status}</p><p className="font-semibold">{formatMinor(String(invoice.amountCents),invoice.currency)}</p></div>{invoice.url?<a className="inline-flex min-h-11 items-center underline" href={invoice.url} target="_blank" rel="noreferrer">View invoice</a>:<span>Invoice link unavailable</span>}</li>)}</ul>:<p>No invoices yet.</p>}
    </section>
  </div>;
}
