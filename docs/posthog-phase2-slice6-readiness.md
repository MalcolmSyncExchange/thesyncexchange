# Phase 2 Slice 6 — validation and staging readiness

Date: 2026-10-11 (America/Phoenix). Scope: PostHog Phase 2, Slices 1–5; local validation and test-only changes. This report does not authorize migration, deployment, capture, workers, real signups or payments.

## Recommendation

**GO for local development and review of a dedicated staging migration/application rollout plan, with limitations. NO-GO for activation or production release.** No critical defect or reportable security vulnerability was found in the scoped review. The follow-on migration passes local compatibility/state-machine tests. Controlled staging ingestion verification remains blocked by unverified environment/project/grant prerequisites, not by unavailable financial intelligence.

Do not use SEC preview aggregates to prove successful QA ingestion: capture flags all preview events as test and SEC excludes test rows. Do not activate to work around this. Verify controlled ingestion through specifically authorized outbox/destination evidence, or separately approve implementation of an explicit test-cohort reporting view. Broad dashboard use also needs performance work: the allowed maximum hourly report took a median 9.50 seconds to compute locally and serialized to 14.26 MB.

**Financial boundary PASS:** runtime reports remain unavailable for both test/live. A populated financial feed is not an acceptance condition for analytics infrastructure. Financial functionality remains development-only until a complete bounded ledger reader and accounting sources exist.

## Exact source and isolation

- Source branch: `codex/posthog-phase2-slice5`.
- Exact branch/ref SHA verified before creation: `5ec3cb3bb17dc866d1c2b5f0e44531eb9f621164`.
- Validation branch: `codex/posthog-phase2-slice6`.
- Worktree: `/Users/malcolmw/.codex/worktrees/posthog-phase2-slice6/The Sync Exchange.2`.
- Existing Slice 5 dependency directory copied locally; no installs, dependency version or lockfile changes.
- Original checkout and its unrelated changes were not edited, staged, committed, reset or stashed.
- No application source, API, auth rule, database migration, production/hosted setting, Stripe/Resend configuration or worker schedule changed. Only tests, test fixtures and this report are committed.
- No PostHog/Stripe/Supabase hosted calls, signups, payments, license generation, refunds, accounting implementation, push or deployment occurred. Browser tests block external requests.

## Commands and results

| Exact command | Result and evidence boundary |
| --- | --- |
| `npm run test:unit` | 621 passed, 0 failed, 0 skipped; mocks/in-memory fixtures. |
| `npm run test:analytics` | 140 passed, 0 failed, 0 skipped; overlaps unit tests and additionally runs delivery reliability. Do not sum these as independent tests. |
| `node --test --experimental-strip-types tests/phase2-slice6-validation.test.mjs` | 10 passed, 0 failed, 0 skipped; added Slice 6 boundary/state tests. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Zero errors; existing React Hook Form `watch()` / React Compiler warning at `components/forms/submit-music-form.tsx:178`. |
| `ANALYTICS_ENABLED=false npm run build` | Passed; financial/overview/funnel/marketplace/event-health routes included. Existing Next middleware deprecation remains. No dev server ran concurrently with the build. |
| `node tests/phase2-slice6-browser.mjs` | Passed: all five views, local-only requests, active nav/links, controls, provisional/unavailable labels, hover/focus/arrow values, continuous dates, 390/1280px layouts, no browser page errors. |
| `node tests/sec-intelligence-browser.mjs` | Existing browser check passed after fixture extension. |
| `node tests/sec-financial-browser.mjs` | Existing financial fixture check passed. Synthetic fixture values are not real reporting evidence. |
| `node --experimental-strip-types tests/phase2-slice6-benchmark.mjs` | Three runs per case; deterministic local aggregation only. Results below. |
| `git diff --check` | Passed. |

