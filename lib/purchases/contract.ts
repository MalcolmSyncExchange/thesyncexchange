export type Evidence =
  | "authoritative"
  | "derived"
  | "unknown"
  | "unavailable"
  | "gate_d_blocked";
export type PurchaseStatus = {
  code: string;
  label: string;
  tone: "success" | "info" | "warning" | "neutral";
  evidence: Evidence;
  detail: string;
};
export type Purchase = {
  id: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  identitySource: "purchase_time" | "current_catalog";
  licenseName: string;
  date: string;
  dateLabel: string;
  amountMinor: number | null;
  currency: string | null;
  paymentMode: "test" | "live" | "unknown";
  summary: PurchaseStatus;
  payment: PurchaseStatus;
  license: PurchaseStatus;
  agreement: PurchaseStatus & { number: string | null; canDownload: boolean };
  receipt: PurchaseStatus;
  files: PurchaseStatus;
  hold: PurchaseStatus;
  terms: {
    use: string[];
    term: string | null;
    territory: string | null;
    version: string | null;
  } | null;
  activity: { label: string; at: string }[];
};
export type PurchasePage = {
  items: Purchase[];
  nextCursor: string | null;
  query: string;
  filter: string;
  pageSize: number;
};
export type OrderFacts = {
  id: string;
  buyer_user_id: string;
  track_id: string;
  license_type_id: string | null;
  status: string;
  created_at: string;
  paid_at?: string | null;
  refunded_at?: string | null;
  checkout_created_at?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  agreement_generation_error?: string | null;
};
export type LicenseFacts = {
  order_id: string;
  buyer_id: string;
  track_id: string;
  license_type_id: string | null;
  status: string;
  generated_at: string | null;
  pdf_storage_path?: string | null;
  generation_error?: string | null;
  agreement_number?: string | null;
  terms_snapshot_json?: unknown;
};
const status = (
  code: string,
  label: string,
  detail: string,
  evidence: Evidence = "derived",
  tone: PurchaseStatus["tone"] = "neutral",
): PurchaseStatus => ({ code, label, detail, evidence, tone });
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.slice(0, 2000) : null;
const date = (value: unknown): string | null =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;
export const REFUND_BANNER =
  "This purchase was refunded. Your issued agreement remains available as a historical record. Refund status alone does not determine whether the license remains valid for continued use. Contact support if you need confirmation of your rights.";

