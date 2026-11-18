# System 12 — analytics contract

Local-only successor to System 11 `5c40d6858ba69dd51492cdcfc38fe2feb8af1e63`. Existing Phase 1 payloads, Phase 2 metric states, source limitations, retry categories, capped eight-attempt leases, staging identity controls and accepted evidence are retained. The directive authorizes no hosted activity or activation.

## Reviewed foundation and resolved gaps

The existing single `public.analytics_outbox`, property allowlists, server attribution, browser playing/search/selection handlers, leased workers, retry/dead-letter operations, Phase 2 ordered unique-actor/attempt models, continuous timezone-aware series, comparisons, focus/hover chart and financial normalization are preserved. `baseline-stream-inventory.json` records all System 01–11 and PostHog branch heads/ancestry; unrelated dirty work is neither copied nor overwritten. Original Phase 2 documents and evidence remain unchanged.

Previous gaps: new Systems 03–11 lifecycle facts were not projected; the financial server adapter returned unavailable regardless of existing accounting; Buyer signup was absent from the Buyer funnel; Marketplace deal correlation was missing; non-Admin analytics actor resolution lacked a current-session check; optional analytics could fail a verified payment webhook; capture paths attempted synchronous provider delivery; no consent/retention gate fenced older queue records.

## Authority and privacy

`analytics_private.configuration` defaults to disabled, preview, privacy approval false and 30-day local retention (installer-constrained 7–365). These are conservative implementation defaults, not newly approved founder policy. Separate privacy/legal approval, retention selection and activation authorization remain mandatory. No UI or public RPC may alter configuration. Environment variables still require the existing identity-bound, separate-environment PostHog token configuration.

Optional consent is unchecked at signup and adjustable at `/account/analytics`. Version `analytics-optional-v1` describes only pseudonymous product activity. New-signup consent may be registered only by a trusted server using the actual newly created canonical profile; legacy accounts cannot manufacture an acquisition event. The signup role is frozen at registration; an originally unassigned signup is never reclassified using a later canonical role. Unsupported subject-role changes are excluded before the batch limit so they cannot starve recoverable facts. Preference changes require provider-authenticated, active own-account sessions; version mismatch fails closed. No consent is inferred from general terms, account existence, metadata or historical analytics rows. The notice and published privacy policy need independent review before the privacy approval gate can be enabled.

Browser capture is enabled only after authenticated SQL preference checks. Capture and every worker claim check the database gates, consent version, current canonical role/account restrictions, retention and observation timestamp. A second check before external HTTP fences withdrawn/deleted/restricted accounts and expired leases. Withdrawal removes local observations (including previously delivered local copies); reconsent does not backfill prior activity. A request already in external network transit cannot be recalled: external erasure/processor retention is a separate approved privacy workflow. No provider deletion is executed here.

No analytics cookies, autocapture, advertising identifiers, session replay, person profiles, IP/geolocation, names, emails, free-text searches, messages, audio, private paths, rights documents, financial amounts or credentials are transmitted. Event strings are fixed enums or UUIDs. Financial aggregates stay in authenticated SEC reporting, not PostHog. Canonical Admin + current provider MFA + `full_admin` remains mandatory before privileged reporting. Customer preferences grant no administrative access.

## Instrumentation map

| Requirement | Existing/new evidence |
|---|---|
| Buyer/Artist signup | Existing `signup_completed`, canonical role; explicit signup consent, recoverable signup preference evidence |
| Confirmation | `email_confirmed`, Auth provider's `email_confirmed_at`; never inferred from callback rendering |
| Onboarding | Existing browser `onboarding_started`; completion from canonical `onboarding_completed_at` |
| Artist profile | `artist_profile_completed`, retained account acknowledgment |
| Submission/upload | Existing submission attempts; `master_review_requested` → `submission_completed`; `validation_passed` → `upload_completed` |
| Rights | `rights_reviewed` and `rights_approved`, immutable review decisions attributed to the Artist subject |
| Catalog | `catalog_reviewed`, `catalog_approved`, `catalog_published`, immutable decisions/publication events |
| Search/filter | Existing `catalog_searched`, bounded filter names/count, no values or search text |
| Preview/selection | Existing actual-playing preview tracker and explicit safe license selection |
| Acceptance | `buyer_accepted`, immutable transaction acceptance; no legal-party/document payload |
| Checkout | Existing verified Stripe session binding + recoverable `checkout_created_at`; stable order attempt/key |
| Verified purchase | Original exact evidence proof and `purchase:order` key; collector reads first verified paid provider fact, excludes Gate D |
| Issuance | `license_issued`, retained generated license bound to verified payment |
| Delivery | `asset_delivery_completed` only for finished `stream_exhausted`; other finished outcomes → `asset_delivery_failed`; neither claims client receipt |
| Refund/dispute | `refund_verified`, `dispute_verified`, immutable authenticated payment facts |
| Subscription | `subscription_activity` is explicitly an administrative observation, not provider-verified billing |
| Admin operations | `admin_operation`, fixed module classification, immutable revisions/domain audit records; internal excluded from behavioral funnels |
| Failures | Existing safe `funnel_step_failed`; media `operational_failure`; private queue/category and financial/delivery recovery aggregates |
| Marketplace | Immutable SEC deal inquiry/quote/checkout/license revisions, linked by `deal_id` and exact order |

