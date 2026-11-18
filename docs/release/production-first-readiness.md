# Production-first deployment preparation — 2026-10-24

Status: LOCAL PREPARATION COMPLETE; production execution requires the founder's final approval. Full media-to-delivery testing is not yet ready. No deployment, hosted migration, configuration change, real transaction, new infrastructure or Git push occurred.

The founder canceled separate Alpha Netlify/Supabase provisioning and the Google Cloud billing request. Preserve existing resources and billing. The old Phase A custody/quota program is not a prerequisite for publishing this website.

## Exact target and source

| Item | Verified value |
|---|---|
| Accepted 14-system source, preserved unchanged | `bbfcfa32f5b3e798b911354fa21e05616c59bccd` |
| Local preparation branch | `codex/production-first-readiness` |
| Production Netlify site | `e5bcc3bc-fb1d-4e46-b302-a95cc3ed70a5`, `cozy-kitsune-7ea8b4` |
| Domain | `https://thesyncexchange.com` |
| Production Supabase | `sgpubcpldfxcuhjjdcau`, organization `mrusvpfrejtelzxovdjv`, us-east-2 |
| Production database | PostgreSQL 17.6.1.104, UTC |
| Current rollback deployment | `6ac9982e947c950008b72816`, ready and locked |
| Current production Git source | `2d56691e0b3acc1655c83a3624c861929ec2c4d6`, `main`, October 10 |
| Existing build settings | `npm run build`, publish `.next`, Functions `netlify/functions`, Ubuntu Noble 24.04 |

Production visibility is already Public; password protection applies to nonproduction deploys. Anonymous HTTP requests to `/`, `/login`, `/signup` return 200; `/admin` redirects to login. The current application reports `production_beta`, matching test secret/publishable key modes, `livePaymentsEnabled=false`, maintenance off, no missing operational keys. This is evidence about the old deployment, not acceptance of the successor. Secret values were not retrieved.

Production has three confirmed Auth accounts: one Artist, one Buyer, one Admin. There are zero tracks, orders, generated licenses, rightsholders and purchase entitlements. One public avatar object exists. These accounts and that object must be preserved. No real customer or transaction absence is inferred merely from the founder's statement.

## Database review and exact impact

The original 67 source migrations remain byte-for-byte unchanged. There are now 68 source files: one additional forward correction, `20261025000001_production_upgrade_reconciliation.sql`.

Production's ledger has 11 entries, several with different timestamps from the source files. Foundation objects also exist without corresponding source-named ledger rows. Consequently, neither replaying all files nor applying an assumed 56-file suffix is valid.

The prepared sequence has **37 migration transactions plus one separate managed Storage policy/trigger checkpoint**. Retain 31 existing/superseded foundation source files; do not replay them or fabricate historical ledger entries. Each proposed transaction records its exact original SQL and version in the existing migration ledger atomically. The modeled final ledger is 48 rows: the original 11 plus 37 new rows. The Storage checkpoint is separately logged, not represented as a fictitious source migration.

The upgrade adds 102 application tables to the captured 32, producing 134 application tables, and extends existing contracts. The modeled final comparison contains 1,216 columns, 433 function definitions/effective API-role execute contracts, 811 constraints, 171 application/Storage guard triggers and 182 policies. All compared contracts match a clean replay of the successor, with **zero differences**. `table-impact.csv` lists each table and every added column on an existing table. No original source migration was rewritten.

The additional forward correction:

- Accepts only one of two exact SHA-256 function bodies for `gate_d_prepare_checkout(uuid,uuid,bigint,text)`; unknown drift fails the transaction.
- Replaces the captured legacy function's two `public.digest` calls with `extensions.digest`. The resulting body must match the reviewed clean-target hash. Gate D remains dormant.
- Removes excess direct service-role EXECUTE on `get_own_artist_finance()` and the staging-validation trigger function. Authenticated owner finance and automatic trigger execution are preserved.
- Enables no capability and rewrites no purchase, license, accounting or catalog evidence.