/** Server presentation only. No artifact signing, entitlement creation, or client authorization inference. */
export function presentPurchase(
  order: OrderFacts,
  generated: LicenseFacts | null,
  catalog: {
    title?: string;
    artist?: string | null;
    licenseName?: string;
    artworkUrl?: string | null;
  } = {},
): Purchase {
  const matched =
    generated &&
    generated.order_id === order.id &&
    generated.buyer_id === order.buyer_user_id &&
    generated.track_id === order.track_id &&
    generated.license_type_id === order.license_type_id
      ? generated
      : null;
  const snapshot = record(matched?.terms_snapshot_json);
  const track = record(snapshot.track),
    terms = record(snapshot.license),
    classification = record(snapshot.payment);
  const snapshotValid =
    snapshot.orderId === order.id &&
    record(snapshot.buyer).userId === order.buyer_user_id &&
    track.id === order.track_id &&
    terms.typeId === order.license_type_id &&
    terms.pricePaidCents === order.amount_cents &&
    terms.currency === order.currency;
  const mode =
    snapshotValid &&
    classification.paymentMode === "test" &&
    classification.commercialRightsGranted === false &&
    classification.livemode === false
      ? "test"
      : snapshotValid &&
          classification.paymentMode === "live" &&
          classification.livemode === true &&
          classification.commercialRightsGranted === true
        ? "live"
        : "unknown";
  const refunded = order.status === "refunded";
  const paid = ["paid", "fulfilled", "refunded"].includes(order.status);
  const ready = Boolean(
    matched?.status === "generated" &&
      date(matched.generated_at) &&
      matched.pdf_storage_path &&
      !matched.generation_error &&
      !order.agreement_generation_error &&
      paid,
  );
  const failed = Boolean(
    matched?.status === "failed" ||
      matched?.generation_error ||
      order.agreement_generation_error,
  );
  const agreement = ready
    ? status(
        "ready",
        refunded ? "Issued agreement · Historical copy" : "Ready",
        refunded
          ? "Historical document access does not establish current commercial-use rights."
          : "The issued agreement is available through secure download.",
        "authoritative",
        "success",
      )
    : failed
      ? status(
          "failed",
          "Generation failed",
          "Contact support for help with the agreement.",
          "authoritative",
          "warning",
        )
      : status(
          matched?.status === "pending" ? "pending" : "not_started",
          matched?.status === "pending" ? "Processing" : "Not ready",
          "The issued agreement is not yet available. Refresh to check its status.",
          matched ? "authoritative" : "unknown",
          matched?.status === "pending" ? "info" : "neutral",
        );
  const license = status(
    matched?.status === "generated" ? "issued" : "pending",
    matched?.status === "generated" ? "Issued record" : "Pending",
    mode === "test"
      ? "Test transaction — no commercial rights."
      : refunded
        ? "Refund status alone does not determine current license validity."
        : "The generated purchase-time agreement is the authoritative record when available.",
    matched ? "authoritative" : "unknown",
  );
  const activity: Purchase["activity"] = [];
  for (const [label, at] of [
    ["Order created", order.created_at],
    ["Checkout created", order.checkout_created_at],
    ["Payment recorded", order.paid_at],
    ["Agreement generated", matched?.generated_at],
    ["Refund recorded", order.refunded_at],
  ])
    if (date(at)) activity.push({ label: label as string, at: at as string });
  return {
    id: order.id,
    title: snapshotValid
      ? text(track.title) || catalog.title || "Track unavailable"
      : catalog.title || "Track unavailable",
    artist: snapshotValid ? text(track.artistName) : catalog.artist || null,
    artworkUrl: catalog.artworkUrl || null,
    identitySource: snapshotValid ? "purchase_time" : "current_catalog",
    licenseName: snapshotValid
      ? text(terms.typeName) || "License unavailable"
      : catalog.licenseName || "License unavailable",
    date: date(order.paid_at) || order.created_at,
    dateLabel: date(order.paid_at) ? "Purchased" : "Order created",
    amountMinor:
      Number.isSafeInteger(order.amount_cents) &&
      Number(order.amount_cents) >= 0
        ? Number(order.amount_cents)
        : null,
    currency: /^[A-Z]{3}$/.test(order.currency || "") ? order.currency! : null,
    paymentMode: mode,
    summary: refunded
      ? status(
          "refunded",
          "Refunded",
          "Issued records and delivery availability are shown separately.",
          "authoritative",
          "warning",
        )
      : failed
        ? status(
            "attention",
            "Needs attention",
            "Agreement generation needs attention.",
            "derived",
            "warning",
          )
        : !paid
          ? status(
              "processing",
              "Processing",
              "Payment confirmation is pending.",
              "derived",
              "info",
            )
          : status(
              "partial",
              "Partially ready",
              "Receipt and included-file delivery are unavailable; inspect each domain.",
            ),
    payment: status(
      refunded ? "refunded" : paid ? "paid" : "pending",
      refunded ? "Refunded" : paid ? "Paid" : "Pending",
      mode === "test"
        ? "TEST transaction. No real payment or commercial rights."
        : "Stored payment state; separate from document and file availability.",
      "authoritative",
      refunded ? "warning" : paid ? "success" : "info",
    ),
    license,
    agreement: {
      ...agreement,
      number: text(matched?.agreement_number),
      canDownload: ready,
    },
    receipt: status(
      "unavailable",
      "Unavailable",
      "No purchase receipt delivery is available. Billing invoices are separate.",
      "gate_d_blocked",
    ),
    files: status(
      "unavailable",
      "Unavailable",
      "Purchased-file delivery is not yet available. No file inclusion or entitlement is inferred.",
      "gate_d_blocked",
    ),
    hold: status(
      "unknown",
      "Not available",
      "Security-review status is not provided by this purchase data source.",
      "unknown",
    ),
    terms: snapshotValid
      ? {
          use: Array.isArray(terms.permittedMedia)
            ? terms.permittedMedia
                .filter((v): v is string => typeof v === "string")
                .slice(0, 20)
                .map((v) => v.slice(0, 2000))
            : [],
          term: text(terms.termLength),
          territory: text(terms.territory),
          version: text(snapshot.templateVersion),
        }
      : null,
    activity: activity.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
  };
}
