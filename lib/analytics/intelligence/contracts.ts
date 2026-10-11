import type { EventName } from "../schema.ts";

/** Phase 2 read contracts. Phase 1 event names and payloads remain unchanged. */
export const ANALYTICS_CONTRACT_VERSION = 2 as const;

export const FUNNELS = {
  artist_journey: { role: "artist", steps: ["signup_completed", "onboarding_started", "onboarding_completed", "submission_started", "submission_completed"] },
  buyer_journey: { role: "buyer", steps: ["catalog_searched", "track_preview_started", "license_selected", "checkout_started", "purchase_verified"] },
  artist_acquisition: { role: "artist", steps: ["signup_completed"] },
  artist_first_submission: { role: "artist", steps: ["signup_completed", "onboarding_started", "onboarding_completed", "submission_completed"] },
  artist_onboarding: { role: "artist", steps: ["signup_completed", "onboarding_started", "onboarding_completed"] },
  artist_submission: { role: "artist", steps: ["submission_started", "submission_completed"] },
  buyer_discovery: { role: "buyer", steps: ["catalog_searched", "track_preview_started", "license_selected"] },
  buyer_checkout: { role: "buyer", steps: ["license_selected", "checkout_started", "purchase_verified"] }
} as const satisfies Record<string, { role: "artist" | "buyer"; steps: readonly EventName[] }>;

export const MARKETPLACE_ENGAGEMENT_EVENTS = ["catalog_searched", "track_preview_started", "license_selected"] as const satisfies readonly EventName[];
export const DELIVERY_HEALTH_FIELDS = ["pending", "processing", "retry_scheduled", "held", "exhausted", "delivered", "failed_attempts", "oldest_pending_age", "delivery_latency"] as const;
export const VERIFIED_COMMERCE_FIELDS = ["verified_paid_orders", "gross_transaction_volume", "refund_adjustments", "average_order_value", "commission_revenue"] as const;

export type FunnelName = keyof typeof FUNNELS;
export type MetricUnavailable = "unavailable_source" | "unavailable_instrumentation" | "insufficient_evidence" | "not_applicable";
export type Metric<T> =
  | { state: "observed" | "zero"; value: T }
  | { state: MetricUnavailable; value: null };
export type SourceState = "available" | Exclude<MetricUnavailable, "not_applicable">;
export const numberMetric = (value: number): Metric<number> =>
  Number.isFinite(value) && value >= 0 ? { state: value === 0 ? "zero" : "observed", value } : { state: "insufficient_evidence", value: null };
export const unavailableMetric = (state: MetricUnavailable): Metric<number> => ({ state, value: null });
export const sourceMetric = (state: SourceState): Metric<number> => unavailableMetric(state === "available" ? "insufficient_evidence" : state);

/** A narrow, already-validated projection. No raw provider response or event JSON is accepted. */
export type FunnelObservation = {
  eventId: string;
  actorId: string;
  actorRole: "artist" | "buyer";
  event: EventName;
  occurredAt: string;
  environment: "preview" | "production";
  isTest: boolean;
  isInternal: boolean;
  trackId?: string;
  orderId?: string;
  submissionAttemptId?: string;
  checkoutAttemptId?: string;
  isResubmission?: boolean;
};

export type ObservationWindow = {
  /** Entry cohort. Later steps may occur after endExclusive, up to observedThrough. */
  startInclusive: string;
  endExclusive: string;
  observedThrough: string;
  maxStepLagMs: number;
};

export type FunnelInput = {
  funnel: FunnelName;
  source: SourceState;
  instrumentedEvents: readonly EventName[];
  observations: readonly FunnelObservation[];
  window: ObservationWindow;
  environment: "preview" | "production";
  cohortActorIds?: ReadonlySet<string>;
  /** Internal cooperative reporting deadline; never serialized in metrics. */
  deadlineAt?: number;
  includeTest?: boolean;
  includeInternal?: boolean;
};

/** Future SEC read models must derive these from the outbox, never from raw errors. */
export type DeliveryHealthMetrics = {
  version: typeof ANALYTICS_CONTRACT_VERSION;
  source: SourceState;
  pending: Metric<number>;
  delivered: Metric<number>;
  leased: Metric<number>;
  failedAttempts: Metric<number>;
  oldestPendingSeconds: Metric<number>;
  deliveryLatencyMedianSeconds: Metric<number>;
};

export type MarketplaceEngagementMetrics = {
  version: typeof ANALYTICS_CONTRACT_VERSION;
  searchedActors: Metric<number>;
  previewedActors: Metric<number>;
  selectingActors: Metric<number>;
  searchEvents: Metric<number>;
  previewEvents: Metric<number>;
};

export type VerifiedCommerceRecord = {
  orderId: string;
  paidAt: string;
  amountMinor: number;
  refundedMinor: number;
  currency: string;
  paymentMode: "test" | "live";
  /** True only after independently verified, persisted payment evidence. */
  verified: boolean;
};
