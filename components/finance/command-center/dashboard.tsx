"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowDownToLine,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
  Activity,
  ArrowLeftRight,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { formatMinor } from "@/lib/finance/accounting.mjs";
import {
  comparison,
  financialPageCsv,
  financeHref,
  financialChartSeries,
  type CommandReport,
  type FinanceFilters,
  type FinanceTotal,
  type FinanceView,
} from "@/lib/finance/command-center";
import styles from "./dashboard.module.css";
const titles: Record<FinanceView, string> = {
  overview: "Overview",
  transactions: "Transactions",
  subscriptions: "Subscriptions",
  earnings: "Artist Earnings",
  payouts: "Payouts",
  refunds: "Refunds & Disputes",
  reconciliation: "Reconciliation",
  reports: "Financial Reports",
  audit: "Audit History",
};
const statuses = [
  ["all", "All payment statuses"],
  ["paid", "Paid"],
  ["pending", "Pending"],
  ["failed", "Failed"],
  ["refunded", "Fully refunded"],
  ["partially_refunded", "Partially refunded"],
  ["disputed", "Disputed"],
];
function label(value: string) {
  return value.replaceAll("_", " ");
}
function amount(value: string | null, currency: string) {
  return value === null ? "Unavailable" : formatMinor(value, currency);
}
function EarningsBars({ row }: { row: FinanceTotal }) {
  const entries = [
    { label: "Net allocations", value: row.earnings, tone: styles.blue },
    { label: "Outstanding", value: row.obligations, tone: styles.gold },
  ];
  const magnitude = (value: string) => {
    const n = BigInt(value);
    return n < BigInt(0) ? -n : n;
  };
  const maximum = entries.reduce(
    (max, item) => (magnitude(item.value) > max ? magnitude(item.value) : max),
    BigInt(1),
  );
  return (
    <div
      className={styles.earningsBars}
      role="group"
      aria-label={`${row.currency} artist allocations and outstanding obligations`}
    >
      {entries.map((item) => (
        <div key={item.label}>
          <div className={styles.earningsRow}>
            <span>{item.label}</span>
            <strong>{amount(item.value, row.currency)}</strong>
          </div>
          <div
            className={styles.barTrack}
            role="img"
            aria-label={`${item.label}: ${amount(item.value, row.currency)}`}
          >
            <span
              className={item.tone}
              style={{
                width: `${Number((magnitude(item.value) * BigInt(10000)) / maximum) / 100}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
function HiddenFilters({
  filters,
  omit = [],
}: {
  filters: FinanceFilters;
  omit?: string[];
}) {
  return (
    <>
      {Object.entries(filters)
        .filter(([k]) => !omit.includes(k))
        .map(([k, v]) => (
          <input key={k} name={k} type="hidden" value={v} />
        ))}
    </>
  );
}
function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <ChartNoAxesCombined size={27} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function exportPage(data: CommandReport) {
  const csv = financialPageCsv(data);
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `tse-finance-page-${data.page}-minor-units.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
function Metric({
  name,
  field,
  rows,
  previous,
  filters,
  view,
  description,
  unavailable = false,
  children,
}: {
  name: string;
  field?: keyof FinanceTotal;
  rows: FinanceTotal[];
  previous: FinanceTotal[];
  filters: FinanceFilters;
  view: FinanceView;
  description: string;
  unavailable?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Link href={financeHref(filters, { view })} className={styles.kpi}>
      <div className={styles.kpiLabel}>
        {name}
        <ArrowUpRight size={15} aria-hidden="true" />
      </div>
      <div className={styles.kpiValue}>
        {children ??
          (unavailable
            ? "Unavailable"
            : !rows.length
              ? "—"
              : rows.map((r) => (
                  <div key={r.currency}>
                    <span className={styles.currency}>{r.currency}</span>{" "}
                    {amount(String(r[field!]), r.currency).replace(
                      r.currency + " ",
                      "",
                    )}
                  </div>
                )))}
      </div>
      <div className={styles.kpiContext}>{description}</div>
      <div className={styles.comparison}>
        {field &&
        !unavailable &&
        rows.length === 1 &&
        previous.some((p) => p.currency === rows[0].currency)
          ? comparison(
              String(rows[0][field]),
              String(
                previous.find((p) => p.currency === rows[0].currency)![field],
              ),
            )
          : filters.start + " — " + filters.end}
      </div>
    </Link>
  );
}
function Chart({
  data,
  filters,
}: {
  data: CommandReport;
  filters: FinanceFilters;
}) {
  const currencies = data.totals
      .filter((t) => t.period === "current")
      .map((t) => t.currency),
    [chosen, setChosen] = useState(currencies[0] ?? ""),
    [focus, setFocus] = useState<number | null>(null);
  const currency = currencies.includes(chosen) ? chosen : (currencies[0] ?? "");
  const points = financialChartSeries(data, filters, currency),
    row = data.totals.find(
      (t) => t.period === "current" && t.currency === currency,
    ),
    max = points.reduce((n, p) => {
      const v = BigInt(p.commission);
      return (v < BigInt(0) ? -v : v) > n ? (v < BigInt(0) ? -v : v) : n;
    }, BigInt(1));
  const scale = (v: string) =>
    Number((BigInt(v) * BigInt(10000)) / max) / 10000;
  const coords = points.map((p, i) => ({
    x:
      points.length === 1
        ? 500
        : 60 + (i * 880) / Math.max(1, points.length - 1),
    y: 150 - scale(p.commission) * 95,
    p,
  }));
  const selected = coords[focus ?? Math.max(0, coords.length - 1)];
  return (
    <section
      className={`${styles.panel} ${styles.chartPanel}`}
      aria-label="Revenue over time"
    >
      <div className={styles.panelHeader}>
        <div>
          <h2>Revenue over time</h2>
          <p>
            Marketplace commission · after recorded reversals ·{" "}
            {currency || "no currency recorded"}
          </p>
        </div>
        <div className={styles.segments} aria-label="Chart interval">
          {(["day", "week", "month", "year"] as const).map((interval) => (
            <Link
              key={interval}
              aria-current={filters.interval === interval ? "true" : undefined}
              href={financeHref(filters, { interval })}
            >
              {
                {
                  day: "Daily",
                  week: "Weekly",
                  month: "Monthly",
                  year: "Yearly",
                }[interval]
              }
            </Link>
          ))}
        </div>
      </div>
      {!points.length ||
      !row ||
      row.missing > 0 ||
      data.state !== "available" ? (
        <Empty
          title={
            data.state !== "available"
              ? "Revenue reporting unavailable"
              : row?.missing
                ? "Commission records need review"
                : "Your revenue story starts here"
          }
        >
          {row?.missing
            ? "Some verified payments have not been posted to the ledger. No revenue inferred."
            : "Recorded marketplace commissions will appear here. No sample or estimated revenue is shown."}
        </Empty>
      ) : (
        <>
          <div className={styles.chartSummary}>
            <strong>{amount(row.commission, currency)}</strong>
            <span>after recorded reversals · before operating costs</span>
            {currencies.length > 1 && (
              <label>
                Chart currency
                <select
                  value={currency}
                  onChange={(e) => {
                    setChosen(e.target.value);
                    setFocus(null);
                  }}
                >
                  {currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className={styles.chartViewport}>
            <svg
              viewBox="0 0 1000 290"
              role="group"
              aria-label={`Marketplace commission in ${currency}. Exact values available in chart data below.`}
            >
              {[55, 150, 245].map((y) => (
                <line
                  key={y}
                  x1="60"
                  x2="940"
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className={styles.gridLine}
                />
              ))}
              <text x="0" y="154" className={styles.axisText}>
                0
              </text>
              {coords.length > 1 && (
                <polyline
                  points={coords.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="#d1b578"
                  strokeWidth="3"
                />
              )}
              {coords.map(({ x, y, p }, i) => (
                <circle
                  key={p.at}
                  cx={x}
                  cy={y}
                  r={focus === i ? 7 : 4}
                  fill="#e4cb95"
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.at.slice(0, 10)}: ${amount(p.commission, currency)}`}
                  onFocus={() => setFocus(i)}
                  onMouseEnter={() => setFocus(i)}
                  onClick={() => setFocus(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFocus(i);
                    }
                  }}
                >
                  <title>{`${p.at.slice(0, 10)}: ${amount(p.commission, currency)}`}</title>
                </circle>
              ))}
              <text x="60" y="280" className={styles.axisText}>
                {points[0]?.at.slice(0, 10)}
              </text>
              <text
                x="940"
                y="280"
                textAnchor="end"
                className={styles.axisText}
              >
                {points.at(-1)?.at.slice(0, 10)}
              </text>
            </svg>
          </div>
          <div className={styles.chartReadout} aria-live="polite">
            {selected?.p.at.slice(0, 10)}{" "}
            <strong>
              {selected
                ? amount(selected.p.commission, currency)
                : "Unavailable"}
            </strong>
            <span>Use Tab to inspect each recorded interval.</span>
          </div>
          <details className={styles.chartData}>
            <summary>Accessible chart data</summary>
            <table>
              <caption>
                Exact original-currency values, grouped by {filters.interval}.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Marketplace volume</th>
                  <th scope="col">Commission</th>
                  <th scope="col">Artist earnings</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.at}>
                    <th scope="row">{p.at.slice(0, 10)}</th>
                    <td>{amount(p.gross, currency)}</td>
                    <td>{amount(p.commission, currency)}</td>
                    <td>{amount(p.earnings, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
      <div className={styles.chartFoot}>
        <span className={styles.goldDot} /> Marketplace commission{" "}
        <span className={styles.muted}>Subscription revenue unavailable</span>
      </div>
    </section>
  );
}
function Transactions({
  data,
  filters,
}: {
  data: CommandReport;
  filters: FinanceFilters;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>
            {filters.view === "overview"
              ? "Recent transactions"
              : "Transaction explorer"}
          </h2>
          <p>
            {data.total.toLocaleString()} matching records · server-side
            pagination · 25 per page
          </p>
        </div>
        <button
          className={styles.secondaryButton}
          onClick={() => exportPage(data)}
          disabled={!data.transactions.length}
        >
          <ArrowDownToLine size={15} /> Export page
        </button>
      </div>
      <form method="get" className={styles.search}>
        <HiddenFilters
          filters={{ ...filters, view: "transactions", page: 1 }}
          omit={["q"]}
        />
        <label htmlFor="finance-search">Search transactions</label>
        <input
          id="finance-search"
          name="q"
          maxLength={120}
          defaultValue={filters.q}
          placeholder="Order reference, buyer, artist or track"
        />
        <button className={styles.secondaryButton}>Search</button>
      </form>
      {!data.transactions.length ? (
        <Empty
          title={
            data.state === "unavailable"
              ? "This source is not operational"
              : "No transactions match these filters"
          }
        >
          {data.state === "unavailable"
            ? "Provider-backed reporting is required before these figures can be shown."
            : "Try a different date range or search. Only recorded financial activity appears here."}
        </Empty>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <caption className={styles.srOnly}>
              Financial transactions. Monetary amounts are kept in their
              original currency.
            </caption>
            <thead>
              <tr>
                {[
                  "Date / reference",
                  "Buyer / artist",
                  "Gross",
                  "TSE commission",
                  "Artist allocation",
                  "Refunds",
                  "Payment",
                  "Reconciliation",
                  "Details",
                ].map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => (
                <tr key={t.id}>
                  <th scope="row">
                    <span>{t.date.slice(0, 10)}</span>
                    <strong>{t.track}</strong>
                    <span className={styles.reference}>{t.id.slice(0, 8)}</span>
                  </th>
                  <td>
                    <strong>{t.buyer}</strong>
                    <span>{t.artist}</span>
                  </td>
                  <td>{amount(t.gross, t.currency)}</td>
                  <td>{amount(t.commission, t.currency)}</td>
                  <td>{amount(t.earnings, t.currency)}</td>
                  <td>{amount(t.refunds, t.currency)}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${["paid"].includes(t.status) ? styles.positive : styles.neutral}`}
                    >
                      {label(t.status)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.badge} ${t.matched ? styles.positive : styles.warning}`}
                    >
                      {t.matched ? "Matched" : "Review needed"}
                    </span>
                  </td>
                  <td>
                    <details className={styles.orderDetails}>
                      <summary>View order</summary>
                      <p className={styles.break}>{t.id}</p>
                      <p>
                        Provider: {t.account} · {filters.mode} mode
                      </p>
                      <p>Outstanding: {amount(t.obligations, t.currency)}</p>
                      <p>Dispute exposure: {amount(t.disputes, t.currency)}</p>
                      <p>
                        {t.ledgerMissing
                          ? "Payment verified; ledger posting is missing. Commission and allocation unavailable."
                          : "Amounts reflect retained ledger entries through the reporting cutoff."}
                      </p>
                      <Link
                        href={financeHref(filters, {
                          view: "reconciliation",
                          q: t.id,
                        })}
                      >
                        Review reconciliation <ChevronRight size={12} />
                      </Link>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav
        className={styles.pagination}
        aria-label="Financial transaction pages"
      >
        <span>
          Page {data.page} of {Math.max(1, Math.ceil(data.total / data.size))}
        </span>
        <div>
          {data.page > 1 && (
            <Link href={financeHref(filters, { page: data.page - 1 })}>
              Previous
            </Link>
          )}
          {data.page * data.size < data.total && (
            <Link href={financeHref(filters, { page: data.page + 1 })}>
              Next
            </Link>
          )}
        </div>
      </nav>
    </section>
  );
}
function Availability({
  title,
  description,
  metrics,
}: {
  title: string;
  description: string;
  metrics: string[];
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={`${styles.badge} ${styles.neutral}`}>
          Not operational
        </span>
      </div>
      <div className={styles.availabilityGrid}>
        {metrics.map((m) => (
          <div key={m}>
            <span>{m}</span>
            <strong>Unavailable</strong>
            <small>Provider-backed records required</small>
          </div>
        ))}
      </div>
    </section>
  );
}
export function FinancialCommandCenter({
  data,
  filters,
}: {
  data: CommandReport;
  filters: FinanceFilters;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const rows = data.totals.filter((t) => t.period === "current"),
    previous = data.totals.filter((t) => t.period === "previous"),
    sum = (key: keyof FinanceTotal) =>
      rows.reduce((n, r) => n + Number(r[key]), 0),
    paid = sum("paid"),
    failed = sum("failed"),
    total = sum("orders"),
    matched = sum("matched"),
    missing = sum("missing"),
    unavailable = data.state !== "available",
    ledgerUnavailable = unavailable || missing > 0;
  const activity = [
    { name: "Successful", count: paid, tone: "green" },
    { name: "Failed", count: failed, tone: "red" },
    { name: "Refunded", count: sum("refunded"), tone: "gold" },
    { name: "Disputed", count: sum("disputed"), tone: "blue" },
  ];
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            THE SEC <span>/</span> FINANCE
          </div>
          <h1>Financial command center</h1>
          <p>
            A clear view of marketplace performance, obligations and financial
            health.
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.modeBadge}>
            <span />
            {filters.mode === "test" ? "TEST ENVIRONMENT" : "LIVE REPORTING"}
          </span>
          <Link
            className={styles.iconButton}
            href="/admin/accounting/controls"
            aria-label="Reviewed financial controls"
          >
            <SlidersHorizontal size={18} />
          </Link>
        </div>
      </header>
      <nav className={styles.tabs} aria-label="Financial operations">
        {Object.entries(titles).map(([view, name]) => (
          <Link
            key={view}
            href={financeHref(filters, { view: view as FinanceView })}
            aria-current={filters.view === view ? "page" : undefined}
          >
            {name}
          </Link>
        ))}
      </nav>
      <button
        type="button"
        className={styles.filtersToggle}
        aria-controls="finance-global-filters"
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((v) => !v)}
      >
        <SlidersHorizontal size={15} /> Filters{" "}
        <span>
          {filters.start} — {filters.end}
        </span>
      </button>
      <form
        id="finance-global-filters"
        method="get"
        className={`${styles.filters} ${filtersOpen ? "" : styles.filtersCollapsed}`}
      >
        <input type="hidden" name="view" value={filters.view} />
        <input type="hidden" name="interval" value={filters.interval} />
        <label>
          From
          <input
            name="start"
            type="date"
            required
            defaultValue={filters.start}
          />
        </label>
        <label>
          Through
          <input name="end" type="date" required defaultValue={filters.end} />
        </label>
        <label>
          Currency
          <select name="currency" defaultValue={filters.currency}>
            <option value="">All · kept separate</option>
            {[
              ...new Set([
                ...data.options.currencies,
                ...(filters.currency ? [filters.currency] : []),
              ]),
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Payment status
          <select name="status" defaultValue={filters.status}>
            {statuses.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Revenue source
          <select name="source" defaultValue={filters.source}>
            <option value="all">All sources</option>
            <option value="marketplace">Marketplace</option>
            <option value="subscriptions">Subscriptions</option>
          </select>
        </label>
        <label>
          Provider account
          <select name="account" defaultValue={filters.account}>
            <option value="">All accounts</option>
            {[
              ...new Set([
                ...data.options.accounts,
                ...(filters.account ? [filters.account] : []),
              ]),
            ].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          Mode
          <select name="mode" defaultValue={filters.mode}>
            <option value="test">Test</option>
            <option value="live">Live</option>
          </select>
        </label>
        <button className={styles.primaryButton}>Apply filters</button>
      </form>
      <div className={styles.scope}>
        <span>
          <Clock3 size={13} /> {filters.start} — {filters.end} · UTC · Sales
          period
        </span>
        <details>
          <summary>
            <CircleHelp size={14} /> Reporting definitions
          </summary>
          <p>
            {data.basis} Gross volume is before refunds; TSE revenue is
            commission after ledger reversals, not net profit. Artist earnings
            are net ledger accruals, not withdrawable cash. Outstanding
            obligations include retained payable and reserved balances for the
            selected cohorts. No currencies are converted or combined. Payment
            success includes refunded/disputed captures and excludes unresolved
            orders. Comparisons use the preceding equal-length cohort period.
            Reconciliation requires a retained matched result at least as recent
            as the latest journal.
          </p>
        </details>
      </div>
      {unavailable && (
        <div className={styles.notice} role="status">
          <ShieldCheck size={19} />
          <div>
            <strong>
              {filters.source === "subscriptions"
                ? "Subscription reporting is not operational"
                : "Live financial reporting is unavailable"}
            </strong>
            <p>
              No revenue, subscriber counts or balances have been inferred.
              Choose recorded Test marketplace activity to inspect the existing
              financial records.
            </p>
          </div>
        </div>
      )}
      {filters.view === "overview" && (
        <>
          <section
            className={styles.kpiGrid}
            aria-label="Executive financial metrics"
          >
            <Metric
              name="Gross Marketplace Volume"
              field="gross"
              rows={rows}
              previous={previous}
              filters={filters}
              view="transactions"
              description="Verified captures · before refunds"
              unavailable={unavailable}
            />
            <Metric
              name="TSE Revenue"
              field="commission"
              rows={rows}
              previous={previous}
              filters={filters}
              view="reports"
              description="Commission after reversals · not net profit"
              unavailable={ledgerUnavailable}
            />
            <Metric
              name="Artist Earnings"
              field="earnings"
              rows={rows}
              previous={previous}
              filters={filters}
              view="earnings"
              description="Net accrued allocations · not available cash"
              unavailable={ledgerUnavailable}
            />
            <Metric
              name="Outstanding Obligations"
              field="obligations"
              rows={rows}
              previous={previous}
              filters={filters}
              view="payouts"
              description="Selected sales · at reporting cutoff"
              unavailable={ledgerUnavailable}
            />
            <Metric
              name="Refunds & Disputes"
              field="refunds"
              rows={rows}
              previous={previous}
              filters={filters}
              view="refunds"
              description={
                unavailable
                  ? "Refund and dispute records unavailable"
                  : `Refunded amount · ${sum("disputed")} orders currently disputed`
              }
              unavailable={unavailable}
            />
            <Metric
              name="Active Subscriptions"
              rows={rows}
              previous={previous}
              filters={filters}
              view="subscriptions"
              description="Recurring billing is not operational"
              unavailable
            />
            <Metric
              name="Payment Success Rate"
              rows={rows}
              previous={previous}
              filters={filters}
              view="transactions"
              description={
                unavailable
                  ? "Payment outcomes unavailable"
                  : `${paid} captured / ${paid + failed} resolved orders`
              }
            >
              <>
                {unavailable || paid + failed === 0
                  ? "—"
                  : ((paid / (paid + failed)) * 100).toFixed(1) + "%"}
              </>
            </Metric>
            <Metric
              name="Reconciliation Health"
              rows={rows}
              previous={previous}
              filters={filters}
              view="reconciliation"
              description={
                unavailable
                  ? "Matching evidence unavailable"
                  : `${matched} matched · ${total - matched} require review`
              }
            >
              <>
                {unavailable || total === 0
                  ? "—"
                  : ((matched / total) * 100).toFixed(0) + "%"}
                <span className={styles.metricSmall}>
                  {total === 0
                    ? "Awaiting records"
                    : total - matched === 0
                      ? "All records matched"
                      : "Review required"}
                </span>
              </>
            </Metric>
          </section>
          <div className={styles.analyticsGrid}>
            <Chart data={data} filters={filters} />
            <section className={`${styles.panel} ${styles.composition}`}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Revenue composition</h2>
                  <p>Original currencies · after reversals</p>
                </div>
              </div>
              {rows.length && !ledgerUnavailable ? (
                <div className={styles.compositionRows}>
                  {rows.map((r) => (
                    <div key={r.currency}>
                      <span className={styles.goldDot} />{" "}
                      <span>Marketplace commission</span>
                      <strong>{amount(r.commission, r.currency)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title="No revenue to break down">
                  Recorded commissions will appear when available.
                </Empty>
              )}
              <div className={styles.availabilityNote}>
                <span className={styles.neutralDot} /> Subscription revenue{" "}
                <strong>Unavailable</strong>
              </div>
              <p className={styles.footnote}>
                A revenue share is not inferred while subscription revenue is
                unavailable.
              </p>
            </section>
          </div>
          <div className={styles.threeGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Payment activity</h2>
                  <p>Recorded order outcomes</p>
                </div>
                <Activity size={18} />
              </div>
              {activity.map((a) => (
                <div className={styles.activityRow} key={a.name}>
                  <span>{a.name}</span>
                  <div className={styles.barTrack}>
                    <span
                      className={styles[a.tone]}
                      style={{
                        width: `${total ? (a.count / total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <strong>{unavailable ? "—" : a.count}</strong>
                </div>
              ))}
              <p className={styles.footnote}>
                Refunded and disputed orders can overlap successful captures.
              </p>
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Artist earnings</h2>
                  <p>Ledger-backed, never estimated</p>
                </div>
                <Wallet size={18} />
              </div>
              {rows.length && !ledgerUnavailable ? (
                rows.map((r) => <EarningsBars key={r.currency} row={r} />)
              ) : (
                <p className={styles.quietEmpty}>
                  No supported earnings in this selection.
                </p>
              )}
              <Link
                className={styles.panelLink}
                href={financeHref(filters, { view: "earnings" })}
              >
                View artist obligations <ArrowUpRight size={14} />
              </Link>
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Reconciliation</h2>
                  <p>Retained matching evidence</p>
                </div>
                <ArrowLeftRight size={18} />
              </div>
              <div className={styles.reconScore}>
                <CheckCircle2 size={30} />
                <strong>{unavailable ? "—" : `${matched} / ${total}`}</strong>
                <span>matched transactions</span>
              </div>
              <p className={styles.footnote}>
                {unavailable
                  ? "Matching evidence is unavailable."
                  : total === 0
                    ? "Awaiting recorded transactions. No reconciliation health inferred."
                    : missing
                      ? `${missing} verified payments are missing ledger postings.`
                      : total - matched
                        ? `${total - matched} records need matching or review.`
                        : "No outstanding exceptions in the selected records."}
              </p>
              <Link
                className={styles.panelLink}
                href={financeHref(filters, { view: "reconciliation" })}
              >
                Open reconciliation <ArrowUpRight size={14} />
              </Link>
            </section>
          </div>
          <Transactions data={data} filters={filters} />
        </>
      )}
      {filters.view === "transactions" && (
        <Transactions data={data} filters={filters} />
      )}
      {filters.view === "subscriptions" && (
        <>
          <Availability
            title="Subscription performance"
            description="Provider-backed recurring billing has not been verified or activated. Approved plans remain Pro $19.99/month and Teams $49.99/month."
            metrics={[
              "Active Pro",
              "Active Teams",
              "Monthly recurring revenue",
              "Annualized recurring revenue",
              "Failed renewals",
              "Cancellations",
              "Churn",
              "Subscription history",
            ]}
          />
          <Link className={styles.panelLink} href="/admin/subscriptions">
            Open existing subscription oversight <ArrowUpRight size={14} />
          </Link>
        </>
      )}
      {filters.view === "earnings" && (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Artist earnings & obligations</h2>
                <p>
                  Booked allocations after refunds and reversals. This is not a
                  withdrawable balance.
                </p>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <caption>
                  Selected order cohorts · original currencies · through{" "}
                  {filters.end}
                </caption>
                <thead>
                  <tr>
                    {[
                      "Currency",
                      "Net allocations",
                      "Outstanding obligations",
                      "Recovery required",
                      "Available earnings",
                      "Completed payouts",
                    ].map((h) => (
                      <th key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.currency}>
                      <th scope="row">{r.currency}</th>
                      <td>
                        {ledgerUnavailable
                          ? "Unavailable"
                          : amount(r.earnings, r.currency)}
                      </td>
                      <td>
                        {ledgerUnavailable
                          ? "Unavailable"
                          : amount(r.obligations, r.currency)}
                      </td>
                      <td>
                        {ledgerUnavailable
                          ? "Unavailable"
                          : amount(r.recovery, r.currency)}
                      </td>
                      <td>Unavailable</td>
                      <td>Unavailable</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <Empty title="No artist allocations in this selection">
                Earnings appear only after financial records are posted.
              </Empty>
            )}
            <p className={styles.footnote}>
              Pending and available earnings require reviewed payee identity,
              maturity and an operational payout provider. Those balances are
              unavailable.
            </p>
          </section>
          <Transactions data={data} filters={filters} />
        </>
      )}
      {filters.view === "payouts" && (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Outstanding artist obligations</h2>
                <p>
                  Selected sales through the reporting cutoff. Obligations are
                  not withdrawable cash.
                </p>
              </div>
            </div>
            {rows.length && !ledgerUnavailable ? (
              <div className={styles.availabilityGrid}>
                {rows.map((r) => (
                  <div key={r.currency}>
                    <span>{r.currency}</span>
                    <strong>{amount(r.obligations, r.currency)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title={
                  ledgerUnavailable
                    ? "Obligations unavailable"
                    : "No obligations in this selection"
                }
              >
                Only retained ledger liabilities are reported.
              </Empty>
            )}
          </section>
          <Availability
            title="Payout operations"
            description="Real disbursements and withdrawals are disabled. Existing payout preparation is a reviewed test workflow; simulations are not completed payments."
            metrics={[
              "Available for payout",
              "Completed payouts",
              "Pending provider payouts",
              "Payout failures",
            ]}
          />
        </>
      )}
      {filters.view === "refunds" && (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Refunds, disputes & chargebacks</h2>
                <p>
                  Use Payment status to isolate full refunds, partial refunds or
                  disputed orders. Amounts are never netted across currencies.
                </p>
              </div>
            </div>
            <div className={styles.issueLinks}>
              {statuses
                .filter(([s]) =>
                  ["refunded", "partially_refunded", "disputed"].includes(s),
                )
                .map(([status, name]) => (
                  <Link key={status} href={financeHref(filters, { status })}>
                    {name}
                    <ArrowUpRight size={16} />
                  </Link>
                ))}
            </div>
            <div className={styles.issueLinks}>
              <Link href="/admin/payments">
                Refund request queue <ArrowUpRight size={16} />
              </Link>
              <Link href="/admin/finance">
                Provider mismatches & corrections <ArrowUpRight size={16} />
              </Link>
            </div>
            <p className={styles.footnote}>
              Disputed status does not establish a final chargeback loss. Review
              the retained reconciliation and correction records before
              recognizing a loss.
            </p>
          </section>
          <Transactions data={data} filters={filters} />
        </>
      )}
      {filters.view === "reconciliation" && (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Reconciliation workspace</h2>
                <p>
                  Provider matching and ledger completeness, separated from
                  payment status.
                </p>
              </div>
              <span className={`${styles.badge} ${styles.warning}`}>
                {unavailable
                  ? "Unavailable"
                  : `${total - matched} require review`}
              </span>
            </div>
            <div className={styles.availabilityGrid}>
              <div>
                <span>Matched transactions</span>
                <strong>{unavailable ? "Unavailable" : matched}</strong>
              </div>
              <div>
                <span>Unmatched / unreviewed</span>
                <strong>{unavailable ? "Unavailable" : total - matched}</strong>
              </div>
              <div>
                <span>Missing ledger postings</span>
                <strong>{unavailable ? "Unavailable" : missing}</strong>
              </div>
            </div>
            <Link className={styles.panelLink} href="/admin/finance">
              Provider exceptions, corrections & audit trail{" "}
              <ArrowUpRight size={14} />
            </Link>
            <p className={styles.footnote}>
              “Review needed” includes missing or stale matching evidence; it
              does not automatically mean money is missing.
            </p>
          </section>
          <Transactions data={data} filters={filters} />
        </>
      )}
      {filters.view === "reports" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Financial reports</h2>
              <p>
                Reproducible, currency-separated cohort reporting with a visible
                reporting basis.
              </p>
            </div>
            <button
              className={styles.secondaryButton}
              onClick={() => window.print()}
            >
              Print report
            </button>
          </div>
          <p className={styles.reportBasis}>{data.basis}</p>
          <div className={styles.tableWrap}>
            <table>
              <caption>
                Amounts in original currency · no FX conversion ·{" "}
                {filters.start} — {filters.end}
              </caption>
              <thead>
                <tr>
                  {[
                    "Currency",
                    "Gross volume",
                    "Net commission",
                    "Net artist allocations",
                    "Obligations",
                    "Refunds",
                    "Dispute exposure",
                  ].map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.currency}>
                    <th scope="row">{r.currency}</th>
                    {(
                      [
                        "gross",
                        "commission",
                        "earnings",
                        "obligations",
                        "refunds",
                        "disputes",
                      ] as const
                    ).map((k) => (
                      <td key={k}>
                        {["commission", "earnings", "obligations"].includes(
                          k,
                        ) && ledgerUnavailable
                          ? "Unavailable"
                          : amount(r[k], r.currency)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <Empty title="No recorded amounts in this selection">
              Unavailable sources are not represented as zero balances.
            </Empty>
          )}
          <Link
            className={styles.panelLink}
            href={financeHref(filters, { view: "transactions" })}
          >
            Open transaction report & page exports <ArrowUpRight size={14} />
          </Link>
          <p className={styles.footnote}>
            Net marketplace profit is unavailable until processor fees, dispute
            losses and reconciliation are complete. Subscription income and
            actual payouts are unavailable.
          </p>
        </section>
      )}
      {filters.view === "audit" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Financial audit history</h2>
              <p>
                Retained evidence and existing reviewed controls remain in their
                dedicated workflows.
              </p>
            </div>
            <ShieldCheck size={21} />
          </div>
          <div className={styles.issueLinks}>
            <Link href="/admin/command/audit">
              SEC audit history <ArrowUpRight size={16} />
            </Link>
            <Link href="/admin/finance">
              Provider delivery & correction history <ArrowUpRight size={16} />
            </Link>
            <Link href="/admin/accounting/controls">
              Financial policy, payee & payout preparation history{" "}
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <p className={styles.footnote}>
            Administrative controls are intentionally kept off the Overview. No
            historical records or commission policies have been rewritten.
          </p>
        </section>
      )}
      <footer className={styles.footer}>
        <ShieldCheck size={14} />
        <span>
          Private financial records · Original currencies · Purchases, recurring
          billing and payouts remain gated
        </span>
        <Link href="/admin/accounting/controls">
          Reviewed controls <ArrowUpRight size={12} />
        </Link>
      </footer>
    </div>
  );
}
