import Link from "next/link";
import { ArrowDownToLine, ArrowDownUp, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Music2, ReceiptText } from "lucide-react";

import { formatMinor } from "@/lib/finance/accounting.mjs";
import { artistFinancialTotals } from "@/lib/finance/portal.mjs";
import type { AccountingOrder, AccountingReport, Allocation, Payout } from "@/services/finance/reports";
import styles from "./artist-finances.module.css";

const holdLabels: Record<string, string> = {
  financial_book_missing: "Accounting review pending",
  payment_not_posted: "Payment not yet posted",
  payee_identity_review: "Payee identity needs review",
  provider_payout_adapter_required: "Payout provider setup pending",
  simulation_disabled: "Test processing is disabled",
  payout_policy_required: "Payout policy needs review",
  maturity_pending: "Earnings waiting to mature",
  payment_hold: "Payment review required",
  license_pending: "License preparation pending",
  rights_or_legal_hold: "Rights or license review required",
};

const payoutLabels: Record<string, string> = {
  held: "Held",
  scheduled: "Scheduled",
  failed: "Failed",
  simulated_completed: "Simulation complete",
  reversed: "Reversed",
  canceled: "Canceled",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "UTC",
});

function RecordedDate({ value, includeTime = false }: { value: string; includeTime?: boolean }) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? <time dateTime={value}>{(includeTime ? timestampFormatter : dateFormatter).format(timestamp)}{includeTime && " UTC"}</time>
    : <span>Date unavailable</span>;
}

function Amounts({ items, currency }: { items: ReadonlyArray<readonly [string, string | null]>; currency: string }) {
  return (
    <dl className={styles.detailAmounts}>
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{formatMinor(value, currency)}</dd>
        </div>
      ))}
    </dl>
  );
}

function AllocationDetails({ allocation, currency }: { allocation: Allocation; currency: string }) {
  return (
    <section className={styles.allocation}>
      <div className={styles.allocationHeading}>
        <h4>{allocation.legalName}</h4>
        <span className={allocation.attributedToYou ? styles.ownAllocation : styles.otherAllocation}>
          {allocation.attributedToYou ? "Your allocation" : "Contributor allocation"}
        </span>
      </div>
      <p className={styles.allocationNote}>
        {new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 }).format(allocation.allocationBps / 10_000)} allocated
        {allocation.hold && <> · {holdLabels[allocation.hold] ?? "Financial review required"}</>}
      </p>
      <Amounts currency={currency} items={[
        ["Accepted allocation", allocation.allocatedMinor],
        ["Owed", allocation.owedMinor],
        ["Held", allocation.heldMinor],
        ["Unposted", allocation.pendingMinor],
        ["Refunds and losses", allocation.refundAndLossMinor],
        ["Recovery required", allocation.recoveryMinor],
        ["Eligible for simulation", allocation.eligibleSimulationMinor],
        ["Simulated completed", allocation.simulatedCompletedMinor],
        ["Actual paid", allocation.paidMinor],
      ]} />
    </section>
  );
}