The sequence installs Auth/session guards, private source/rights/legal/catalog/finance/SEC/analytics/email models, checkout recovery and delivery controls. Those controls change behavior of existing accounts: Admin privileged actions require current MFA; expired/revoked sessions lose access; direct artist avatar writes are restricted to the validated server workflow. The existing avatar is retained. Staging-specific legacy QA routines remain target-bound and unarmed; they are not a production test bypass.

A disposable native PostgreSQL 17.11 model was reconstructed from the current production columns, defaults/generated expressions, enums, constraints, indexes, views, policies, function definitions/grants and application triggers. It used non-superuser `postgres`, unrelated provider owners and the real locally compiled Supautils extension. Exact prepared execution files passed, preserving three synthetic profiles and one avatar record; commerce remained off. A second independent clean replay passed all 68 files.

Limitations: provider Auth/Storage tables are stubs; provider-owned Storage trigger implementations are not cloned; production row payloads/passwords were not copied. This is an SQL upgrade rehearsal, not a restored production backup or hosted acceptance. Production's registered provider grants, non-superuser installer, Storage owner isolation and UTC were inspected separately. The read-only production preflight also passed all 72 captured function pins and inventory/capability checks.

Artifacts are local-only under `/Users/malcolmw/Documents/The Sync Exchange.2/output/production-first-readiness-2026-10-24/`:

- `execution-manifest.json`: exact target, ordered SQL files and source/execution checksums.
- `migration-review.csv`: individual disposition and SHA-256 for all 68 files.
- `table-impact.csv`: table/column impact.
- `read-only-preflight.sql`: captured-state and function-hash fence, no writes.
- `upgrade-rehearsal.json`, `upgrade-contract-differences.json`, `upgraded-contracts.json`, `clean-target-contracts.json`: actual rehearsal evidence.
- `production-config-observation.json`, `production-inventory.json`, `public-http.json`: production observations.

Do not apply these files before approval. Re-run the read-only preflight immediately before execution; stop and reconcile if any inventory, definition, ledger or capability changed. Execute one transaction at a time, recording its result and checksum. After interruption, compare committed ledger statements and actual definitions; resume only the remaining verified transactions. Never blindly restart the entire sequence.

## Backup and recovery

Seven production daily physical database backups are visible; the latest inspected is October 24 at 08:13:39 UTC. No restore was performed. Supabase explicitly excludes Storage object contents from these backups.

The one existing avatar was copied locally without changing Storage: 51,414 bytes, SHA-256 `1e6412ed8a6c28b59a40c12e8350698408ce01b75850fbcc73c23c39b99a9c77`. Its version/path/size were rechecked unchanged after the copy. The local backup directory is mode 0700 and its files mode 0600; it is not committed or uploaded. Do not describe this filesystem permission control as encryption. Metadata sufficient to restore its original path is in `local-backup/avatar-object-metadata.json`.

Before the approved cutover, freeze mutations with `SYNC_EXCHANGE_MAINTENANCE_MODE=cutover`, record the exact available provider restore point and verify the three accounts, avatar copy and prior deploy remain available. Review whether any data changed after that restore point; if so, capture a current logical recovery copy using an approved private channel before SQL. Do not put Auth password hashes, session tokens, database passwords or service keys in this report, Git, build logs or the Command Center. Provider backup availability is verified; a fresh logical export and a hosted restore drill have not occurred.

Rollback first disables adapters/workers and holds application mutations in cutover mode. Preserve immutable transaction evidence and the new schema; use a reviewed forward fix. The prior deploy can restore the earlier public pages, but cannot be assumed compatible with tightened database policies for active workspace writes. Keep those mutations blocked until checked. A destructive database restore requires a new explicit founder decision and an agreed recovery point; it is not implicitly authorized by deploying this candidate. No down migration or object deletion is proposed.

