# Combined staging release candidate: PostHog Phase 2 and Artist Onboarding Reliability

Local integration, validation and documentation only, prepared October 12, 2026. No hosted read or mutation, migration, deployment, retirement, real signup/payment/email/event, worker enablement or push occurred in this task.

## Provenance and integration

Branch: `codex/staging-combined-release`. Input commits: PostHog `ddbf3cfc5458762a917e6bdd9be851e2f1aa1a8c`, onboarding `5f5ff73c7578b865f2257b1df25fa7a500272283`. Verified ancestor `79d1e01f5462fcfa91a4c4ce193abba8e8badd92`. [Source manifest](staging-combined-release/source-manifest.json) records exact input trees and guard-pack hashes. This is a local two-parent integration; both original branches and the primary checkout remain untouched.

Only package.json conflicted (two script regions). Resolution preserves the union of both unit/analytics test inventories, PostHog performance script, onboarding focused script and pinned Sharp 0.35.4. The onboarding lockfile promotes the same Sharp version to a direct dependency; npm ci succeeded without changing the lockfile. Analytics action-test harness and database type additions combined automatically and were reviewed: both analytics and onboarding RPC contracts remain present. There is no legacy persistence fallback or direct analytics acknowledgement restored.

The combined manifest and exact-inventory assertions now account for 38 files. The historical 31-file security baseline stays immutable; managed-baseline tests explicitly account for the seven known additive files. A security assertion expecting six policies was updated to nine and checks the three new policies by exact name/restrictive status; original authorization/mutation assertions remain. Browser fixture failures were investigated: ambiguous Next.js/app alert selector and incomplete mock buyer name were corrected without weakening product assertions. Visual QA also found an inner shared message claiming completion before Finish; artist-only review text now requires finishing, while buyer text/behavior is preserved.

## Migration inventory and order

[Complete 38-file inventory with exact SHA-256](posthog-phase2-release/migration-manifest.json). Every SQL byte matches an approved source commit; no historical or onboarding migration was edited.

| Order | Migration | Source SHA-256 |
|---|---|---|
| 1 | 20261011191427_analytics_delivery_reliability.sql | 717cf8b444288c3bcaa8a581cf5bf5ccd15effeb1fff57aea01081dc5a81131e |
| 2 | 20261011210517_analytics_reporting_index.sql | 0ac62cb3ebf55120d043b8166274261fab4c4013c37be273539b17cdcfee0b99 |
| 3 | 20261012173855_artist_onboarding_atomic.sql | 8cc4d1c4fbdf74a48b9685920576fbc5ab06a8d4ab225ca72bc62a56a87e80a2 |
| 4 | 20261012173856_staging_avatar_storage_readiness.sql | a3c216f8aada2c8eec140ac08e7fdc24a24df46401ba0d3d2179692d52eb669d |

Historical hosted mappings remain the unchanged 34-record [mapping](posthog-phase2-release/hosted-history.json). Reliability pack expects 34 records, reporting pack 35. Their unchanged reviewed hashes are in [pack inventory](posthog-phase2-release/execution-pack-checksums.json). Apply them first if their fresh verification still matches. Onboarding then extends the ledger to 37/38 records; exact provider execution versions and original SQL checksums require reviewed registration/receipts, not assumed filename equivalence. Use one registration mechanism per migration; never register twice or repair historical versions by inference. No broad db push. Execution approval must name exact project, source/files/hashes, operator and history mechanism.

The previous five-delivered-row [outbox guard snapshot](posthog-phase2-release/outbox-baseline.json) is preserved, not refreshed during this local-only task. Recheck exact IDs, payload/timestamp fingerprints, no pending rows/leases and history immediately before any operation. Any drift stops execution and requires renewed review; no deletion/reset to make the guard pass. Reliability repeats preservation checks after initialization and before commit. New fields intentionally initialize delivered status/zero attempts/cycle without changing original payload/timestamps/identities.

Atomic onboarding and Storage SQL already include their own transactions. Do not add an outer transaction that causes nested BEGIN/COMMIT semantics. A separately reviewed executor must set bounded lock/statement timeouts in the transaction/session and attest the effective values. Preserve the existing PostHog pack 3s lock/30s statement limits; onboarding's prior reviewed recommendation is 5s/60s. Recheck managed Storage ownership/policy delegation and no name/config/data drift. The app requires all RPCs/schema before deployment and deliberately fails closed without them.

## Local database compatibility and security

PGlite replay starts from all 34 historical mappings and synthetic existing Auth users/identities, canonical/artist profiles, onboarding payloads and five delivered observations. It applies both exact packs (substituting only artificial payload fingerprint constants) then the two unchanged onboarding files. Assertions compare all preserved row JSON, canonical roles and saved payloads; new reliability status is checked separately. It validates service-only invoker RPCs, blocked direct state/reference forgery, restrictive raw avatar uploads, and post-DDL drift rollback. Fault injection in each of four transactions leaves prior committed schema/data intact; correct retry succeeds without replaying events. Hosted private payloads were not exported.