function PayoutRecord({ payout }: { payout: Payout }) {
  return (
    <details className={styles.payoutRecord}>
      <summary>
        <span>{payout.legalName}</span>
        <span>{payoutLabels[payout.state] ?? "Status unavailable"}</span>
        <strong>{formatMinor(payout.amountMinor, payout.currency)}</strong>
        <ChevronDown className={styles.payoutChevron} aria-hidden="true" />
      </summary>
      <div className={styles.payoutRecordBody}>
        {payout.scheduledFor && <p>Scheduled <RecordedDate value={payout.scheduledFor} /></p>}
        {payout.hold && <p>{holdLabels[payout.hold] ?? "Financial review required"}</p>}
        <p>Actual paid <strong>{formatMinor(payout.actualPaidMinor, payout.currency)}</strong></p>
        {payout.history.length > 0 && (
          <ul className={styles.payoutHistory}>
            {payout.history.map(entry => (
              <li key={entry.id}>
                <RecordedDate value={entry.at} includeTime />
                <span>{payoutLabels[entry.state] ?? "Status unavailable"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function Transaction({ order }: { order: AccountingOrder }) {
  const attributed = order.allocations.some(allocation => allocation.attributedToYou === true);
  const totals = attributed ? artistFinancialTotals([order])[0] : null;
  const amount = totals
    ? formatMinor(order.paidEvidence ? totals.earnedMinor : totals.pendingMinor, order.currency)
    : order.managedSale && order.grossMinor !== null
      ? formatMinor(order.grossMinor, order.currency)
      : null;
  const amountLabel = attributed
    ? order.paidEvidence ? "Your net earnings" : "Your unposted allocation"
    : amount === null ? "No recorded share" : "Gross sale";

  return (
    <li>
      <details className={styles.transaction}>
        <summary className={styles.transactionSummary}>
          <span className={styles.trackCell}>
            <span className={styles.trackIcon}><Music2 aria-hidden="true" /></span>
            <span className={styles.trackTitle}>{order.trackTitle}</span>
          </span>
          <span className={styles.transactionDate}><RecordedDate value={order.createdAt} /></span>
          <span className={styles.transactionStatus}>
            <span className={styles.statusPill} data-posted={order.paidEvidence}>
              {order.paidEvidence ? "Payment posted" : "Payment unposted"}
            </span>
          </span>
          <span className={styles.transactionAmount}>
            {amount !== null && <strong>{amount}</strong>}
            <span>{amountLabel}</span>
          </span>
          <ChevronDown className={styles.transactionChevron} aria-hidden="true" />
        </summary>
        <div className={styles.transactionBody}>
          {order.managedSale && (
            <section aria-label="Managed sale amounts">
              <h3>Managed sale</h3>
              <Amounts currency={order.currency} items={[
                ["Original paid licensing amount", order.grossMinor],
                ["Platform fees after reversals", order.platformFeeMinor],
                ["Net contributor proceeds", order.netProceedsMinor],
              ]} />
            </section>
          )}
          {order.allocations.length > 0 && (
            <section className={styles.detailSection} aria-label="Contributor allocations">
              <h3>Allocations</h3>
              <div className={styles.allocationList}>
                {order.allocations.map(allocation => (
                  <AllocationDetails key={allocation.partyId} allocation={allocation} currency={order.currency} />
                ))}
              </div>
            </section>
          )}
          {order.payouts.length > 0 && (
            <section className={styles.detailSection} aria-label="Payout history">
              <h3>Payout history</h3>
              <div className={styles.allocationList}>
                {order.payouts.map(payout => <PayoutRecord key={payout.id} payout={payout} />)}
              </div>
            </section>
          )}
          <dl className={styles.references}>
            <div><dt>Transaction ID</dt><dd>{order.orderId}</dd></div>
            <div><dt>Recorded time</dt><dd><RecordedDate value={order.createdAt} includeTime /></dd></div>
            <div><dt>Accounting policy</dt><dd>{order.policyVersion}</dd></div>
          </dl>
        </div>
      </details>
    </li>
  );
}

export function EarningsReport({ report }: { report: AccountingReport }) {
  const { orders, page, size, total } = report;
  const hasNext = page * size < total;
  const hasPrevious = page > 1;

  return (
    <section className={styles.activity} aria-labelledby="finance-activity">
      <div className={styles.activityHeading}>
        <div className={styles.sectionHeading}>
          <h2 id="finance-activity">Activity</h2>
          <p>Licensing transactions, contributor allocations, and recorded payouts.</p>
        </div>
        <div className={styles.activityActions}>
          <span className={styles.activityCount}>
            {total.toLocaleString("en-US")} {total === 1 ? "transaction" : "transactions"}
          </span>
          <a className={styles.outlineButton} href={`/api/artist/financial-statement?page=${page}`} aria-describedby="statement-scope">
            <ArrowDownToLine aria-hidden="true" /> Download CSV
          </a>
          <span id="statement-scope" className="sr-only">
            Test accounting statement for page {page}. Includes your allocations in each currency’s minor units.
          </span>
        </div>
      </div>
      {orders.length > 0 ? (
        <>
          <div className={styles.columnLabels} aria-hidden="true">
            <span>Track</span><span>Recorded</span><span>Payment</span><span>Amount</span><span />
          </div>
          <ul className={styles.transactionList}>
            {orders.map(order => <Transaction key={order.orderId} order={order} />)}
          </ul>
        </>
      ) : (
        <div className={styles.emptyActivity}>
          <span className={styles.emptyIcon}>{total ? <ArrowDownUp aria-hidden="true" /> : <ReceiptText aria-hidden="true" />}</span>
          <h3>{total ? "No transactions on this page" : "No licensing transactions yet"}</h3>
          <p>{total ? "Return to the first page to see your recorded activity." : "Recorded transactions and their earnings details will appear here."}</p>
          <Link href={total ? "/artist/earnings" : "/artist/licenses"} className={styles.inlineLink}>
            {total ? "Go to first page" : "View licensing activity"} <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      )}
      {orders.length > 0 && (hasPrevious || hasNext) && (
        <nav aria-label="Finance activity pages" className={styles.pagination}>
          <span>Page {page} of {Math.ceil(total / size)}</span>
          <div>
            {hasPrevious && <Link className={styles.outlineButton} href={`?page=${page - 1}`} rel="prev"><ChevronLeft aria-hidden="true" /> Previous</Link>}
            {hasNext && <Link className={styles.outlineButton} href={`?page=${page + 1}`} rel="next">Next <ChevronRight aria-hidden="true" /></Link>}
          </div>
        </nav>
      )}
    </section>
  );
}