## Local production-test compatibility fix

The accepted candidate already supports explicit production TEST classification, but its newer purchase adapter and financial ingestion services categorically rejected the production target. `SYNC_EXCHANGE_PRODUCTION_TEST_ENABLED=true` now permits those TEST-only services to pass their deployment-target gate only when mode is explicitly test and both key types are recognized test keys. Missing/malformed opt-in, missing keys, live mode and mixed/live keys fail closed. Build validation rejects the same invalid configurations. This flag does not enable adapters, database capabilities, financial endpoints or workers. Existing provider signature/account/amount/currency checks, noncommercial classification, rights/acceptance snapshots, issuance fences, queues and immutable accounting remain intact.

Node is pinned locally to 24.14.1. Production's old server function uses Node22; the approved new deployment should select `nodejs24.x` and verify the resulting function metadata. Netlify documents runtime selection via the build Node version or Functions-scoped `AWS_LAMBDA_JS_RUNTIME` ([runtime documentation](https://docs.netlify.com/build/functions/configuration/?fn-language=js)). No Stripe SDK/API upgrade is included.

## Proposed first public-testing configuration

Only after final approval, on the existing site, set or verify the following production-context values. These are proposed values, not applied changes.

| Variable/control | Proposed value or handling |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://thesyncexchange.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://sgpubcpldfxcuhjjdcau.supabase.co` |
| Supabase public/service credentials | Existing production project; service key secret-marked, Functions only; no copying staging credentials |
| `SYNC_EXCHANGE_PAYMENT_MODE` | `test` |
| `SYNC_EXCHANGE_PRODUCTION_TEST_ENABLED` | `true`, server only, Builds/Functions |
| Stripe secret/publishable/webhook credentials | Existing matching TEST account only; exact endpoint/account must be checked before enabling purchases |
| `SYNC_EXCHANGE_DEMO_MODE` | `false` |
| `SYNC_EXCHANGE_BILLING_PORTAL_ENABLED` | `false` |
| `SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED` | `false` for first publication |
| `SYNC_EXCHANGE_FINANCIAL_INGESTION_ENABLED` / `SYNC_EXCHANGE_FINANCIAL_WORKER_ENABLED` | `false` for first publication |
| Commerce/media/finance database capabilities | Retain all default OFF holds; no activation SQL included |
| `ANALYTICS_ENABLED` | `false`; later production/test partition and consent verification before PostHog transport |
| `TSE_EMAIL_DELIVERY_ENABLED` | `false`; existing Supabase SMTP remains independently configured |
| Delivery broker URL | Leave unset until the actual production broker is bound and validated |
| `NODE_VERSION` / `AWS_LAMBDA_JS_RUNTIME` | `24.14.1` / `nodejs24.x` |
| Build log visibility | Change Public to private/team-only before a new build |
| Netlify team billing / auto-recharge / site/domain/repository | Preserve; no new site, project, plan, Cloud service or Git push |

Keep real payouts, commercial rights and live commerce unavailable. The first publication exposes the integrated application and authenticated workspaces for founder testing, not a claim that all 14 hosted workflows are accepted. Upload processing, complete synthetic licensing/checkout/delivery, financial posting, PostHog delivery and transactional notices must not be marked working while their prerequisites remain off.

## Production prerequisites for the complete workflow