The full unit command does not include `analytics-reliability.test.mjs`; the separate analytics command is necessary. New Slice 6 tests deliberately have their own command, leaving package/runtime configuration unchanged. A final `npm run lint` initially rejected the new test harness variable named `module` (`@next/next/no-assign-module-variable`); renaming it to `fixtureModule` resolved that test-only lint error. Hosted verification scripts, real-auth routes, signups, checkout E2E, external ingestion and hosted load tests were **NOT TESTED** because local-only authorization excludes them. Temporary fixture routes, screenshots and build caches are not committed. Next-generated AGENTS/next-env changes are restored; temporary dev type references cleared before final typecheck.

Security skill preflight initially failed under system Python (missing `tomllib`/`tomli`); the existing bundled Python returned ready. Config was not edited. Available worker capacity is four including parent; an independent baseline, architecture review and focused migration review ran within it. The skill's six-slot suggestion was unknown and non-blocking.

## Analytics contracts and identity

**PASS WITH LIMITATIONS.** Phase 1 event names and event-version payloads remain compatible with typed Zod schemas. No production code changed. Tests cover property stripping, bounded numbers/enums/UUIDs, prohibited free-text URLs/search/email/payment data, browser purchase rejection, canonical role enforcement, stale identity rejection, explicit configuration disablement, transport privacy and stable IDs.

Browser requests derive actor from authenticated `getUser` and `public.user_profiles.role`, and require matching `expectedUserId`. Metadata cannot grant reporting or retry authority. Browser events cannot select trusted signup/submission completion, checkout creation or purchase proof. Purchase analytics checks frozen persisted signature-verified TEST evidence via a service-only RPC, not success-page/browser claims. Current evidence excludes Gate D acceptance grants and does not support production live purchase analytics.

Duplicate semantics are specific: account-scoped signup/onboarding and order-scoped verified-purchase dedupe keys; per-attempt submission/search/checkout correlation; random UUIDs for independently observed browser activities; repeated legitimate activity is not universally deduped. Unique outbox `(environment,dedupe_key)` and per-actor advisory locks prevent enqueue races. Identical observation IDs dedupe; conflicting IDs make reports insufficient evidence. Stable transport UUID is the outbox ID, reused across retries.

## Delivery reliability

**PASS WITH LIMITATIONS.** Existing transport/state-machine tests cover ingestion 2xx, network errors, TimeoutError, 429, 5xx, permanent 4xx, configuration 401/403, unknown failures; fixed safe failure categories; delays/jitter; eight attempts; retry eligibility; holds/releases; manual retries; empty/bounded batches; expired lease recovery; stale acknowledgements; role/origin denial; privacy-safe health DTOs and migration reruns.

New tests cover environment-bound hold rejection, attempt-eight interrupted claim exhausting with cleared lease, Phase 1 active-lease migration, and HTTP acceptance followed by failed DB acknowledgement. The last case sends the same UUID twice. This is **at-least-once ingestion**, not independently established exactly-once destination processing or reporting. Destination UUID dedup and event visibility must be verified separately.

A ten-row sequential batch is a bound, not a latency guarantee. Each attempt can include a 3-second claim, a 3-second HTTP request and a 3-second acknowledge/failure operation; configured deadlines can approach 90 seconds for a full batch plus overhead. Actual hosted function lifetime/latency was not tested. No automatic scheduler exists or was activated. Permanent/configuration failures need admin release after correction; released cycles can repeat beyond the eight-attempt per-cycle cap.

Admin retry health GET returns 503 while analytics configuration is disabled, even for a valid admin. This prevents using that endpoint alone for pre-activation migration inspection; separately authorized direct staging SQL/read-only inspection is required. Health/hold/release RPC and attention-list queries have no explicit request timeout, unlike delivery and SEC source queries. These are operational gaps, not demonstrated non-admin privilege crossings.

## Funnel and reporting integrity

**PASS WITH LIMITATIONS.** Local fixtures cover artist acquisition/onboarding/submission and buyer discovery/checkout, unique actors versus matched entry attempts, raw repeated events, drop-off, percentages, shortest-per-actor medians, missing steps, chronological matching despite ingestion order, late arrivals, conflicting IDs, continuous day/week/month/hour buckets, Phoenix boundaries, DST 23/25-hour days and equal-duration previous periods. Missing/truncated/failing sources retain null availability states instead of zero.

