# Phase 2 Slice 5 — Financial Intelligence

Authorization: isolated local work only. No deployment, push, hosted read/write, migration application, Stripe calls, licenses, refunds, payouts or analytics activation.

Baseline branch `codex/posthog-phase2-slice4`, verified full SHA `c54b75b96a8b58218c4e7b9ff642ee7ab0c07c50`. Implementation branch `codex/posthog-phase2-slice5`. Local worktree created from that exact commit; original checkout left untouched.

## Source inventory and decisions

| Source inspected | Authority and reporting limits |
| --- | --- |
| `public.orders` and lifecycle migration `0009_order_lifecycle.sql` | Checkout/session/intent bindings, amount, currency and delivery timestamps. Status alone does not establish provider verification. No partial-refund amount history. Legacy rows may lack immutable payment evidence. |
| `app/api/checkout/route.ts` | Server checkout creates orders/sessions. Session creation is not capture and abandoned checkout is not revenue. |
| `app/api/webhooks/stripe/route.ts` | Verifies Stripe signatures and checks amounts/mode. Handles paid, async failure, refunded and disputed states. Do not call Stripe for reports. |
| `commerce_private.payment_events` (`20261002045900_purchase_completion_foundation.sql`) | Immutable signature-verified payment facts; unique provider/account/mode/event identity. Cumulative refunds, payment failures and disputes are stored. Current constraints support **test only**, positive integer amounts and explicit currency. |
| `commerce_private.order_states` / `state_history` | First captured payment and current delivery/refund state are independent. Mutable current state cannot supply historical refund trends by itself. |
| `public.order_delivery_contracts` / `commerce_private.contract_context` | Frozen price, currency, license and ownership snapshot. Rights snapshots contain private identities and must stay server-side. |
| `public.generated_licenses` | Generated delivery status and artifact existence; separate from payment. Failed generation must not erase verified capture. Private document paths/HTML must never enter dashboard DTOs. |
| `get_analytics_verified_purchase` (`20261010060000_analytics_verified_purchase_evidence.sql`) | Service-only proof of an exact order/account/event tuple. Test only; Gate D excluded; requires known paid event ID. Not a bounded ledger scan, refund history or complete financial census. |
| Gate D acceptance schemas/functions | Acceptance fixtures and test grants are not commercial live licensing; existing analytics projection excludes them. A future reporting adapter must define and expose this scope. |
| `public.artist_transaction_records` | Revisioned test transaction projections. Explicit `payable_earnings_calculated = false`; not commission, earnings, obligations or settlement accounting. |
| `public.rights_holders`, submission ownership validation | Ownership percentages, not contractual payable splits or disbursement obligations. Do not multiply buyer payments by these percentages. |
| Artist payout email/settings | Destination preference only; no payout ledger or authoritative status. |
| Marketplace fees/commission/settlement | No booked fee, commission ledger or allocation/settlement ledger found. License fee formatting is buyer price, not marketplace commission. |
| `analytics_outbox` / `purchase_verified` | Analytics transport and behavioral observations; never financial payment proof. |

The persisted private ledger is a potential authoritative source, but there is no complete bounded reporting projection in this baseline. The server adapter intentionally returns `unavailable_source` / `bounded_projection_missing`. It does not count paid order statuses, guess event IDs from the last webhook, read outbox events, or fabricate demo money. This slice implements the typed aggregation foundation and dashboard, **not a working ledger-backed financial feed**. Existing private schemas are not assumed exposed to PostgREST. No migrations are added or applied.

## Contracts and calculation rules

`lib/analytics/financial/report.ts` defines internal `PaymentFact`, cumulative `RefundFact`, `FinancialSource`, bounded `FinancialRequest`, and aggregate-only `FinancialReport` contracts. Internal facts require a trusted adapter; a browser-supplied verification flag is never sufficient. Payment keys must represent economic captures (provider/account/mode/intent), not webhook event IDs. Conflicting duplicate facts or multiple captures claiming the same order fail closed. Identical duplicates are deduplicated before arithmetic.

- Verified paid orders: unique signature-verified captures with matched persisted order/contract bindings; capture time determines purchase cohort. Unverified and absent evidence contributes nothing only when source coverage is explicitly complete.
- Completed licenses: current completed delivery status for verified purchase cohorts. This is not license-generation event count by generation date or historical delivery status as of bucket end. A future adapter must prove artifact/status/buyer/track/license/payment snapshot bindings before marking completed.
- Gross volume: sum captured minor units per currency. Never called commission revenue. Average order: gross / matched captures in the same currency. Empty denominators are not applicable, not zero.
- Refunds: sort complete cumulative provider refund observations; sum only incremental differences, grouped by original currency and refund occurrence date. Duplicate webhook snapshots add no refund. Unknown payment/currency conflicts, decreases, over-refunds and conflicting duplicate events make refund totals insufficient evidence. History before the reporting window is necessary to calculate first in-window deltas.
- Refund-adjusted period volume: captures during period minus refund deltas during period, including refunds of older captures. Can be negative. This is a cash activity measure, not accrual revenue or net artist earnings.
- Categories: digital campaign, broadcast and exclusive buyout; currency totals stay separate. No cross-currency scalar or FX conversion exists. Arithmetic uses safe integer minor units; AOV can be fractional minor units. UI labels amounts as minor units, avoiding assumed two-decimal currency scales.
- Daily/weekly/monthly continuous UTC intervals reuse existing calendar helpers. Empty covered buckets are zero; source failures remain unavailable. Previous periods have equal elapsed duration; total query span including comparison is limited to 93 days.
- Marketplace commission, artist gross/net, contributor obligations, payout status and purchase conversion are unavailable. Complete checkout-attempt/cohort denominator and linked capture evidence are missing; browser funnel conversion is not financial conversion.
- Authoritative failed-payment count can be supplied by a future reader; current runtime is unavailable. The count must be unique failed attempts, not number of repeated failure events.
- Disputes/reversals are stored in private events but not exposed by the current refund-only normalized contract. Adjusted volume **does not account for dispute losses**. The future adapter must return unavailable adjustment metrics when reversals cannot be reconciled, or extend the contract before enabling reporting.