Lifecycle collection executes in an explicit service-only bounded RPC (maximum 200), outside critical transactions. Source keys and original occurrence timestamps are retained. A transaction interruption rolls the batch back; the next collection re-reads unprojected canonical facts. No critical workflow depends on an analytics trigger or collector. Duplicate/conflicting keys are serialized and checked; accepted event identity/properties/time are immutable. Configured internal/test subject UUIDs are passed by the trusted worker into collection before insertion; malformed/oversized exclusion configuration fails closed. No historical backfill before capture/consent/retention cutoffs occurs. Source authenticity is the domain's existing authorization/evidence contract, not a browser claim.

## Delivery and operational contract

Capture paths enqueue only. Verified purchase analytics failure cannot fail payment acknowledgement; retained provider facts permit later collection without a Stripe resend. Original financial/rights/issuance validation failures still fail closed. The explicit worker collects evidence then drains at most ten events. Collection failure does not prevent existing durable retries; last successful collection is visible in SEC. There is no installed scheduler/public worker route. Manual existing retry API remains origin-, role-, MFA- and scope-protected and now bounds the actual streamed request body to 2 KiB.

Existing SQL leases, `FOR UPDATE SKIP LOCKED`, retry backoff/jitter, held/exhausted states, deliberate release/new cycle and stale-completion fencing remain authoritative. Crash after provider acceptance may resend the identical UUID/time/actor/event. This is at-least-once delivery with stable identity, not a claim of provider exactly-once reporting. HTTP success means ingestion acknowledgement only. Unknown schemas and invalid identities are held by the allowlist transport; no response bodies/raw errors are stored.

`analytics_retention()` deletes analytics observations and ages collection receipts only. It never deletes payment, license, source, agreement, entitlement or financial audit evidence. No retention schedule is activated. Restriction/deletion fences also apply on claim. Independent external retention/erasure and jurisdictional policy remain pending.

## Reporting semantics

New funnels supplement existing Phase 2 names: Artist signup → onboarding completion → submission → rights approval → publication; Buyer signup → search → preview → selection → checkout → verified purchase → completed server transfer; Marketplace discovery → inquiry → quote → checkout → license. Actor, order, track, submission and deal correlation prevent unrelated journeys joining. Each later event consumes at most one attempt. Source occurrence time, not arrival order, determines strict forward progression; equal timestamps do not invent ordering. Configured follow-up is one day per step, up to six days for the Buyer journey; these are explicit reporting windows, not approved business conversion targets.

Behavioral reports exclude tests/internal events and represent consented observed activity, not a full marketplace census. Preview capture is marked test and therefore excluded from normal behavioral reports. Both environments are separately selectable; none are activated. Continuous series include real zero buckets only when source/instrumentation exists. Missing sources/instrumentation, insufficient evidence and not-applicable denominators remain distinct. Local outbox coverage/freshness is provisional; receipt is not independently verified PostHog visibility.

Buyer acquisition is distinct from the retained Artist signup metric. Catalog approval percentage counts review decisions (not unique submissions or cleared real inventory). Published-track counts are unique tracks observed publishing in the window, not net stock growth or first-ever publication. Active-user definitions retain Phase 2 action events. Subscription/Admin observations never become revenue.

The financial adapter reads authenticated aggregate/fact RPCs with current full Admin MFA and bounded retained verified payment/refund history (10,000-record cap). Frozen contract, provider account/session/intent/amount/currency and acceptance hash must match. Economic captures deduplicate authentic envelopes; conflicting facts fail closed. Refunds use cumulative deltas and retain prior history. Dispute uncertainty prevents the legacy refund-only adjusted metric from claiming completeness. Live evidence remains unavailable under the current test-only financial model.

Booked financial reporting uses balanced immutable journals with exact decimal-string minor units and currency partitions. Commission and seller accrual are period journal activity; obligations are net retained liabilities as of range end; chargeback expense is separate. Seller accrual includes payable/reserved/payout-clearing movements so reservation/settlement cannot create earnings. Unposted books are visible; actual payouts remain unavailable/disabled. No rate, ownership percentage, order status or telemetry event substitutes for verified financial evidence. Complete retained internal history is not independent proof of complete provider account history.

## Hosted promotion prerequisites and rollback

1. Separately authorize isolated integration of this exact commit and migration after all 64 dependencies; verify effective Auth/MFA/RLS/private grants and default disabled gates.
2. Independently approve privacy notice/lawful basis, retention and erasure procedures, restricted/deleted accounts and separate PostHog project/environment token bindings. Preserve the existing Phase 2 evidence exception; no historical acceptance is erased.
3. Define authenticated server scheduling, maximum batch/runtime, secret custody, dead-letter/retry/collector-staleness alerts, operational ownership and escalation. No schedule is installed here.
4. Exercise synthetic hosted provider failures, worker interruption, consent withdrawal and reporting visibility/dedup independently; benchmark representative reporting/source scans. Real devices, accessibility and external privacy/security review remain open.
5. Keep analytics/commerce disabled until explicit founder activation. Private Beta requires integrated rehearsal and all unrelated release gates; no dashboard percentage approves a transition.

Rollback: disable the existing analytics environment flag and database collection gate; preserve domain financial/licensing sources. Keep additive migration and immutable queue evidence for forward repair; do not replay old claim/enqueue binaries after the new migration or remove privacy guards. A separately authorized migration rollback requires exact grants/function dependencies and retained consent review. No hosted rollback is executed by this task.

References: existing `docs/posthog-phase2-*`; [PostHog ingestion warnings](https://posthog.com/docs/data/ingestion-warnings); [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Official documentation was consulted; no connected project event data or configuration was read or changed.