Matching uses observed occurrence order and actor with compatible track/order/submission attempt IDs. Later events advance at most one open entry attempt. Same-timestamp events cannot prove sequence; missing submission attempt IDs permit weaker actor/time joins. Discovery lacks search-to-preview correlation, so it is not causal attribution. Repeated checkout starts are raw observations; matched attempt conversion uses license-selection entry attempts, not independently linked provider checkout attempts. The contract does not claim full checkout-attempt attribution.

Reports from the local outbox are observed application activity regardless of transport status, not PostHog reporting results. Finality requires: complete appropriate environment/cohort/time query; all instrumentation verified independently; full maximum step horizon; elapsed late-arrival allowance (default 24 hours); independently verified watermark through that deadline. Failure and instrumentation gaps cannot finalize. Runtime keeps `coverageVerified=false`, starting watermark only and `lastUpdatedAt=null`; UI labels provisional and freshness not verified. Passing all schema names as instrumentation inventory proves known contracts, not deployed trigger coverage.

Required future watermark contract: environment/project/contract version, audited instrumentation/cutover interval, exact cohort exclusion policy, observed-through completeness boundary, late-arrival allowance/horizon, independent destination visibility if reporting there, verification timestamp/method, query snapshot or consistent pagination, and source failures/backfill/clock-skew handling. Latest event timestamp, HTTP 204 or PostHog HTTP 2xx cannot substitute. Source pagination uses offset rather than a consistent snapshot; concurrent late inserts can duplicate/miss page contents. Duplicate rows fail closed, but a quiet omission is not detectable from pagination alone; runtime therefore never finalizes.

## Security findings and coverage

**No reportable critical/high/medium/low security vulnerability identified in the inspected analytics scope.** This is not a whole-repository audit or proof of hosted security. Independent source review plus parent verification inspected analytics services/lib/APIs/SEC components, three analytics migrations and direct auth/env guards. Selected supporting commerce files were reviewed for relevant guard/evidence code, not as complete commerce audits. Remaining test/doc files received targeted inspection or credential-pattern search rather than exhaustive whole-file review.

Verified controls: canonical admin before privileged reads/mutations; service-only server modules and DB grants; RLS enabled with public/anon/authenticated access revoked; purchase SECURITY DEFINER has empty search path and explicit service-role guard; retry claims and interventions use configured environment; UUID and unexpired lease fences; browser body byte cap and per-user quotas; fixed host allowlist/redirect rejection/HTTP timeout; no public PostHog token variables; safe failure categories and raw-error suppression; aggregate reporting excludes actor/order/event payloads and private financial identities. Track IDs remain in admin-only track aggregates by design. No actual embedded credential found in scoped source; local token-shaped test values are fixtures.

Operational findings below are **not reported as security vulnerabilities**: only an authorized admin can reach expensive aggregate reporting; absent config/slow reporting has no established attacker privilege gain. No application remediation was performed.

The completed Codex Security artifact set is bound to original SHA `5ec3cb3...`; its source-change warning reflects new test files and Next-generated files during validation, not application-source changes. Coverage is explicitly partial relative to the root-target metadata and scoped to analytics.

[Generated security report](/Users/malcolmw/.codex/state/plugins/codex-security/scans/The-Sync-Exchange.2/5ec3cb3bb17dc866d1c2b5f0e44531eb9f621164_20261011T202149Z_eanuich1/report.md) · [Threat model](/Users/malcolmw/.codex/state/plugins/codex-security/scans/The-Sync-Exchange.2/5ec3cb3bb17dc866d1c2b5f0e44531eb9f621164_20261011T202149Z_eanuich1/threatmodel.md) · [Coverage](/Users/malcolmw/.codex/state/plugins/codex-security/scans/The-Sync-Exchange.2/5ec3cb3bb17dc866d1c2b5f0e44531eb9f621164_20261011T202149Z_eanuich1/coverage.json)

Workbench-reported usage (codex_rollout, complete thread measurement): total 6,506,648 tokens; input 6,480,115; cached input 6,240,512; output 26,533. These are reported thread accounting values, not estimated cost or a separately metered test execution charge.

