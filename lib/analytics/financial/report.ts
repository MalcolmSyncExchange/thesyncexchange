import { numberMetric, unavailableMetric, sourceMetric, type Metric, type SourceState } from "../intelligence/contracts.ts";
import { previousPeriod, timeBuckets, validateRange, type TimeRange, type Granularity } from "../intelligence/time.ts";

export type PaymentMode = "test" | "live";
export type ReconciliationState = "verified" | "pending_reconciliation" | "mismatched" | "missing_source" | "unavailable";
/** Internal adapter contract. Never serialize these records to dashboard clients. */
export type PaymentFact = {
  paymentKey: string; orderKey: string; mode: PaymentMode; capturedAt: string;
  amountMinor: number; currency: string; licenseCategory: "digital-campaign" | "broadcast" | "exclusive-buyout";
  signatureVerified: boolean; orderBinding: "matched" | "mismatched" | "missing";
  license: "completed" | "pending" | "failed" | "missing";
};
/** Cumulative provider refund observations; delta is derived per payment, never summed blindly. */
export type RefundFact = { eventKey: string; paymentKey: string; mode: PaymentMode; occurredAt: string;
  cumulativeMinor: number; currency: string; signatureVerified: boolean };
export type FinancialSource = { state: SourceState; payments: readonly PaymentFact[]; refunds: readonly RefundFact[];
  refundsState: SourceState; failedPayments: Metric<number>; reason: "bounded_projection_missing" | "source_failed" | "complete";
  /** Full payment/refund history through query end, including payments before query start. */
  historyComplete: boolean };
export type FinancialRequest = { range: TimeRange; mode: PaymentMode; granularity: Exclude<Granularity, "hour">; comparePrevious: boolean };
export type MoneyMetrics = { currency: string; verifiedPaidOrders: Metric<number>; completedLicenses: Metric<number>;
  grossMinor: Metric<number>; averageOrderMinor: Metric<number>; refundsMinor: Metric<number>; refundAdjustedMinor: Metric<number> };
export type FinancialPeriod = { range: TimeRange; verifiedPaidOrders: Metric<number>; completedLicenses: Metric<number>;
  currencies: MoneyMetrics[]; byLicense: { category: PaymentFact["licenseCategory"]; currencies: MoneyMetrics[] }[] };
export type FinancialReport = { version: 1; mode: PaymentMode; granularity: FinancialRequest["granularity"]; source: SourceState; reason: FinancialSource["reason"];
  current: FinancialPeriod; previous: FinancialPeriod | null; series: FinancialPeriod[];
  reconciliation: { state: ReconciliationState; count: number }[];
  commissionRevenueMinor: Metric<number>; artistGrossMinor: Metric<number>; artistNetMinor: Metric<number>;
  outstandingContributorMinor: Metric<number>; payoutStatus: Metric<number>; purchaseConversion: Metric<number>;
  failedPayments: Metric<number>; refundSource: SourceState };
const missing = () => unavailableMetric("unavailable_instrumentation");
export function unavailableFinancialSource(reason: FinancialSource["reason"] = "bounded_projection_missing"): FinancialSource {
  return { state: "unavailable_source", payments: [], refunds: [], refundsState: "unavailable_source", failedPayments: missing(), reason, historyComplete: false };
}
export function validateFinancialRequest(request: FinancialRequest) {
  validateRange(request.range);
  if (!["test", "live"].includes(request.mode) || !["day", "week", "month"].includes(request.granularity)) throw new Error("financial_invalid_request");
  const start = request.comparePrevious ? previousPeriod(request.range).startInclusive : request.range.startInclusive;
  validateRange({ startInclusive: start, endExclusive: request.range.endExclusive });
}
const inRange = (date: string, range: TimeRange) => Date.parse(date) >= Date.parse(range.startInclusive) && Date.parse(date) < Date.parse(range.endExclusive);
const validMinor = (amount: number) => Number.isSafeInteger(amount) && amount >= 0;
const categories = ["digital-campaign", "broadcast", "exclusive-buyout"] as const;