| Surface | Verified now | Necessary next action |
|---|---|---|
| Auth | Production SiteURL and nine existing redirects include `/auth/email-action`; TOTP enabled, maximum10 factors; custom Resend SMTP on465 | Install/review System13 TokenHash templates from `supabase/templates/system13/manifest.json`; test confirmation/recovery on founder-controlled accounts after approval; enroll existing Admin MFA. Current template source was only partially visible, so exact deployed template equality remains unverified. |
| Account authorization | One canonical Admin; no new role assigned; source retains role/session/MFA gates | Founder verifies the intended Admin account and founder governance binding; no convenience role promotion or MFA bypass. |
| Storage | Seven existing buckets; no submission or rights-evidence buckets; real provider policy authority inspected | A subsequent full-workflow scope must name four private buckets: submission-source250,000,000 bytes, submission-artwork10,000,000, submission-derived bounded outputs, rights-evidence3,000,000. Review MIME allowlists against actual uploader/resumable worker behavior; global ceiling must support source size. The first publication does not create these buckets or change the global ceiling. Do not change existing bucket privacy/limits or delete contents. Actual global ceiling and hosted byte/RLS behavior remain unverified. |
| Media | Native local synthetic validation/processing/recovery passes | `services/media-broker/common.mjs` and database/runtime binding explicitly reject the production ref and require the old security-stage GCP identities. No accessible production worker is verified. Implement and test an explicit production binding for an actual chosen runtime before enabling uploads. Never simply remove the guard. |
| Large delivery | Existing revocable ticket/broker code and local transfer/security tests pass | Bind `services/delivery/broker.mjs` to the real production app origin, private credentials, TLS and private bounded scratch; test expiry/revocation/large transfer. Netlify web functions alone do not establish this runtime. |
| Purchases/finance | Test/live classification, verified evidence, snapshots, idempotency and accounting pass locally | Verify exact Stripe TEST account and webhook; register private endpoint fingerprint/worker configuration; approve synthetic asset designations and synthetic legal/economic policy; enable only explicitly approved TEST capabilities, then exercise full flow. No real contracts, royalties or payout obligations are authorized. |
| Worker operations | Authenticated bounded finance/email endpoints and admin recovery exist | Start with deliberate bounded operator runs; verify queues, retry/lease/dead-letter visibility before scheduling. No scheduler or alert delivery is claimed installed. |
| Analytics/email | Integrated UI, source/outbox/privacy models and local tests pass; Supabase SMTP already exists | Keep outbound application transports off initially; later approve scoped credentials, test-user partition, consent and founder-controlled recipients. Do not create a new provider account. |

Google Cloud was a proposed host for the native media worker and authenticated broker; it is **not required to host the website**. The dependency is a suitable native compute runtime and secure broker, not a particular cloud vendor. No new runtime or account is assumed available. Publishing first with these capabilities held avoids new infrastructure and preserves the actual remaining product limitation visibly. Full media-to-delivery testing cannot be declared ready from a Netlify deploy alone.

## Exact deployment sequence proposed for final approval

1. Pin the local successor commit and `execution-manifest.json` checksum; verify the accepted base is its ancestor and the original67 migration hashes are unchanged. Do not push the integrated source/history to the existing public GitHub repository or merge main.
2. On the existing site only, make build logs private, preserve current deploy/config metadata, set the proposed test-only configuration and temporary cutover maintenance hold. Enforce the backup checkpoint above before SQL. No billing or additional infrastructure changes.
3. Re-run the read-only preflight against `sgpubcpldfxcuhjjdcau`; execute the 38 reviewed steps in exact order, as the verified installer, recording the original11 ledger rows unchanged. On drift/failure, stop; do not relax grants, RLS, hash fences or constraints to continue.
4. Verify the final source contracts, zero real transactions, unchanged existing accounts/avatar, all capability holds, private table access, canonical role/session checks and Admin MFA requirement. Do not seed commercial catalog or enable workers.
5. Build the pinned source for the existing production site with Node24 and the real production context. Use the existing Netlify CLI/API controlled manual build/deploy path; do not serve `.next` as a static-only upload or publish the local synthetic-key validation build. Verify actual Next adapter, Functions runtime, site identity and absence of secret-scan findings before publication. Manual publication must account for the site's currently locked deploy. No repository connection or production-branch change.
6. Publish only that verified artifact, restore maintenance off and retain the rollback deploy. Test anonymous public pages, Artist/Buyer login/onboarding, wrong-role and anonymous SEC denial, active Admin MFA, privacy and unavailable-capability messages. Founder can begin hands-on website testing immediately at this point.
7. Address actual defects on the isolated successor branch. Complete the named media/broker binding and targeted production configuration under an explicit expanded scope before enabling the full synthetic transaction chain. Perform no live transactions, payouts or real licensing. Hosted QA results must be recorded individually; keep untouched formal scenarios Not Run.

