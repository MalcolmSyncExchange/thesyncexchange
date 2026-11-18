> Historical candidate report. The four-row execution baseline is superseded by [transition preparation](posthog-phase2-transition.md); use the revised five-row pack checksums only after renewed approval.

# PostHog Phase 2 remediation release candidate

## Scope and provenance

Baseline: `codex/posthog-phase2-slice6`, full SHA `e671bd104abb4deed881a01856c90e0e7bb8fbdb`. Remediation branch: `codex/posthog-phase2-remediation`, isolated worktree `/Users/malcolmw/.codex/worktrees/posthog-phase2-remediation/The Sync Exchange.2`. Baseline was clean. Original checkout and other branches were not edited. No push, deployment, hosted setting change, migration execution, signup, payment, email or analytics event is authorized or performed.

Complete 36-file source migration inventory: [release manifest](posthog-phase2-release/migration-manifest.json). The legacy PR2 manifest remains an immutable 31-file baseline. [Hosted mapping](posthog-phase2-release/hosted-history.json) records the 34 inspected staging versions and exact stored SQL checksums; all match source. It is a dated observation, not a future guarantee.

## Reporting changes and evidence

The old implementation repeatedly parsed occurrence timestamps and scanned every row for every bucket and track. Comparison aggregates were recomputed once for each metric in each bucket. The chart serialized fifteen full metric cards per bucket, although it displayed one metric. Track detail serialized all 500 tracks.

The funnel caches timestamps and checks identity before calculating lag. The candidate parses and sorts once, uses binary lower bounds for half-open buckets, groups track rows once, computes comparison aggregates once per bucket, and requests one explicit chart metric. Summary/funnel metrics retain their definitions. Track details are sorted and paginated at 50 per page, with total/pages and navigation; no observations are removed from marketplace totals. Invalid pages reject. More than 500 tracks or 10,000 source rows still fails explicitly. Preview tests/internal actors remain excluded.

Hourly requests above seven days reject with an explanation; they are never shortened. Daily/weekly/monthly requests retain the 93-day source bound including comparison and follow-up. The chart metric is selected in the GET form and preserved across views.

Authorization and all source pages share an eight-second cancellation budget. Each DB request also has a five-second client abort. Aggregation has cooperative checks with at most two seconds reserved, within a ten-second reporting-service deadline. Exceeding the DTO budget of 2,000,000 UTF-8 bytes or deadline throws an explicit error instead of returning a complete-looking truncated report. Failed/timed-out source reads discard partial observations and return unavailable metrics. The initial page/session gate and framework rendering are outside the reporting-service timer. Synchronous JS cannot be forcibly preempted; checks reject overdue work, not a hard real-time guarantee. Hosted latency and function scheduling remain unmeasured.

Client cancellation is not proof that PostgreSQL stopped executing. No global/service-role statement timeout was changed. A scoped DB statement-timeout procedure needs approval if hosted plans show expensive execution; do not change the service-role timeout globally for analytics because checkout/webhook workflows share it. Admin health/attention requests now have five-second cancellation and attention ordering includes ID.