## Slice 2 migration readiness

Migration reviewed: `supabase/migrations/20261011191427_analytics_delivery_reliability.sql`. **PASS WITH LIMITATIONS for local SQL compatibility and staging review; hosted installation NOT TESTED.** No SQL file changed or was applied to a hosted database.

- Adds status/attempt/cycle/retry/safe-failure fields to the existing Phase 1 outbox; retains event IDs/actor/timestamps/properties/dedupe and delivered timestamps. Existing delivered rows initialize delivered; historical pending rows become eligible but no send occurs during migration. Existing non-null state values survive rerun.
- Preserves active Phase 1 lease UUID/expiry, initializes its undelivered row as pending, and prevents reclaim until expiry. New acknowledgement rejects that old pending-state lease; after expiry a new processing lease can claim the same event. This confirms mixed-version acknowledgements need a quiescent rollout, not a claim of hot migration safety.
- Claim uses row lock / `FOR UPDATE SKIP LOCKED`; active lease fencing excludes duplicate local claims. Expired attempt-eight processing rows become exhausted. In-memory concurrency calls test local state behavior; **true independent PostgreSQL connections/lock contention remain NOT TESTED**.
- RPCs are SECURITY INVOKER with empty search path, service-role-only EXECUTE grants, and rely on existing service-only table permissions. Purchase proof remains a separately guarded definer projection. Direct anon/authenticated denial exercised locally.
- Due partial index covers environment/retry/occurrence for pending/retry/processing. Existing undelivered and actor/time indexes remain. No full delivered environment/time/id read index or aggregate-health index is demonstrated; inspect staging EXPLAIN plans before large datasets.
- Migration lacks explicit BEGIN/COMMIT and local lock/statement timeout directives. Future manual SQL execution should use an approved transactional procedure, measured lock/statement timeouts and schema/grant preflight; do not assume every SQL client wraps it atomically. Partial apply must be reconciled before new code reads it.
- Migration order: exact Phase 1 schema plus required commerce/test evidence dependencies first; quiesce capture/delivery/manual retries; then reliability migration; inspect rows/grants/state locally or in separately authorized staging; deploy compatible application with analytics still off; only then separately approved controlled events. Filename order is not a license to push all repository migrations onto a shared project.
- Rollback: disable capture/delivery and stop new/old workers before code rollback. There is no supplied down migration. Older claim logic can ignore held/retry/exhausted states, and old writers may acknowledge without updating delivery_status. Keep new schema/data, preserve IDs and audit states; design and review compatible rollback or restore procedure separately. Never replay/drop/reset queue data as an automatic rollback.

## Performance and scalability findings

Node v24.14.1; three sequential aggregation runs per case on this local machine. Fixture-only CPU/DTO measurements, not DB/network/end-to-end latency or staging SLO proof.

| Case | Rows / tracks / buckets | Median computation | Serialized aggregate bytes |
| --- | --- | --- | --- |
| Daily representative | 1,000 / 50 / 89 | 63.73 ms | 781,583 |
| Daily at caps | 10,000 / 500 / 89 | 2,625.69 ms | 1,886,915 |
| Hourly at caps | 10,000 / 500 / 2,136 | 9,495.33 ms | 14,256,936 |

Maximum-hourly interactive readiness: **FAIL against this review's provisional target of at most 2 seconds local aggregation and 2 MB serialized DTO.** This target is an assessment criterion, not a previously agreed production SLO. Daily cap also exceeds the CPU target. Small controlled daily cases are PASS WITH LIMITATIONS. Hourly maximum produces 32,040 series metric cards even though the UI chart selects one metric at a time. Large track card lists and series data increase hydration/rendering costs; browser maximal-data latency was NOT TESTED.