The native rehearsal uses the pinned, already-cached Supabase PostgreSQL image, non-superuser postgres, real supautils delegated policy permissions and Storage owner, with no network, published ports, host volumes or credentials. All four source migrations apply in order, preserve synthetic identities/profiles/outbox data, retain ownership/RLS and reject unauthorized RPC/avatar writes. Late failures roll back for each file. Historical fresh/resume checks still pass. This is PostgreSQL 17.6 against previously observed hosted 17.11, not the full Auth/Storage HTTP platform or exact current hosted trigger clone; actual blob serving/quota/cleanup remain separately gated. PGlite/native local SQL is not hosted migration execution.

Canonical role checks, finance isolation, avatar byte decoding/size/pixel/MIME checks, rendered-version CAS, required-field validation, stage sequencing, optional clearing and atomic rollback pass. Unit/security tests cover checkout trusted pricing/ownership, webhook signature/idempotency, agreements/storage authorization and buyer/admin boundaries. No new security blocker was identified in tested surfaces; this is scoped regression evidence, not an exhaustive certification. Existing logo-asset availability and post-completion editing remain declared follow-ups; no brand asset was fabricated.

## Analytics and performance

Event schema/caller contracts, dedupe, lease state machine, bounded retries and authorized admin retry behavior remain intact. Disabled configuration returns before enqueue or delivery. Tests cover unavailable financial feeds, preview/internal exclusions, provisional coverage, pagination, deadline/payload failure and lost-ack compatibility. Financial commission/payout metrics remain unavailable without authoritative ledger coverage; no synthetic activity is silently included in SEC marketplace totals.

[Reproducible benchmark results](staging-combined-release/performance.json): seven-day hourly median 20.82ms/327,366 bytes; comparison 33.97ms/533,408 bytes; dense checkout median 234.38ms/209,367 bytes. All supported fixture samples and all fifteen selectable metrics pass <=2,000ms and <=2,000,000 bytes; maximum metric DTO 535,508 bytes. The old 89-day hourly range rejects explicitly rather than truncating. Ten-second reporting-service deadline and query cancellation remain enforced; cooperative JS cancellation does not guarantee hard preemption, and client abort does not prove PostgreSQL execution stopped. Hosted DB/function/network/render latency and concurrency remain unmeasured.

## Browser interaction and responsive evidence

Local demo server receives an explicit credential-free environment, ANALYTICS_ENABLED=false and disabled payments. Browser contexts deny all non-local origins. Actual demo onboarding tests reject missing/native invalid fields, save basics, refresh/resume saved stage, clamp future navigation and render all five stages at 375/768/1440px. Review has one form/two destinations and never claims saved completion prematurely. No /api/analytics request occurs. SEC pure-fixture UI tests cover keyboard chart inspection, requested metric refresh, 50-track pages, test-event exclusion, unavailable source, oversized-range rejection and unavailable financial evidence. Unauthenticated/buyer demo sessions cannot enter admin reporting. Fixture route is guarded, temporary, removed in finally and absent from the production build.

These tests use real components and local demo cookies plus pure SEC fixtures. They do not attest hosted canonical-role login, production RPC HTTP transport, signup/email callbacks, real uploads, Stripe checkout or PostHog ingestion. Those require separately authorized smoke tests. Screenshots remain local QA artifacts outside Git.

## Exact final validation results

| Command | Result |
|---|---|
| npm run test:unit | 689 passed, 0 failed/skipped |
| npm run test:analytics | 175 passed, 0 failed/skipped |
| npm run test:artist-onboarding | 51 passed, 0 failed/skipped |
| npm run test:security-pr2 | 65 passed, 0 failed/skipped |
| npm run test:combined-migrations | 50 passed, 0 failed/skipped |
| npm run test:storage-ownership | 3 native PostgreSQL rehearsals passed |
| npm run test:combined-browser | 7 passed; 375/768/1440px, all five artist stages |
| npm run test:analytics-performance | all supported fixtures/metric choices pass unchanged budgets |
| npm run typecheck | PASS |
| npm run lint | PASS, 0 errors and one existing React Hook Form/compiler warning |
| Analytics-disabled npm run build | PASS; temporary fixture absent from production routes |
| git diff --check and staged diff check | PASS |

[Validation receipts and local log checksums](staging-combined-release/validation.json). The browser fixture initially left a stale .next/dev/types reference after route removal; the dedicated runner now cleans only its owned fixture/type cache in finally. Fresh typecheck/build pass. No test assertion or budget was removed to make these results pass.

Exact committed task file inventory: [changed-files.txt](staging-combined-release/changed-files.txt).

## Future release configuration — not applied