This is a conditional GO recommendation for the restricted first publication after founder approval and the backup/configuration checkpoints. It is a NO-GO for declaring all14 systems hosted-accepted, for a complete media/checkout/delivery rehearsal until the named runtime gaps close, and for real-money/Private Beta stage approval.

## Local validation and remaining risks

- Complete unit suite: **1,916 passed, zero failed/skipped**; includes seven new regression scenarios for production TEST configuration, finance admission/worker behavior and upgrade drift.
- Native integration: **93 passed, zero failed/skipped**, disposable PostgreSQL/Supautils and synthetic media; Darwin ARM64, Node24.14.1, PG17.11. This is not native Linux AMD64 evidence.
- Existing security suite: **300 passed**; Artist security gates: **5 passed**.
- Independent native clean replay: **68 exact files passed**; captured production upgrade: **37 exact execution transactions + Storage checkpoint passed**,48 ledger rows, zero compared contract differences.
- Typecheck, lint and optimized build passed. Lint retains one existing React Hook Form compiler warning. The initial build failed because Turbopack rejected an external node_modules symlink; it passed after an isolated dependency copy. Initial sandboxed tests could not open a local broker listener or inspect processes; permitted local reruns passed. `npm run test:security` is unavailable; the actual command was `npm run test:security-pr2`.
- An additional production-context optimized build passed using only deliberately invalid synthetic credentials, explicit test mode and the actual site identity. It is a local validation artifact and must never be published. Its initial cleared PATH omitted `lsof`; restoring the system utility paths satisfied the existing build guard.
- The first security run correctly rejected an unlisted new migration; its explicit allowlist and clean-replay ordering assertions were updated for the one reviewed forward correction and the suite reran successfully.
- Existing Phase15A browser evidence remains129 Chromium journey groups/13 systems plus2 chart suites on the accepted base. It was not rerun or relabeled as hosted acceptance in this preparation; no application UI changed.
- The inherited UTC-dependent source-hash serialization risk P15A-R01 remains open. Production is UTC; keep workflow sessions UTC and do not rewrite accepted snapshots to work around a changed hash.
- Existing production advisors include six authenticated and four anon executable-definer warnings, one mutable-search-path warning,12 default-deny private-table notices and leaked-password protection disabled. New-schema local guards were tested, but hosted advisor disposition must be rechecked after the approved upgrade. Do not broadly revoke required scoped RPCs or disable policies merely to clear a dashboard.
- No hosted payment, upload, delivery, email send, PostHog capture, restore drill or formal human acceptance was executed. All25 formal QA scenarios and53 historical qualification stage records retain their actual prior statuses. Dashboard percentages do not authorize release.

## Changed-file inventory

`.env.example`; `.node-version`; `lib/server-env.ts`; `scripts/validate-env.mjs`; `services/finance/ingestion.ts`; `package.json`; `supabase/migrations/20261025000001_production_upgrade_reconciliation.sql`; `tests/deployment-target.test.mjs`; `tests/production-test-execution.test.mjs`; `tests/production-upgrade-drift.test.mjs`; `tests/pr18-pr21-reconciliation.test.mjs`; `tests/release-candidate-replay.test.mjs`; this document. No API route, client-side credential handling, original migration, accepted-base checkout, unrelated Auth/PostHog workstream or shared branch was modified. Generated `next-env.d.ts` changes from local Next validation are excluded from the patch.
