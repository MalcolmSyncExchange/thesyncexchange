import {
  ANALYTICS_CONTRACT_VERSION, numberMetric, sourceMetric, unavailableMetric,
  type Metric, type SourceState, type VerifiedCommerceRecord
} from "./contracts.ts";

export type CommerceInput = {
  source: SourceState;
  records: readonly VerifiedCommerceRecord[];
  startInclusive: string;
  endExclusive: string;
  paymentMode: "test" | "live";
  /** Optional exact ISO currency; required for a meaningful zero-money total. */
  currency?: string;
};
export type CurrencyTotals = { currency: string; paidOrders: Metric<number>; grossMinor: Metric<number>;
  refundedMinor: Metric<number>; netMinor: Metric<number>; averageOrderMinor: Metric<number> };
export type CommerceReport = { version: typeof ANALYTICS_CONTRACT_VERSION; paidOrders: Metric<number>;
  grossMinor: Metric<number>; refundedMinor: Metric<number>; netMinor: Metric<number>;
  averageOrderMinor: Metric<number>; currency: string | null; byCurrency: CurrencyTotals[];
  commissionRevenueMinor: Metric<number> };

function unavailableReport(source: SourceState): CommerceReport {
  const metric = sourceMetric(source);
  return { version: ANALYTICS_CONTRACT_VERSION, paidOrders: metric, grossMinor: metric,
    refundedMinor: metric, netMinor: metric, averageOrderMinor: metric, currency: null,
    byCurrency: [], commissionRevenueMinor: unavailableMetric("unavailable_instrumentation") };
}
function totals(currency: string, rows: VerifiedCommerceRecord[]): CurrencyTotals {
  const gross = rows.reduce((sum, row) => sum + row.amountMinor, 0);
  const refunded = rows.reduce((sum, row) => sum + row.refundedMinor, 0);
  return { currency, paidOrders: numberMetric(rows.length), grossMinor: numberMetric(gross),
    refundedMinor: numberMetric(refunded), netMinor: numberMetric(gross - refunded),
    averageOrderMinor: rows.length ? numberMetric(gross / rows.length) : unavailableMetric("not_applicable") };
}

/** Read-model arithmetic only. Callers must supply independently verified commerce records. */
export function calculateCommerce(input: CommerceInput): CommerceReport {
  if (input.source !== "available") return unavailableReport(input.source);
  const start = Date.parse(input.startInclusive);
  const end = Date.parse(input.endExclusive);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end ||
      (input.currency !== undefined && !/^[A-Z]{3}$/.test(input.currency))) return unavailableReport("insufficient_evidence");
  const byId = new Map<string, VerifiedCommerceRecord>();
  for (const row of input.records) {
    if (!row.verified || row.paymentMode !== input.paymentMode ||
        (input.currency && row.currency !== input.currency)) continue;
    const paid = Date.parse(row.paidAt);
    if (!Number.isFinite(paid) || paid < start || paid >= end) continue;
    if (!/^[A-Z]{3}$/.test(row.currency) || !Number.isSafeInteger(row.amountMinor) || row.amountMinor < 0 ||
        !Number.isSafeInteger(row.refundedMinor) || row.refundedMinor < 0 || row.refundedMinor > row.amountMinor)
      return unavailableReport("insufficient_evidence");
    const previous = byId.get(row.orderId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) return unavailableReport("insufficient_evidence");
    byId.set(row.orderId, row);
  }
  const groups = new Map<string, VerifiedCommerceRecord[]>();
  for (const row of byId.values()) groups.set(row.currency, [...(groups.get(row.currency) ?? []), row]);
  if (input.currency && !groups.has(input.currency)) groups.set(input.currency, []);
  for (const rows of groups.values()) {
    if (!Number.isSafeInteger(rows.reduce((sum, row) => sum + row.amountMinor, 0)) ||
        !Number.isSafeInteger(rows.reduce((sum, row) => sum + row.refundedMinor, 0)))
      return unavailableReport("insufficient_evidence");
  }
  const byCurrency = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([currency, rows]) => totals(currency, rows));
  const selected = byCurrency.length === 1 ? byCurrency[0] : null;
  const moneyUnavailable = unavailableMetric("not_applicable");
  return { version: ANALYTICS_CONTRACT_VERSION, paidOrders: numberMetric(byId.size),
    currency: selected?.currency ?? null, byCurrency,
    grossMinor: selected?.grossMinor ?? moneyUnavailable, refundedMinor: selected?.refundedMinor ?? moneyUnavailable,
    netMinor: selected?.netMinor ?? moneyUnavailable, averageOrderMinor: selected?.averageOrderMinor ?? moneyUnavailable,
    commissionRevenueMinor: unavailableMetric("unavailable_instrumentation") };
}