[Exact contract](staging-combined-release/configuration.json). Target site d8e851a6-ab37-4b0e-9403-9b2c1be65f13, deploy-preview; Supabase oppijylbkcbiqfuvckgj; PostHog 657650 and US ingestion. ANALYTICS_ENABLED=false in Builds/Functions; correct dedicated stage key bindings privately attested; privileged key/token Functions only. Correct exact candidate HTTPS origin in NEXT_PUBLIC_APP_URL and Auth, confirmation-required behavior and token-hash callback preserved, no wildcard redirects or production credentials. Payment mode test, adapter/billing portal false; verify database purchase capabilities also remain disabled. No scheduled worker. Demo mode false in staging. Local mock/demo test flags must not appear in staging.

The replacement URL is unallocated. Founder approval must name its exact origin and deploy context. Stored variables are not effective-runtime evidence; old artifacts retain deployment-time values. A build result here is not Netlify source-to-artifact provenance. Require future source SHA/tree/lockfile, compiled artifact hashes, provider deploy metadata and runtime binding evidence.

## Coordinated release and QA handover checklist

1. Founder reviews the combined commit, manifest/test evidence, exact migration executor/registration, operator and maintenance window. No operation implied by local GO.
2. Auth/signup workstream explicitly clears a pause of signup/login/onboarding/profile/avatar writes, email send/resend and confirmation consumption, callback/browser diagnostics, analytics/retry tests and external invocations. Finish or record saved progress; an idle chat is not clearance. Do not send coordination messages without user authorization.
3. Verify a recoverable staging backup/restore point, retention, recovery permissions and restore procedure before changes. Preserve required schema/ACL/trigger/storage definitions, sanitized data fingerprints and source artifacts. Do not assume PITR/backup exists or export secrets/private records into logs.
4. Approve retirement of six legacy IDs: 6acbe63df7fe4fdd3ff373d1, 6acb04b41c6d687bbab9c19f, 6acafb370f93df1c14c697cd, 6acac0fae323c88cfc577f62, 6aca70d1b321ea3bdf777e37, 6aca6f0796879e45a12917cc. Latest supports signup/onboarding/confirmation; older 6acb04... remains in a helper/allowlist. Preserve evidence, clear every dependency, inspect full current inventory and aliases before deleting anything. Delete older surfaces before latest, keeping QA paused throughout alias fallback. Never delete the site or production deployment.
5. Verify permalinks, ordinary and known direct-function routes inaccessible, and context/primary/custom/branch aliases have no enabled fallback. Retiring a deploy is permanent and does not prove in-flight cancellation. Drain past actual max invocation plus lease duration/margin; inspect logs and repeated quiet DB snapshots. Additional surfaces/background work reset the gate.
6. Fresh exact history/outbox/profile/Auth/artist baseline verification, then separately approved migrations 1–4 with per-file stop/read-back checks. Preserve all IDs/data/grants/owners/RLS. If only a prefix commits, keep all writes/analytics paused; fix forward after review.
7. Separately deploy the exact combined candidate disabled. Attest artifact/runtime staging identities, payment isolation, new RPC/index/Storage prerequisites and reporting budgets before event activation.
8. Separately authorize Auth Site URL/allowlist and diagnostic-helper origin/allowlist rebinding. Preserve corrected token-hash Confirm sign up template, SMTP/subject/confirmation policy and recovery behavior. Consumed emails/latches cannot be reused. Re-read current settings before modifying only named fields.
9. Resume QA only after approved authorization/callback smoke checks and source handover. Reload old forms for the rendered version field. New signup/session/email/avatar/onboarding submissions and payments each need appropriate separate scope. Keep analytics false during initial controlled onboarding QA.
10. Analytics activation requires later founder authorization specifying actors/events/limit, destination project and observation window. Preview events stay test-marked and excluded from standard SEC; destination UUID visibility is a separate operational check. No historical replay or scheduled delivery activation.

## Recovery and remaining gates

Keep this combined reliability-compatible code and schema with capture/delivery disabled. Preserve delivered states, attempts, IDs, payloads and incident evidence. Never restore legacy claim/direct-ack code after reliability, reopen unchecked onboarding persistence, reset attempts/delivered timestamps, or delete avatar data to undo DDL. Transaction errors roll back only the current transaction; prior committed files remain. Prefer compatible fix-forward with writes paused. Removing onboarding guards reopens the original weakness and is not a safe restart. Bucket removal/object cleanup requires separate Storage API authorization, never direct SQL deletion. Any full restore needs reviewed recovery authorization and assessment of records saved since the backup. Restart requires explicit founder approval after cause/compatibility/isolation verification.

GO for founder review of the validated local combined candidate. NO-GO for hosted operations until backup, QA clearance, complete containment/drainage, fresh guards/executor, correct origin/Auth/helper handover, runtime credential/payment attestation and authorized hosted performance/Storage smoke gates are satisfied. No hosted readiness claim is inferred from these local tests.
