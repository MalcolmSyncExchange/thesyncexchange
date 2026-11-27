import Link from "next/link";
import { ArrowUpRight, Info, Landmark } from "lucide-react";

import { EarningsReport } from "@/components/finance/earnings-report";
import { SubscriptionStatus } from "@/components/finance/subscription-status";
import styles from "@/components/finance/artist-finances.module.css";
import { formatMinor } from "@/lib/finance/accounting.mjs";
import { getArtistFinancialOverview } from "@/services/finance/artist-overview";
import { getAccountingReport } from "@/services/finance/reports";

export const dynamic = "force-dynamic";

const balanceFields = [
  ["Unposted allocations", "pendingMinor"],
  ["Held or reserved", "heldMinor"],
  ["Paid to you", "paidMinor"],
] as const;

const adjustmentFields = [
  ["Available earnings", "availableMinor"],
  ["Refunds and losses", "lossesMinor"],
  ["Recovery required", "recoveryMinor"],
  ["Platform fees on managed sales", "commissionMinor"],
] as const;

function Balance({ amounts }: { amounts: Record<string, string> }) {
  return (
    <div className={styles.currencyBalance}>
      <div className={styles.balanceLead}>
        <span>Your net earnings</span>
        <strong className={styles.balanceAmount}>{formatMinor(amounts.earnedMinor, amounts.currency)}</strong>
      </div>
      <dl className={styles.balanceMetrics}>
        {balanceFields.map(([label, field]) => (
          <div key={field}>
            <dt>{label}</dt>
            <dd>{formatMinor(amounts[field], amounts.currency)}</dd>
          </div>
        ))}
      </dl>
      <details className={styles.balanceDetails}>
        <summary>See balance breakdown</summary>
        <dl className={styles.balanceMetrics}>
          {adjustmentFields.map(([label, field]) => (
            <div key={field}>
              <dt>{label}</dt>
              <dd>{formatMinor(amounts[field], amounts.currency)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: requestedPage } = await searchParams;
  const page = requestedPage && /^[1-9][0-9]{0,3}$/.test(requestedPage) ? Number(requestedPage) : 1;
  const [report, overview] = await Promise.all([
    getAccountingReport("artist", page),
    getArtistFinancialOverview(),
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Finances</h1>
          <p>Track your licensing earnings and download statements.</p>
        </div>
        <Link className={styles.outlineButton} href="/artist/payout-settings">
          <Landmark aria-hidden="true" /> Payout settings <ArrowUpRight className={styles.actionArrow} aria-hidden="true" />
        </Link>
      </header>

      <section className={styles.overview} aria-labelledby="recorded-earnings">
        <div className={styles.overviewHeading}>
          <h2 id="recorded-earnings">Recorded earnings</h2>
          <span className={styles.testLabel}>Test accounting</span>
        </div>
        {overview.state === "limited" ? (
          <div className={styles.noBalance}>
            <strong>All-transaction totals unavailable</strong>
            <p>Review individual amounts in Activity. This account has more than 50 recorded transactions.</p>
          </div>
        ) : overview.totals.length ? (
          overview.totals.map(amounts => <Balance key={amounts.currency} amounts={amounts} />)
        ) : (
          <div className={styles.noBalance}>
            <strong>No recorded earnings</strong>
            <p>Your share of licensing transactions will appear here when accounting records are available.</p>
          </div>
        )}
        {overview.state === "available" && overview.totals.length > 0 && (
          <p className={styles.balanceNote}>
            Net earnings reflect posted allocations after reversals. Unposted allocations may include pending or failed payments. Each currency is shown separately.
          </p>
        )}
      </section>

      <aside className={styles.payoutNotice} aria-label="Payout availability">
        <Info aria-hidden="true" />
        <p><strong>Payouts and withdrawals are unavailable.</strong> Test activity does not move money to your bank.</p>
      </aside>

      <EarningsReport report={report} />

      <SubscriptionStatus />
    </div>
  );
}