Query safeguards exist: 93-day total span including comparison/follow-up; 500 rows/page; 10,000-row cap; sentinel page; five-second per-page timeout; 500 tracks; up to about 2,232 hourly buckets at raw 93-day bound, reduced by UI follow-up. Exact-cap and overflow/failing-later-page cases pass. There is no whole-read deadline: 21 sequential page timeouts can approach 105 seconds before aggregation. Multiple admin reads multiply work; no concurrency limiter/cache/preaggregated projection exists. Health RPC scans multiple environment subsets without a bounded date interval. Claim's expired-exhaustion update runs before its one-row SKIP LOCKED claim and could wait on locks. Real query plans, contention, long-lived queue retention and hosted throughput were NOT TESTED.

Separate follow-up implementation should bound returned chart metrics/buckets, preaggregate or avoid repeated row/date parsing per track/bucket, introduce total read deadlines and compatible indexes/snapshot pagination, and load-test only a separately authorized local or dedicated staging instance. No optimization or infrastructure change was made here.

## Visual review

Actual screenshots of Overview, Funnels, Marketplace, Event Health and Financial Intelligence were inspected. At 390px and 1280px, no horizontal document overflow or browser page errors occurred. All four analytics navigation links and the financial link have expected destinations; current-view indication, date/comparison controls, hover/focus values and arrow traversal work. Financial native titles/accessible button labels and expandable interval details expose values; unavailable runtime fixture does not invent money.

Limitations: review used temporary unauthenticated **development-only fixture routes**, not the shipped privileged route or real Supabase sessions. Shipped guards are source/mock validated; real-admin route integration remains NOT TESTED. Loading skeleton/error boundary semantics and reset button are source checked, not induced streamed-loading/runtime-failure browser tests. OS-native financial title tooltip rendering was not independently captured; attributes/focus and original browser assertions were verified. Browser fixture traffic remained localhost only. No screenshots are committed.

Low-priority polish, left unchanged: financial/operational text links render adjacent without spacing; funnel metric identifiers are dense technical names and cause very long pages; unavailable financial bars resemble baseline zero bars until read with text/labels; financial keyboard supports native focus, not the analytics chart's arrow-key traversal. These do not falsify availability but should be addressed in separately authorized UI work.

## Financial dependencies

**PASS for guardrails; BLOCKED for populated reporting, intentionally.** Tests validate exclusion of unverified/unpaid/absent checkout evidence, duplicate payment identities, test/live separation, separate currency groups, cumulative partial/full refunds, prior-period refunds, negative cash-adjusted periods, currency/evidence conflicts, license failure distinct from capture, order mismatches, source failures and aggregate privacy.

Runtime `openReader: () => null` remains unchanged. Test/live selections both return unavailable source, not zero. Commission, artist gross/net earnings, contributor obligations and payout status remain unavailable. Rights ownership percentages and `artist_transaction_records` with `payable_earnings_calculated=false` are not payable ledgers. No accounting, transfer, refund or settlement was implemented.

Dependencies: complete bounded payment/refund/reversal reader with provider/environment/mode and historical coverage; verified economic-capture identity and order/license binding; commission/fee booking ledger; artist/contributor allocation and obligations ledger; payout/settlement status provenance. Refund-only fixture contract cannot certify dispute/reversal-adjusted revenue. Future work must preserve unavailable states until each authoritative source is reviewed. See Slice 5 source inventory for full required contracts.

## Readiness matrix

PASS means demonstrated within stated local scope. PASS WITH LIMITATIONS means local evidence passes but stated capability/provenance/performance constraints apply. BLOCKED means prerequisite absent. FAIL means tested criterion unmet. NOT TESTED means no permitted evidence was obtained.