export function buildFinancialReport(source: FinancialSource, request: FinancialRequest): FinancialReport {
  validateFinancialRequest(request);
  let state = source.state;
  let refundState = source.refundsState;
  const payments = new Map<string, PaymentFact>();
  const orderKeys = new Set<string>();
  const refundEvents = new Map<string, RefundFact>();
  const reconciliation = new Map<ReconciliationState, number>();
  const mark = (key: ReconciliationState) => reconciliation.set(key, (reconciliation.get(key) ?? 0) + 1);
  for (const row of source.payments) {
    if (row.mode !== request.mode || !row.signatureVerified) continue;
    if (!row.paymentKey || !row.orderKey || !validMinor(row.amountMinor) || !/^[A-Z]{3}$/.test(row.currency) ||
        !Number.isFinite(Date.parse(row.capturedAt)) || !categories.includes(row.licenseCategory) ||
        !["matched","mismatched","missing"].includes(row.orderBinding) || !["completed","pending","failed","missing"].includes(row.license)) {
      state = "insufficient_evidence"; continue;
    }
    const prior = payments.get(row.paymentKey);
    if (prior) { if (JSON.stringify(prior) !== JSON.stringify(row)) state = "insufficient_evidence"; continue; }
    if (orderKeys.has(row.orderKey)) { state = "insufficient_evidence"; continue; }
    payments.set(row.paymentKey, row); orderKeys.add(row.orderKey);
    const auditRange = { startInclusive: request.comparePrevious ? previousPeriod(request.range).startInclusive : request.range.startInclusive, endExclusive: request.range.endExclusive };
    if (inRange(row.capturedAt, auditRange)) mark(row.orderBinding === "mismatched" ? "mismatched" : row.orderBinding === "missing" ? "missing_source" : row.license === "completed" ? "verified" : "pending_reconciliation");
  }
  if (state === "available" && !source.historyComplete) state = "insufficient_evidence";
  for (const row of source.refunds) {
    if (row.mode !== request.mode || !row.signatureVerified || Date.parse(row.occurredAt) >= Date.parse(request.range.endExclusive)) continue;
    const payment = payments.get(row.paymentKey), prior = refundEvents.get(row.eventKey);
    if (!row.eventKey || !payment || payment.currency !== row.currency || !validMinor(row.cumulativeMinor) || row.cumulativeMinor > payment.amountMinor ||
        !Number.isFinite(Date.parse(row.occurredAt)) || Date.parse(row.occurredAt) < Date.parse(payment.capturedAt) ||
        (prior && JSON.stringify(prior) !== JSON.stringify(row))) { refundState = "insufficient_evidence"; continue; }
    refundEvents.set(row.eventKey, row);
  }
  const refunds: { payment: PaymentFact; date: string; delta: number }[] = [];
  const refunded = new Map<string, number>();
  for (const row of [...refundEvents.values()].sort((a,b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.cumulativeMinor - b.cumulativeMinor)) {
    const previous = refunded.get(row.paymentKey) ?? 0;
    if (row.cumulativeMinor < previous) { refundState = "insufficient_evidence"; continue; }
    refunds.push({ payment: payments.get(row.paymentKey)!, date: row.occurredAt, delta: row.cumulativeMinor - previous });
    refunded.set(row.paymentKey, row.cumulativeMinor);
  }
  const eligible = [...payments.values()].filter(p => p.orderBinding === "matched");
  const currencyLabels = [...new Set(eligible.map(p => p.currency))].sort();
  function period(range: TimeRange): FinancialPeriod {
    const rows = eligible.filter(p => inRange(p.capturedAt, range));
    const metric = (n: number) => state === "available" ? numberMetric(n) : sourceMetric(state);
    function money(currency: string, category?: PaymentFact["licenseCategory"]): MoneyMetrics {
      const matching = rows.filter(p => p.currency === currency && (!category || p.licenseCategory === category));
      const gross = matching.reduce((n,p) => n + p.amountMinor, 0);
      const refund = refunds.filter(r => r.payment.orderBinding === "matched" && r.payment.currency === currency && (!category || r.payment.licenseCategory === category) && inRange(r.date, range)).reduce((n,r) => n + r.delta, 0);
      const adjustment = state === "available" && refundState === "available" && source.historyComplete && Number.isSafeInteger(gross - refund)
        ? { state: gross === refund ? "zero" as const : "observed" as const, value: gross - refund } : sourceMetric(state !== "available" ? state : refundState);
      return { currency, verifiedPaidOrders: metric(matching.length), completedLicenses: metric(matching.filter(p => p.license === "completed").length),
        grossMinor: Number.isSafeInteger(gross) ? metric(gross) : unavailableMetric("insufficient_evidence"),
        averageOrderMinor: !Number.isSafeInteger(gross) ? unavailableMetric("insufficient_evidence") : state !== "available" ? sourceMetric(state) : matching.length ? numberMetric(gross / matching.length) : unavailableMetric("not_applicable"),
        refundsMinor: state !== "available" ? sourceMetric(state) : refundState === "available" ? numberMetric(refund) : sourceMetric(refundState), refundAdjustedMinor: adjustment };
    }
    return { range, verifiedPaidOrders: metric(rows.length), completedLicenses: metric(rows.filter(p => p.license === "completed").length),
      currencies: currencyLabels.map(c => money(c)), byLicense: categories.map(category => ({ category, currencies: currencyLabels.map(c => money(c,category)) })) };
  }
  return { version: 1, mode: request.mode, granularity: request.granularity, source: state, reason: source.reason, current: period(request.range),
    previous: request.comparePrevious ? period(previousPeriod(request.range)) : null,
    series: timeBuckets(request.range, request.granularity, "UTC").map(period),
    reconciliation: state === "available" ? [...reconciliation].map(([state,count]) => ({ state,count })) : [{ state: "unavailable", count: 0 }],
    commissionRevenueMinor: missing(), artistGrossMinor: missing(), artistNetMinor: missing(), outstandingContributorMinor: missing(), payoutStatus: missing(),
    purchaseConversion: missing(), failedPayments: state === "available" ? source.failedPayments : sourceMetric(state), refundSource: refundState };
}
