import { getAccountingReport } from "@/services/finance/reports";
import { getArtistFinancialOverview } from "@/services/finance/artist-overview";
import { EarningsReport } from "@/components/finance/earnings-report";
import { SubscriptionStatus } from "@/components/finance/subscription-status";
import { formatMinor } from "@/lib/finance/accounting.mjs";
export const dynamic = "force-dynamic";
export default async function EarningsPage({searchParams}:{searchParams:Promise<{page?:string}>}) {
  const p=(await searchParams).page, page=p&&/^[1-9][0-9]{0,3}$/.test(p)?Number(p):1;
  const [report,overview]=await Promise.all([getAccountingReport("artist",page),getArtistFinancialOverview()]);
  return <div className="space-y-8"><header><p className="text-sm uppercase tracking-widest text-muted-foreground">Artist workspace</p><h1 className="mt-2 text-3xl font-semibold">Financial overview</h1><p className="mt-3 text-muted-foreground">Your recorded licensing earnings, statements and payout history.</p></header>
    <section aria-label="Recorded earnings across all transactions" className="space-y-4"><h2 className="text-xl font-semibold">Recorded earnings</h2><p className="text-sm text-muted-foreground">TEST accounting across your recorded transactions. Net earned reflects allocations after reversals. Unposted amounts may include pending or failed payments and are not earnings. Currencies remain separate.</p>
    {overview.state!=="available"?<p role="status">All-transaction totals are unavailable: the account has more than 50 recorded transactions. Review the paginated transaction history below.</p>:overview.totals.length?overview.totals.map(row=><dl key={row.currency} className="grid gap-5 rounded-xl border border-border bg-card p-6 grid-cols-2 lg:grid-cols-4">{[["Net earned",row.earnedMinor],["Unposted allocations (not earned)",row.pendingMinor],["Held / reserved",row.heldMinor],["Refunds and losses",row.lossesMinor],["Recovery required",row.recoveryMinor],["TSE commissions on managed sales",row.commissionMinor],["Actual paid",row.paidMinor],["Available earnings",row.availableMinor]].map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 break-words text-xl font-semibold">{formatMinor(value,row.currency)}</dd></div>)}</dl>):<p>No recorded allocations. No currency or balance has been inferred.</p>}
    <p className="rounded-lg border p-4">Payouts and withdrawals are unavailable. Payout simulations do not represent completed bank payments.</p></section>
    <SubscriptionStatus/>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Financial statements</h2><p>Download the current transaction page. Amounts use the original currency’s minor units; the export is TEST accounting evidence.</p><a className="inline-flex min-h-11 items-center rounded-lg border px-4 underline" href={`/api/artist/financial-statement?page=${page}`}>Download statement — page {page}</a></section>
    <EarningsReport report={report}/>
  </div>;
}
