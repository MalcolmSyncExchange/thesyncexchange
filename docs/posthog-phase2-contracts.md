# PostHog Phase 2, Slice 1: analytics contracts

Contract version: `2`. Phase 1 event names, ingestion, outbox schema, webhook and payloads remain unchanged. These pure read-model contracts do not send events or query a hosted source.

## Source and availability

- Callers project **validated, allowlisted** Phase 1 events into `FunnelObservation`. The projection contains only UUID identity/joins, controlled event and role names, timestamps, environment and test/internal flags. Raw event JSON, browser URLs, search text, payment data and free text must never enter a SEC read model.
- `source=available` means the query succeeded and the required time range is complete enough for the intended metric. `unavailable_source` means a query failed; `unavailable_instrumentation` means a required event or authoritative field is absent; `insufficient_evidence` means coverage or evidence is contradictory/incomplete. `not_applicable` is used when a rate has no denominator or money has no unambiguous currency. A successful, complete query with no qualifying rows is a legitimate `zero`.
- Each funnel also requires an explicit `instrumentedEvents` list. Omitting a step marks the report unavailable; a missing event row never manufactures a step.
- The source adapter in a future slice must check query errors, delivery watermark, deployment/event-version coverage and any lag before declaring a source available. PostHog receipt and an HTTP 204 from the analytics endpoint alone do not establish complete coverage.

## Funnel population rules

| Contract | Ordered Phase 1 steps | Counting key |
| --- | --- | --- |
| Artist acquisition | `signup_completed` | Artist UUID |
| Artist onboarding | `signup_completed`, `onboarding_started`, `onboarding_completed` | Artist UUID |
| Artist submission | `submission_started`, `submission_completed` | Artist UUID; submission attempt where both sides provide it |
| Buyer discovery | `catalog_searched`, `track_preview_started`, `license_selected` | Buyer UUID; preview and selection must agree on track |
| Buyer checkout | `license_selected`, `checkout_started`, `purchase_verified` | Buyer UUID; same track, then same order |

- Entry is an observed first-step event within `[startInclusive, endExclusive)`. Later steps may occur through `observedThrough`, subject to `maxStepLagMs` between adjacent steps. Cohort filtering is by an explicit set of Supabase actor UUIDs. Environment, test and internal filtering happens before counts.
- An event advances only after the previous step's **observed occurrence timestamp** and at most one open attempt. Source row order or ingestion order never sets journey order. Same-timestamp events cannot establish a sequence without independent ordering evidence. A later event without an earlier matched event is excluded from funnel populations.
- Each repeated first-step event opens an attempt. An actor appears once in the primary step population if any attempt reaches that step. The earliest eligible open attempt consumes a matching later event. `matchedAttempts` gives a separate attempt count; `observedEvents` counts distinct eligible event UUIDs, including later events that cannot be attached to an entry. A second checkout event may therefore be observed without representing a second buyer or a second matched funnel entry.
- Track, order and submission-attempt identifiers must agree when present on both sides. Missing submission attempt IDs permit an actor-and-time match, so a future SEC view should label that join as actor-only evidence. A stronger per-attempt submission analysis requires complete attempt identifiers; it must not claim exact per-attempt attribution from actor-only matches.
- Step-to-step conversion is `100 ×` unique actors reaching the next step divided by unique actors at the previous step. Drop-off is the previous population minus that next population, with its own percentage. Overall conversion is `100 ×` completing actors divided by entering actors. Empty denominators are `not_applicable`, not zero percent.
- Separate attempt conversion percentages divide matched attempts reaching the next step by matched attempts reaching the prior step. They answer repeat-journey questions and must never be labeled buyer or artist conversion.
- Durations are computed from occurrence timestamps, in seconds. Each actor contributes their shortest valid matched duration to the median, so repeated attempts do not overweight one actor. A report with no completed journey has `not_applicable` completion time.
- A late-arriving event changes a later recomputation based on its original occurrence time. For a still-open or incomplete source window, pass `insufficient_evidence`; do not present provisional nonconversion as a final dropout. No historical backfill is implied.

## Commerce and engagement

- Engagement covers `catalog_searched`, `track_preview_started` and `license_selected`. Its actor metrics count unique buyers; event metrics count validated event UUIDs. It is observed behavior, not an inferred sale.
- `VerifiedCommerceRecord` is a narrow projection from independently verified, persisted commerce evidence. `verified=true` must be set only by that trusted adapter. `purchase_verified` or a browser event alone is not a financial source.
- Paid count is distinct verified order IDs within the paid-at range and selected payment mode. Gross is the sum of frozen paid amounts in minor units. Refund adjustments are cumulative verified refunds, bounded by the original amount; net is gross minus refunds. Average order value is gross divided by verified orders, with no denominator yielding `not_applicable`.
- Financial sums are currency-specific. If more than one currency is present, the report supplies separate currency totals and marks a combined money value `not_applicable`. An explicit currency gives a legitimate zero when the verified source is available but has no matching orders. Test and live modes must be reported separately.
- Commission revenue remains `unavailable_instrumentation` until an authoritative commission ledger and recognition rule exist. It must not be estimated from gross volume or a browser event.

## Event health and SEC authorization

`DeliveryHealthMetrics` defines pending, delivered, leased, failed-attempt, pending-age and delivery-latency outputs. The current outbox does not persist failed-attempt count; that field remains unavailable until Slice 2 adds safe status data. SEC adapters must authenticate the current user, check the canonical admin role before privileged reads, return aggregates only, and preserve unavailable states when a query fails.

No device field exists in the Phase 1 event contract. Device segmentation remains unavailable until a separate privacy-approved coarse classification is defined. No session recording or automatic tracking is needed for these contracts.