## Reconciliation and security

The normalizer must compare provider evidence with frozen contract/order amount, currency, mode, buyer/track/license/session/intent and generated license bindings. The model reports aggregate reconciliation states: verified (matched capture/completed delivery), pending reconciliation (matched capture with pending/failed/missing delivery), mismatched (contradictory order binding), missing source (missing order), unavailable (source coverage unavailable). Mismatched and missing orders are excluded from monetary totals and remain visible as counts. These are counts over capture cohorts, not a global audit of every unmatched legacy order. Refund integrity is surfaced separately as `refundSource`; it is never silently zeroed. Missing fee/payout sources stay unavailable. No individual IDs, names, provider payloads, agreement paths or contributor data leave the read model.

`requireAccountScope("admin")` reads authenticated user and canonical `public.user_profiles.role` before source opening in the server-only reader; authorization errors propagate. Date/mode/interval validation occurs before privileged source opening. Reader errors become safe explicit source failures. Service credentials and raw errors are not serialized. There is no unauthenticated financial API or mutation, and no production action is taken.

SEC route `/admin/analytics/financial` links from existing intelligence. Modules include Financial Data Health, Transaction Performance, Revenue Overview, License Performance and Refund Intelligence with continuous hover/focus inspectable values, original currency labels, previous-period tables and explicit unavailable states. It reuses existing card styling and time/metric contracts. Local browser fixture is generated temporarily by the test script and removed afterward; it has no auth bypass in the shipped route.

## Required separate implementation plan

1. Review a bounded, server-only ledger projection/RPC, guarded by canonical admin authority and service-only grants. Use minimal projections, deterministic pagination, explicit row/time limits, source freshness/completeness watermarks, provider account/environment/mode scope and Gate D designation. Preserve mismatch rows instead of filtering them out. Avoid exposing private schema tables or identities.
2. Normalize economic captures and refund/reversal deltas with complete pre-window baselines and late-arrival handling. Audit legacy orders lacking evidence; never backfill verification from order status. Verify generated artifact/payment binding independently. Distinguish historical as-of delivery from current cohort delivery.
3. Add separate immutable booked commission/fee ledger: capture key, order, currency, booked amount, effective rate/rule version, booking timestamp, source provenance, reversals and idempotency identity. No inferred fee rate in analytics.
4. Add separate earnings/allocation and contributor obligations ledger: contract version, gross allocation, platform/processor fee allocation, adjustments, beneficiary reference, due currency/amount, obligation state, provenance. Keep beneficiary details private; report aggregates only.
5. Define settlement/payout ledger: obligation links, provider transfer reference, test/live scope, currency, gross/fees/net, pending/paid/failed/reversed states and timestamps. Settlement automation and Stripe Connect remain outside this slice.
6. Verify all projection/normalization boundaries with local database fixtures, then seek separate approval for any hosted migration or activation. Live reporting remains unavailable until live immutable evidence exists; test evidence cannot stand in for it.

## Recommendation and limitations

**NO-GO for a Slice 6 that relies on populated or operational financial intelligence.** Local contracts and UI are reviewable, but payment/refund reporting adapter, complete coverage and accounting ledgers remain missing. GO only for further isolated contract/projection work after reviewing this report. No hosted schema or provider configuration changes are needed to review this slice.

Local tests cover all 17 requested cases plus refund history, conflicting duplicates, missing order, incomplete coverage and safe server wiring. Financial tests use mocks and fixtures; they cannot certify hosted permissions, finance accuracy against a real provider ledger, or current production configuration. Browser checks use a local fixture only.

## Validation results

- `node --test --experimental-strip-types tests/financial-intelligence.test.mjs`: 27/27 passed.
- `npm run test:unit`: 621/621 passed after copying the existing Slice 4 dependency directory into the isolated worktree. Initial reused primary dependencies lacked PGlite: 488 passed / 11 failed. No dependency versions changed.
- `npm run typecheck`: passed. A post-browser run initially found stale generated type references to the removed temporary fixture route; clearing the local `.next/dev` cache resolved it.
- `npm run lint`: passed with one existing React Hook Form/React Compiler warning in `components/forms/submit-music-form.tsx:178`; zero errors.
- `npm run build`: passed, includes `/admin/analytics/financial`. Initial external dependency symlink was rejected by Turbopack; local copied dependencies resolved it.
- `node tests/sec-financial-browser.mjs`: passed (hover/focus, financial filters, refund selector, privacy, reconciliation, 390px and 1280px layouts). Temporary fixture route removed afterward.
- `git diff --check`: passed. Next-generated AGENTS/next-env changes restored to baseline; no unrelated generated files included.

Hosted Supabase/route/role verification commands intentionally not run: they can access hosted environments and are outside the local-only authorization. No migration, policy, webhook or checkout behavior changed.