Reproduce locally (no environment credentials):

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --experimental-strip-types tests/phase2-remediation-benchmark.mjs --baseline
npm run test:analytics-performance
```

The baseline loader reads the exact approved Git object and removes its temporary local module in `finally`. Fixture input rows/ranges are identical between versions. The old version ignores the requested chart metric and returns all tracks; the new response is selected-metric/paginated. Compare counts separately from payload volume. Three sequential runs per case; all candidate samples must be <=2,000ms and DTO <=2,000,000 bytes. This is not DB/network/render performance evidence.

| Fixture | Before median ms / bytes | After median ms / bytes |
|---|---:|---:|
| 1,000 rows / 50 tracks / 89 daily buckets | 62.57 / 781,583 | 7.66 / 288,047 |
| 10,000 rows / 500 tracks / 89 daily buckets | 2,532.12 / 1,886,915 | 25.09 / 288,193 |
| 10,000 rows / 44 daily days with comparison | 6,837.82 / 2,704,807 | 35.35 / 436,992 |
| 10,000 rows / seven hourly days | 2,759.67 / 2,363,377 | 20.48 / 327,366 |
| 10,000 rows / seven hourly days with comparison | 14,349.00 / 3,968,907 | 33.64 / 533,408 |
| Legacy 89-day hourly request | 9,736.19 / 14,256,936 | Explicitly rejected; no truncated report |

| 10,000 unmatched checkout rows / two tracks / seven days | 5,946.51 / 1,140,271 | 235.83 / 209,367 |

[Dense baseline](posthog-phase2-release/performance-before-dense.json), [Before](posthog-phase2-release/performance-before.json), [after](posthog-phase2-release/performance-after.json). The first candidate seven-day comparison DTO failed at 2,115,968 bytes; the assertion was retained and selected-metric responses resolved it. No budget was relaxed.

All fifteen chart metrics passed the same budgets; maximum observed metric stress calculation was 351.54ms and maximum DTO was 535,508 bytes. The legacy oversized hourly request is rejected explicitly.

## Reporting index

Follow-on only: `20261011210517_analytics_reporting_index.sql`.

`analytics_outbox_reporting_time_id` indexes `(environment, occurred_at, id)` with predicate `is_test=false AND is_internal=false AND actor_role IN ('artist','buyer')`. This matches the actual service query equality/cohort predicates, half-open occurrence range and stable `ORDER BY occurred_at,id LIMIT 500`. It includes delivered evidence, unlike the old pending-only index. Payloads are not included because properties are large and not search keys. No grants, RLS policies or function authority changes are introduced.

New migration SHA-256: `0ac62cb3ebf55120d043b8166274261fab4c4013c37be273539b17cdcfee0b99`.

Delivery status/retry eligibility retain the reviewed reliability index `(environment,next_retry_at,occurred_at)` restricted to pending/retry/processing. No speculative additional retry index is added. Hosted representative query plans, index benefit, write cost and retention growth must be measured before broad use. Offset pages do not establish a consistent transaction snapshot during concurrent inserts; no coverage watermark is inferred.

Index design follows [Supabase query optimization](https://supabase.com/docs/guides/database/query-optimization); database and client timeouts are separate controls ([timeouts](https://supabase.com/docs/guides/database/postgres/timeouts)).

## Exact migration cutover plan — review only

Target exclusively `oppijylbkcbiqfuvckgj`. Reliability source SHA-256 remains `717cf8b444288c3bcaa8a581cf5bf5ccd15effeb1fff57aea01081dc5a81131e`. Historical migrations are unchanged. Current outbox: four delivered preview/test/non-internal rows, zero pending, zero active leases. Reliability fields/functions are absent. Outbox RLS enabled, no policies; table grants only postgres/service_role. Existing enqueue/claim invoker functions and guarded verified-purchase definer are service-only.

1. Obtain separate approval naming project, both exact SQL execution packs/checksums, migration role, metadata registration and operator. Stop if project identity or history differs.
2. Before SQL, disable capture AND delivery in every old accessible staging artifact, retire/block old preview access as approved, pause QA/worker activity, and verify effective runtime configuration. Stored Netlify values alone are insufficient. Wait beyond the 30-second lease and re-read the outbox. An in-flight sender can already have transmitted; wait for its claim/ack/fail deadlines as well. Require baseline four delivered/zero pending/zero active leases, not just an empty-looking dashboard.
3. Review [reliability execution SQL](posthog-phase2-release/reliability-execution.sql). It uses one transaction, local three-second lock timeout and 30-second per-statement timeout, ACCESS EXCLUSIVE outbox lock, exact 34-record version/name/SHA guard, queue guard, verbatim historical migration, and insertion of only the new canonical history record. Existing timestamp mappings are preserved. The metadata stores the exact original SQL bytes so future checksum comparisons remain meaningful. Never run both this pack and a separate migration runner that registers the same migration.
4. Execute only after approval using a direct/session-mode staging connection and approved migration role. For psql, require `-v ON_ERROR_STOP=1`; abort/ROLLBACK on any error, disconnect, preserve evidence. SQL Editor use requires the complete single-transaction SQL pack; no partial selection. Do not perform broad migration push or history repair. Do not print connection secrets.
5. Read back six new fields, constraints, due index and all new function ACLs. Public/anon/authenticated execution must remain absent; service_role must have execution. Verify invoker/empty-search-path definitions, unchanged RLS/table grants, preserved four IDs/times/delivered timestamps, status=delivered, no lease/pending changes and exact new stored checksum. Do not call claim/complete/fail to verify: those mutate state.
6. Separately approve and execute [reporting-index SQL](posthog-phase2-release/reporting-index-execution.sql). It checks the now-35-record exact history and queue baseline, applies only the follow-on index and registers version `20261011210517` in its own transaction. Failure leaves reliability installed and capture disabled; fix forward rather than undoing reliability.
7. Keep capture/delivery disabled and perform approved authorization/configuration smoke checks before event testing. New SQL version mappings are `20261011191427` / `20261011191427_analytics_delivery_reliability`, then `20261011210517` / `20261011210517_analytics_reporting_index`.

The queue lock protects the transaction but cannot prevent an old application enqueue after COMMIT. External quiescence is an entry requirement, not an inference from the lock. Unexpected rows/history/leases abort these packs; investigate and approve a revised baseline rather than deleting/replaying rows.

Old claims/acknowledgements do not understand processing/held/exhausted/retry states. Existing active old leases initialize as pending and cannot be acknowledged by the new processing-only function until safely reclaimed after expiry. Mixed-version delivery is prohibited. There is no down migration. Transaction failure rolls back schema/state/history together; committed changes require compatible fix-forward.

## Disabled staging configuration plan — no changes made

Site `d8e851a6-ab37-4b0e-9403-9b2c1be65f13`, dedicated PostHog staging. Latest completed preview `6acbe63df7fe4fdd3ff373d1`, source `79d1e01f5462fcfa91a4c4ce193abba8e8badd92`, context deploy-preview, unpublished. Candidate contains the six subsequent slices plus this remediation. No media-worker integration is assumed; that branch has conflicts in package/test/migration manifests and needs a separate reviewed integration.

Current stored Deploy Preview analytics flag is true; app URL points to old `6acac0fae323c88cfc577f62`. Current Supabase URL is correct, PostHog host is US, preview token is present, payment mode test, payment adapter false, billing portal false, demo false. No Stripe credentials/production PostHog token in inspected site inventory; no shared team vars returned. This does not attest credentials embedded during previous builds.

After separate approval, use Deploy Preview scope only:

| Variable | Exact requirement | Scope |
|---|---|---|
| ANALYTICS_ENABLED | false | Builds and Functions |
| NEXT_PUBLIC_APP_URL | Exact HTTPS origin of the approved candidate preview | Builds and Functions |
| NEXT_PUBLIC_SUPABASE_URL | https://oppijylbkcbiqfuvckgj.supabase.co | Builds and Functions |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Dedicated staging key, verify binding privately | Builds and Functions |
| SUPABASE_SERVICE_ROLE_KEY | Dedicated staging key, verify binding privately | Functions only |
| POSTHOG_HOST | https://us.i.posthog.com | Functions |
| POSTHOG_PREVIEW_TOKEN | Secret bound to project 657650; privately compare full token | Functions |
| POSTHOG_PRODUCTION_TOKEN | Absent | Every staging context |
| SYNC_EXCHANGE_PAYMENT_MODE | test | Builds and Functions |
| SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED | false | Builds and Functions |
| SYNC_EXCHANGE_BILLING_PORTAL_ENABLED | false | Builds and Functions |

Do not use the primary site URL: this site has no published production deployment. The future preview origin does not yet exist, so a final exact URL cannot honestly be asserted now. Allocate/verify that URL under deployment authorization, record it in the release approval, then bind both build and runtime plus Auth redirects. Do not reuse the old preview URL by assumption. Exclude live Stripe credentials, production Supabase credentials, production PostHog token and NEXT_PUBLIC privileged tokens. Verify effective build/runtime environment=preview, not only dashboard storage. Do not issue an analytics POST to check disablement during this remediation.

## Auth compatibility

Hosted Site URL, allowlist and email-confirmation setting could not be read: the dedicated Supabase dashboard redirected to sign-in. No login credentials were entered, and no signup was executed. These facts remain NOT VERIFIED.

Local signup/resend uses `emailRedirectTo` built for `/auth/confirm` with safe `/onboarding` next path. Hosted callback processing resolves its destination from configured NEXT_PUBLIC_APP_URL rather than blindly using request origin. Consequently a stale app URL can send confirmation/recovery completion to an older deployment and split the cookie/session flow.

Before rollout, inspect staging Site URL, redirect allowlist, confirmation-email template and confirmation-required setting. Require exact approved HTTPS candidate origin and `/auth/confirm` redirect; retain `/reset-password` recovery behavior and safe-next validation. Site URL/default email links must not point to production or an obsolete preview. Preserve existing email-confirmation requirements; do not disable confirmation to make QA convenient. Code-link exchange requires the original PKCE verifier; token-hash/type links use verifyOtp. Canonical profiles remain the authority for roles. Verify existing-account callback/login compatibility first; new signup or email sends need separate approval. Final callback compatibility is blocked until hosted settings and candidate URL are verified.

## Controlled preview event validation design

All preview captures intentionally have is_test=true. Standard SEC SQL and normalized read models exclude tests/internal actors. Do not change those predicates or fake is_test=false to populate SEC graphs.

After separate event authorization: record T0, project 657650, staging actor and event limit privately; inspect queue baseline; create only newly approved allowlisted interactions. Verify exact outbox event UUID/environment/test flags and safe properties, then match that UUID in the intended PostHog project with filters explicitly including test traffic for this QA inspection. Keep this operational evidence outside marketplace aggregates. A 204 API response or delivered_at alone is insufficient; lost acknowledgement can resend the same UUID. Do not replay delivered history. If an enduring QA report is wanted, separately review a clearly labeled admin-only test-cohort report; none is installed here. Standard preview SEC zero activity remains a cohort result, not evidence of failed delivery. No new analytics events are introduced.

## Recovery and restart

Stop on wrong destination/project, unexpected event/actor/property, live credentials/payment mode, unauthorized privileged access, history/checksum divergence, unexpected queue state, repeated acknowledgement failures/exhaustion, deadline/DTO failures or sustained function latency.

The compatible recovery release is this code line with effective ANALYTICS_ENABLED=false, retaining reliability-aware claim/complete/fail logic and the additive schema. The one configuration gate disables both enqueue and delivery; it is not an independent immediate cancellation of a send already underway. Retire old preview access and ensure no scheduler/retry invocation can keep using enabled old artifacts. Wait for in-flight deadlines and lease expiry, then inspect through approved read-only SQL because retry GET returns 503 when config is disabled. Preserve outbox records/status, event identity and incident evidence. Never clear delivered_at, reset attempts wholesale, release historical held rows, or point the queue at a replacement destination to drain it.

Before database COMMIT, transaction rollback is valid. After COMMIT, keep schema/status and deploy an approved compatible fix-forward through normal CI/release checks. Do not restore/publish an older incompatible Netlify deploy. Disabling future capture does not retract events already accepted by PostHog. Historical cleanup or destination deletion needs separate explicit approval.

Restart requires founder approval specifying release SHA, configuration/project identities, reviewed migration state, allowed new test actors/events, bounded retry scope and observation window. Require verified isolation, no active mixed-version workers, resolved incident cause and matching destination evidence before lifting disablement. Workers remain unscheduled.

## Local validation and committed file inventory

- Analytics: 154 passed (`npm run test:analytics`).
- Unit: 635 passed (`npm run test:unit`).
- Focused migration/authorization/privacy compatibility: 24 passed; full security PR2 suite: 65 passed.
- Typecheck passed; lint passed with one existing React Hook Form/compiler warning; analytics-disabled production build passed.
- Performance: all supported fixture samples and all fifteen metric choices pass unchanged budgets.
- Exact execution packs pass disposable local PostgreSQL fixtures, including checksum/queue rejection and injected post-DDL failure proving schema/data/history transaction rollback. No hosted migration executed.
- Historical SQL remains unchanged; `git diff --check` passed.

Exact task file list: [changed-files.txt](posthog-phase2-release/changed-files.txt). Original checkout changes remain untouched and excluded.

## Release gates and recommendation

GO for founder review of the local candidate. NO-GO for executing hosted rollout under the current authorization.

External gates: approve both migration packs/metadata registration; confirm quiescence; allocate correct candidate origin; set and attest disabled effective configuration; verify full staging credential/token binding; inspect Auth settings; run authorized hosted role/callback smoke checks; measure representative DB and function latency/concurrency; approve event testing separately. Financial feed remains unavailable pending a reviewed bounded ledger projection. True independent PostgreSQL concurrency and a consistent coverage watermark are not established by local PGlite.

No secrets, hosted changes, activations, events, signups, payments or schedules are part of this candidate.