| Subsystem | Local development | Staging migration review | Staging application code, disabled | Controlled staging execution | Production activation |
| --- | --- | --- | --- | --- | --- |
| Typed/privacy/identity contracts | PASS | PASS WITH LIMITATIONS | PASS WITH LIMITATIONS | BLOCKED: project/config/permission proof | BLOCKED |
| Durable outbox/retry/leases | PASS WITH LIMITATIONS | PASS WITH LIMITATIONS | BLOCKED until compatible migration installed | BLOCKED: migration/config/queue/ack validation | BLOCKED |
| Funnel/time/availability calculations | PASS WITH LIMITATIONS | PASS WITH LIMITATIONS | PASS WITH LIMITATIONS | BLOCKED: QA cohort not surfaced in SEC | BLOCKED |
| SEC views/controls | PASS WITH LIMITATIONS | PASS WITH LIMITATIONS | PASS WITH LIMITATIONS | BLOCKED for populated QA dashboard acceptance | BLOCKED |
| Financial unavailable boundary | PASS | PASS (no new migration) | PASS | PASS for expected-unavailable condition | PASS only for boundary, not financial activation |
| Populated financial feed/accounting | BLOCKED, expected | BLOCKED, separate scope | BLOCKED, expected | BLOCKED, not analytics acceptance gate | BLOCKED |
| Small daily aggregation | PASS WITH LIMITATIONS | NOT TESTED for hosted DB plans | PASS WITH LIMITATIONS | BLOCKED pending environment | BLOCKED |
| Maximum hourly interactive report | FAIL against stated review target | NOT TESTED for hosted plans | FAIL at configured maximum | BLOCKED pending scope/limits | BLOCKED |
| Actual hosted role/grants/concurrency | NOT TESTED | NOT TESTED | NOT TESTED | BLOCKED pending verification | BLOCKED |
| Destination visibility/dedup/watermark | NOT TESTED | NOT TESTED | NOT TESTED | BLOCKED pending proof | BLOCKED |

## Staging rollout prerequisites and production blockers

Future rollout, not performed or authorized by this report:

1. Separately approve an isolated staging Supabase project and preview app, exact schema baseline/transactional migration procedure, rollback/cutover plan and empty or explicitly inspected queue. Quiesce old/new capture and delivery; preserve delivered/history/leases.
2. Verify canonical admin, anon/artist/buyer denial and service-role DB permissions, true separate-connection claims/lease expiry/fencing, migrated row preservation and query plans. Health endpoint is unavailable with analytics disabled, so use separately approved read-only inspection.
3. Verify intended PostHog organization/project/region and privacy settings, distinct preview token ownership, production token absent, proper deployment target, app URL/Auth redirects and local/preview separation. Configure privately; no secrets in reports/Git.
4. Keep analytics off until an explicit controlled validation authorization. Limit initial local/mock acceptance and eventual staging cases to small daily datasets. Define test-traffic evidence acceptance separate from non-test SEC aggregates. Do not relabel test traffic or fabricate dashboard values.
5. For approved controlled staging ingestion, verify newly created UUID/time/environment/role/safe properties in outbox and intended destination, duplicate UUID behavior, interruption/retry state and independently observed visibility. No real signup/payment or activation is authorized here; ordinary TEST purchase evidence needs its own approved adapter/fixture test plan.
6. Verify operation timeouts/hosted function budget and monitoring; leave scheduled workers off until their independent authentication/operation design is reviewed. Define thresholds for retry age/exhaustion/holds and safe failure observability. Establish retention/queue ownership before historical retries.
7. Production remains NO-GO until separate deployment/activation approval, audited production token/project/privacy configuration, live purchase evidence support where claimed, independent destination dedup/visibility and instrumentation provenance, watermark requirements, large-report performance/remediation and migration/rollback/operational verification are complete. Populated finances remain a separate blocked subsystem, not a reason to fail the analytics contract foundation.

No production remediation, configuration change, hosted SQL, migration, deployment, push or activation occurred. Stop at this review.

## Exact committed-file manifest

- `docs/posthog-phase2-slice6-readiness.md` — complete readiness report.
- `tests/phase2-slice6-validation.test.mjs` — ten local boundary/state tests.
- `tests/phase2-slice6-browser.mjs` — all-view browser checks and local screenshots.
- `tests/phase2-slice6-benchmark.mjs` — reproducible deterministic aggregation benchmark.
- `tests/fixtures/sec-intelligence-page.tsx.fixture` — select any existing analytics view for local tests.
- `tests/fixtures/sec-financial-page.tsx.fixture` — explicit unavailable-source local test state.

No other files are staged. Canonical security artifacts are managed separately by the Codex Security plugin, outside Git. No migrations are added.
