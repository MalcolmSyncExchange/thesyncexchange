# Phase 2 migration guard update and QA transition preparation

Prepared October 12, 2026. Local changes and read-only hosted inspection only. No hosted operation performed; this document is not execution authorization.

## Source and exact reviewed artifacts

Baseline commit: `3ecac8489d9d11fc29e440902fa0e02bd42941dc`; baseline tree `325ff9f40afb4ee3b41f880ba59b725b0599b081`. Isolated branch `codex/posthog-phase2-transition`. Historical SQL and historical hosted version mappings remain unchanged. The source candidate is not yet deployed or pushed.

Revised packs supersede the old four-row guards. Reliability SHA-256: `52c21070a6f78a42f44fabcc3701e612970c3c589dcf00493a62b5a955038278`. Reporting-index SHA-256: `773ddd5ca0f8c26201c2fb75774d5e4e14e5da51b2dce76d78ed90930cccd374`. Machine inventory: [checksums](posthog-phase2-release/execution-pack-checksums.json). No migration file changed.

## Preserved hosted baseline

Project `oppijylbkcbiqfuvckgj`; snapshot UTC `2026-10-12 18:02:55.187285+00`. Five delivered, zero pending, zero active leases. All lease-until values null. Last occurrence `2026-10-11T22:03:25.591361Z`; last delivery `2026-10-11T22:03:25.731Z`. All 34 hosted versions/names/stored SQL SHA-256 values rechecked against the unchanged mapping and matched exactly.

| Event ID | Occurrence | Delivered |
|---|---|---|
| 035e3594-c5de-4906-853a-774a19f223e9 | 2026-10-11T03:41:08.374723+00:00 | 2026-10-11T03:41:08.543+00:00 |
| 2d11b65d-4a4e-45f4-b841-62f5ba034ebf | 2026-10-10T23:08:22.819285+00:00 | 2026-10-10T23:08:22.986+00:00 |
| 56409790-bc42-447d-887b-6e274ea2ecbf | 2026-10-10T23:00:49.266737+00:00 | 2026-10-10T23:00:49.448+00:00 |
| 9f0d215b-c415-4fe5-becf-246fe66102e5 | 2026-10-10T22:52:06.564068+00:00 | 2026-10-10T22:52:06.71+00:00 |
| c8c68b8d-454d-4400-8b62-0e718a9a52f5 | 2026-10-11T22:03:25.591361+00:00 | 2026-10-11T22:03:25.731+00:00 |

[Baseline](posthog-phase2-release/outbox-baseline.json) includes event IDs, microsecond timestamps, lease fields and SHA-256 row fingerprints. Actor IDs, dedupe keys and event payloads are not exported; they are covered by the fingerprint. Fingerprints normalize timestamps to fixed UTC microseconds so session timezone differences do not create false divergence. They cover every existing outbox column, excluding only the six delivery-reliability fields introduced by the historical migration.

Both packs retain exact row count, explicit no-pending/no-active-lease checks and compare all five expected IDs/fingerprints under an ACCESS EXCLUSIVE lock. Missing or extra rows, replaced IDs, changed timestamps/payloads/cohort/actor/lease fields fail. Reliability repeats the preservation guard after DDL/data initialization and before migration-history registration. Reporting index checks the preserved legacy fields plus the precise expected initialized delivery state: delivered, attempts/cycle zero and retry/failure fields null. Unexpected state stops; nothing is reset to make the guard pass.

The unchanged SQL initializes delivered rows as delivered. This preserves delivery meaning, IDs, payloads, timestamps and history. Both packs keep BEGIN/COMMIT, local lock timeout 3s, statement timeout 30s, exact history checks, original SQL byte registration and service-role-only function boundaries. No broad migration push/history repair. Execute the complete separately approved transaction, with psql ON_ERROR_STOP=1 if applicable. Any drift requires a new read-only snapshot, renewed guard tests/checksums and founder review. Never delete an event to satisfy a count. Locks do not prevent old capture after COMMIT; external runtime containment remains mandatory.

