import { z } from "zod";
export const financeViews = [
  "overview",
  "transactions",
  "subscriptions",
  "earnings",
  "payouts",
  "refunds",
  "reconciliation",
  "reports",
  "audit",
] as const;
export type FinanceView = (typeof financeViews)[number];
export type FinanceFilters = {
  start: string;
  end: string;
  mode: "test" | "live";
  currency: string;
  account: string;
  status: string;
  source: string;
  interval: "day" | "week" | "month" | "year";
  page: number;
  q: string;
  view: FinanceView;
};
const day = (d: Date) => d.toISOString().slice(0, 10);
function date(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    day(new Date(value)) !== value
  )
    throw Error("Choose valid reporting dates.");
  return value;
}
export function financeFilters(
  params: Record<string, string | string[] | undefined>,
  now = new Date(),
): FinanceFilters {
  const text = (key: string, fallback = "") => {
    const v = params[key];
    if (Array.isArray(v)) throw Error("Choose one value for each filter.");
    return v ?? fallback;
  };
  const end = date(text("end", day(now))),
    start = date(text("start", day(new Date(Date.parse(end) - 29 * 86400000))));
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (days < 1 || days > 366)
    throw Error("Choose a date range of up to 366 days.");
  const mode = text("mode", "test"),
    currency = text("currency"),
    account = text("account"),
    status = text("status", "all"),
    source = text("source", "all"),
    interval = text("interval", "day"),
    view = text("view", "overview"),
    q = text("q").trim(),
    page = text("page", "1");
  if (
    !["test", "live"].includes(mode) ||
    ![
      "all",
      "paid",
      "pending",
      "failed",
      "refunded",
      "partially_refunded",
      "disputed",
    ].includes(status) ||
    !["all", "marketplace", "subscriptions"].includes(source) ||
    !["day", "week", "month", "year"].includes(interval) ||
    !financeViews.includes(view as FinanceView) ||
    !/^[1-9][0-9]{0,6}$/.test(page) ||
    Number(page) > 1000000 ||
    q.length > 120 ||
    (currency && !/^[A-Z]{3}$/.test(currency)) ||
    (account && !/^acct_[A-Za-z0-9]{1,100}$/.test(account))
  )
    throw Error("Choose valid financial reporting filters.");
  return {
    start,
    end,
    mode: mode as FinanceFilters["mode"],
    currency,
    account,
    status,
    source,
    interval: interval as FinanceFilters["interval"],
    view: view as FinanceView,
    page: Number(page),
    q,
  };
}
export function financeHref(
  filters: FinanceFilters,
  changes: Partial<FinanceFilters> = {},
) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, page: 1, ...changes }))
    if (v !== "" && v !== undefined) p.set(k, String(v));
  return "/admin/accounting?" + p.toString();
}
const money = z.string().regex(/^-?(0|[1-9][0-9]*)$/),
  count = z.number().int().nonnegative().safe(),
  currency = z.string().regex(/^[A-Z]{3}$/);
const total = z.object({
  period: z.enum(["current", "previous"]),
  currency,
  orders: count,
  paid: count,
  failed: count,
  pending: count,
  refunded: count,
  disputed: count,
  matched: count,
  unmatched: count,
  missing: count,
  gross: money,
  commission: money,
  earnings: money,
  obligations: money,
  refunds: money,
  disputes: money,
  recovery: money,
});
const series = z.object({
  at: z.string(),
  currency,
  gross: money,
  commission: money,
  earnings: money,
  refunds: money,
  paid: count,
  failed: count,
  disputed: count,
});
const transaction = z.object({
  id: z.uuid(),
  date: z.string(),
  currency,
  account: z.string(),
  track: z.string(),
  buyer: z.string(),
  artist: z.string(),
  status: z.enum([
    "paid",
    "pending",
    "failed",
    "refunded",
    "partially_refunded",
    "disputed",
  ]),
  gross: money,
  commission: money.nullable(),
  earnings: money.nullable(),
  refunds: money,
  disputes: money,
  obligations: money,
  matched: z.boolean(),
  ledgerMissing: z.boolean(),
});
export const commandReportSchema = z.object({
  state: z.enum(["available", "unavailable"]),
  basis: z.string(),
  totals: z.array(total),
  series: z.array(series),
  transactions: z.array(transaction).max(25),
  total: count,
  page: count,
  size: z.literal(25),
  options: z.object({
    currencies: z.array(currency),
    accounts: z.array(z.string().regex(/^acct_[A-Za-z0-9]{1,100}$/)),
  }),
  subscriptionsAvailable: z.literal(false),
  payoutsAvailable: z.literal(false),
});
export type CommandReport = z.infer<typeof commandReportSchema>;
export type FinanceTotal = z.infer<typeof total>;
export function comparison(current: string, previous: string) {
  const c = BigInt(current),
    p = BigInt(previous);
  if (p === BigInt(0))
    return c === BigInt(0) ? "No change" : "No comparable prior value";
  const scaled = ((c - p) * BigInt(1000)) / (p < BigInt(0) ? -p : p),
    abs = scaled < BigInt(0) ? -scaled : scaled;
  return `${scaled > BigInt(0) ? "+" : scaled < BigInt(0) ? "-" : ""}${abs / BigInt(10)}.${abs % BigInt(10)}% vs prior period`;
}
export function financialChartSeries(
  data: CommandReport,
  filters: FinanceFilters,
  selectedCurrency: string,
) {
  if (
    data.state !== "available" ||
    !data.totals.some(
      (t) => t.period === "current" && t.currency === selectedCurrency,
    )
  )
    return [];
  const cursor = new Date(filters.start + "T00:00:00Z"),
    end = Date.parse(filters.end + "T23:59:59Z");
  if (filters.interval === "week")
    cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
  if (filters.interval === "month") cursor.setUTCDate(1);
  if (filters.interval === "year") {
    cursor.setUTCMonth(0, 1);
  }
  const byDate = new Map(
    data.series
      .filter((s) => s.currency === selectedCurrency)
      .map((s) => [s.at.slice(0, 10), s]),
  );
  const result = [];
  while (cursor.getTime() <= end) {
    const at = cursor.toISOString();
    result.push(
      byDate.get(at.slice(0, 10)) ?? {
        at,
        currency: selectedCurrency,
        gross: "0",
        commission: "0",
        earnings: "0",
        refunds: "0",
        paid: 0,
        failed: 0,
        disputed: 0,
      },
    );
    if (filters.interval === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (filters.interval === "week")
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    else if (filters.interval === "month")
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
  }
  return result;
}
export function financialPageCsv(data: CommandReport) {
  const fields = [
    "date",
    "id",
    "track",
    "buyer",
    "artist",
    "currency",
    "gross",
    "commission",
    "earnings",
    "refunds",
    "status",
    "matched",
  ] as const;
  const cell = (value: unknown) => {
    let text = String(value ?? "Unavailable");
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [
    fields.join(","),
    ...data.transactions.map((t) =>
      fields.map((key) => cell(t[key])).join(","),
    ),
  ].join("\r\n");
}