## Active QA transition dependencies

`Authentication and Signup Testing` remains active. Its latest task is a read-only safety review of two proposed onboarding migrations at source `5f5ff73c7578b865f2257b1df25fa7a500272283`; those migrations are not integrated or applied here. Coordinate migration ordering with that workstream: either Phase 2 uses the verified 34-record history first, or any onboarding migration applied first requires regenerated Phase 2 history guards. Never bypass the divergence guard.

- Artist signup, existing artist login and onboarding inspect deployment `6acbe63df7fe4fdd3ff373d1` at attested source `79d1e01f5462fcfa91a4c4ce193abba8e8badd92`. Do not remove its URL while those checks run.
- Last verified Auth Site URL is that deployment origin; allowlist retains its `/auth/confirm?next=%2Fonboarding` and older `6acb04b41c6d687bbab9c19f` callback. These are prior verified QA records, not a fresh management-API read; re-read live settings before any future approved change.
- The staging Confirm sign up template was separately corrected to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email&amp;next=%2Fonboarding`. Preserve the subject, confirmation requirement, SMTP and all other templates/providers. Do not log links, tokens or cookies. Already consumed confirmation emails cannot be repaired or replayed by rebinding URLs.
- Original diagnostic browser helper still hardcodes `6acb04b41c6d687bbab9c19f`; newer retained private runners bind the latest preview. A future authorized transition must update each origin assertion/network allowlist/helper together, without loosening its mutation guards or reusing consumed one-use submission latches.
- Existing confirmed artist login, new signup/confirmation, cross-browser session completion and onboarding persistence are separate checks. No signup/session/email/field submission is authorized here. Reserve them for the QA owner after the transition.

Continuity sequence: finish or explicitly pause active QA; record progress and token-expiry implications privately; approve maintenance window; remove legacy execution surfaces; drain and migrate; deploy disabled candidate with a deliberately selected replacement origin; separately rebind Auth and helpers; perform authorized smoke checks; resume QA after explicit handover. If uninterrupted live QA is required, retirement is NO-GO until a separately approved disabled baseline replacement and compatible Auth/helper handover exist. Simply deploying a replacement leaves old permalinks callable.

## Disabled replacement requirements — no deployment

Target Netlify site `d8e851a6-ab37-4b0e-9403-9b2c1be65f13`, context deploy-preview. Stored ANALYTICS_ENABLED=false was verified in Step 1; re-read before build. This does not disable old artifacts. Set the approved future preview's Builds and Functions value false and attest effective configuration from the built artifact/runtime without sending events.

| Configuration | Requirement |
|---|---|
| ANALYTICS_ENABLED | false, Builds and Functions, Deploy Previews only |
| NEXT_PUBLIC_APP_URL | Exact approved replacement HTTPS origin, Builds and Functions; do not reuse an old URL |
| NEXT_PUBLIC_SUPABASE_URL | https://oppijylbkcbiqfuvckgj.supabase.co |
| Public key/service-role key | Dedicated staging bindings privately verified; privileged key Functions only |
| POSTHOG_HOST / POSTHOG_PREVIEW_TOKEN | US ingestion host; binding to project 657650 privately attested; analytics remains disabled |
| Production credentials | Absent, including production PostHog token, live Stripe and production Supabase keys |
| SYNC_EXCHANGE_PAYMENT_MODE | test |
| SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED | false |
| SYNC_EXCHANGE_BILLING_PORTAL_ENABLED | false |
| Demo mode | false; do not use demo mode as an isolation substitute |

Future URL is not allocated; exact value must be named in deployment approval. Auth Site URL and candidate callback/recovery routes must match the approved origin. Preserve safe-next, PKCE verifier requirements and existing token-hash callback behavior. Do not blanket-wildcard preview redirects. Capture/readiness evidence must distinguish dashboard storage, deployment-time variables and runtime-effective values. There is no independent immediate in-flight send kill switch; false gates future capture and delivery.

## Retirement checklist — future authorization required

Affected IDs: `6acbe63df7fe4fdd3ff373d1`, `6acb04b41c6d687bbab9c19f`, `6acafb370f93df1c14c697cd`, `6acac0fae323c88cfc577f62`, `6aca70d1b321ea3bdf777e37`, `6aca6f0796879e45a12917cc`.

1. Obtain founder approval naming site, all six IDs, permanent deletion, Developer/Team Owner operator, maintenance start/end, source/pack hashes and QA clearance. No team-wide or production change.
2. QA owner confirms no active browser submissions, confirmation links being consumed, helper runs, callbacks or workers. Record safe resume criteria; do not communicate or pause that workstream without user authorization.
3. Preserve source/deployment digests and relevant logs privately; inspect current complete deployment inventory, aliases and published/locked states. Stop on additional accessible artifacts, wrong site or lost dependency clearance.
4. After clearance, delete older completed previews first (6aca6f..., 6aca70..., 6acac0..., 6acafb..., 6acb04...) and active latest 6acbe... last. Keep the window closed throughout: alias fallback can expose another old deploy until all surfaces are gone. Recheck exact IDs/site before every deletion. Never delete the site or a production deploy.
5. Verify all six permalinks and known application/direct-function routes are inaccessible. Inspect primary/custom/branch/context aliases and remaining deployments for fallback. A generic 404 on one guessed handler path alone is not enough; require management state plus route checks and logs. If perimeter restrictions are used instead, authorized cookies/users remain able to invoke functions, so a complete QA pause is mandatory.
6. Deletion is not documented as canceling already-running functions. Confirm actual deployed streaming/synchronous maximum (currently documented 60s); wait at least maximum invocation plus 30s lease interval and margin after the last accepted request. Check invocation logs, database activity and repeated queue snapshots; extend the window for any new activity/background work. No capture/claim/retry POST probes.
7. Reverify all five IDs/fingerprints, delivery fields and 34 history records immediately before migration, under the packs' transaction lock. Stop and renew review on any drift. Keep all delivered rows; no reset, release, replay or deletion.
8. Reliability then reporting index, separately approved; read-back verification; disabled Phase 2 deployment; separately approved Auth/helper rebinding and authorization smoke tests. Keep analytics and scheduling disabled.
9. Recovery before SQL COMMIT is transactional rollback. After COMMIT preserve schema/status and fix forward with reliability-compatible code. Deleted previews cannot be restored. Recreate only an approved disabled artifact; never publish legacy claim/direct-ack code after reliability. Restart QA or analytics requires separate scope-specific approval.

Netlify references: [deletion semantics](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/), [deployment-time function variables](https://docs.netlify.com/build/functions/environment-variables/), [function execution limits](https://docs.netlify.com/build/functions/api/). These are supported behavior, not proof of a containment operation performed here.

## Local validation and decision

Final read-only refresh at 2026-10-12T18:07:01.142337Z matched all five IDs/fingerprints: five delivered, zero pending, zero leases. Analytics regression suite: 175/175 pass. Lint: zero errors, one existing React Hook Form/compiler warning. git diff --check passed. Local PGlite guard suite: 35/35 pass. Both packs accept the exact five-ID fixture baseline and reject four/six rows, changed identity, active lease, pending row, changed delivered/occurrence timestamp, payload change, migration name/checksum divergence and state drift. Transaction rollback and post-DDL corruption rejection pass; timezone independence passes. Local fixtures use artificial actors/payloads, replacing only expected fingerprint constants; exact SQL guard/DDL/transactions remain unchanged. Real hosted payloads were neither exported nor applied locally.

GO for founder review of prepared artifacts. NO-GO for hosted migration or retirement until QA clearance, containment/drainage, fresh history/queue verification and separate execution approval. The active onboarding migration workstream is an additional sequencing dependency. Nothing was pushed, deployed, retired, migrated or changed in hosted configuration.
