# System 09 — local acceptance report

Status: **locally complete — not live**. Implementation commit `66cb50d8a172798de64e7f119d3ec3492dce90fc` on `codex/system09-secure-delivery`, descended from System 08 `745f9f7c4b7cc6c0740f18e513b2e8218395ce82`. Stop before System 10. No push, merge, deployment, hosted migration/Storage modification, commerce activation or real transaction occurred.

## Reviewed and preserved

PK08 private Storage, immutable license manifests, Buyer entitlements, 60-second single-use broker tickets, exact source/version/hash checks, existing agreement access, refund/dispute restrictions, entitlement activation and audit were already implemented. PK03/04/06/07 and Systems 01–08 remain in the candidate lineage. Historical agreements retain their existing Buyer-owner/Admin-MFA policy after refund or contractual closure. Asset delivery remains subject to current rights, original acceptance, verified payment, exact manifest, restrictions and closure; no source substitution or license regeneration occurs on retry.

## Implemented and corrected

- Reproduced the expired-session authorization defect before editing: an expired `auth.sessions.not_after` still verified and authorized a download. Fixed verification, begin, ticket creation, redemption, finalization and stream checks. Native and SQL negative tests now deny it; valid active-session controls pass.
- Required the configured public application origin at the shared delivery boundary, including reverse-proxy deployments. Forged request-URL/Origin pairs and missing configured origin fail before authentication or Storage. Private project HTTP is permitted only for loopback synthetic tests.
- Added incremental SHA-256 disk spooling up to **250,000,000 bytes**, with 0700/0600 permissions and normal/error/cancel cleanup. All bytes are verified before publication. Transport chunks stay at most 64 KiB; authority checkpoints occur at most every 1 MiB or one second, after checkpoint reads and before the final chunk, within the original hard expiry.
- Added immutable started/terminal transfer evidence separately from existing preparation outcomes. `stream_exhausted` reports server stream exhaustion, never confirmed receipt by a Buyer. Interrupted or stale workflows require a fresh authorized request for the original file.
- Added Buyer history, availability reasons, progress, cancellation, error guidance and fresh retries. Missing original objects remain visible as unavailable rather than disappearing or resolving to replacement assets.
- Added `/admin/delivery` and private `/api/delivery` for active MFA Admin investigation and bounded pagination. Audited idempotent actions record review, close expired attempts or restrict access; none can restore a hold, grant an entitlement or acquire privileged Storage credentials.
- Focused independent candidate review found excessive per-64KiB authority RPCs and direct-RPC NULL pagination. Both were corrected. A deterministic 250 MB/10 ms authority-latency test verifies the new checkpoint budget; direct NULL pagination is denied. The focused review is not an independent hosted security acceptance.

## Database and Storage

Only migration `20261024105306_system09_secure_delivery.sql` is added, after **61 unchanged predecessors**. It adds FORCE RLS, append-only `commerce_private.delivery_transfer_events` and `delivery_operator_events`; safe `delivery_order_status`, `delivery_operations`, `delivery_admin_action` RPCs; service-only `check_asset_transfer`/`record_asset_transfer`; and drift-checked session guards on existing lifecycle RPCs while preserving their OIDs/grants. The original private Storage policies and infrastructure are unchanged. No capability or historical backfill is enabled. Rollback disables delivery/stops the broker while preserving immutable evidence.

## Final validation

| Command / scope | Result |
| --- | --- |
| `npm run test:unit -- --test-concurrency=8` | 1,687 pass; zero failures/skips |
| `npm run test:delivery` | 89 pass; overlaps unit coverage |
| `npm run test:security-pr2` | 300 pass |
| `npm run test:artist-security:gate` | 5 pass |
| `npm run test:release-replay` | 62 exact migrations replay; dormant flags, Auth and permission checks pass |
| `npm run test:delivery:native` | 61 pass; includes all 57 prior native regressions plus 4 delivery cases |
| Nine System 01–09 browser suites | 90 Chromium groups pass; zero runtime exceptions |
| `npm run typecheck`, `npm run lint` | Pass; one inherited React Hook Form warning at `components/forms/submit-music-form.tsx:178` |
| Production builds / `git diff --check` | Pass; final actual-HEAD build recorded in `build-final-head.json` |

Native evidence: Darwin ARM64, Node 24.14.1, PostgreSQL 17.11; disposable Unix-socket-only clusters, real pgcrypto and checksum-pinned Supautils provider-owned Storage authority. This does not qualify native Linux AMD64 or hosted Storage. Firefox/WebKit executables were unavailable and were not run.

Browser coverage: Delivery8, Payments9, Licensing8, Buyer15, Catalog12, Rights10, Uploads11, Artist9, Auth8. The Buyer harness uses Chromium's documented synthetic audio output with **real decoding/timeline assertions**. A standalone synthetic WAV reproduced the Mac output stall without the app; synthetic output advanced normally. Physical audio-device acceptance remains open. The Uploads harness uses a real keyboard checkbox action after a smooth-scroll viewport instability; no force-click, DOM state injection or application bypass was introduced. Source: [Chromium audio switches](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/base/media_switches.cc).

Earlier failures are retained in the evidence directory: initial broker fixture lacked the new expiry/RPC contract; fixture rights/offer setup correctly failed existing guards; two assertions needed case/realm normalization and a provider-ID correction; mandatory origin required two legacy test adapters to supply their configured origin; exact migration inventory/tail assertions needed migration62; one strict browser locator matched a textarea and retained history; the Buyer hardware-output stall and Uploads scroll instability were diagnosed and corrected in test infrastructure. Final success does not erase those runs.

## Security outcome and limitations

**Fixed**: expired-session delivery authorization. The minimal shared lifecycle guard retains owner binding, canonical role, paid entitlement, legal/source/rights, refund/dispute, closure, rate and single-use checks. Active sessions and permitted original downloads remain functional. Configured-origin and non-TLS credential boundaries are covered by negative and legitimate loopback/proxy controls. No known critical local delivery defect remains in the exercised scope; this is not a repository-wide vulnerability clearance. The six inherited dependency advisory entries remain unresolved and the lockfile is unchanged.

A committed revocation denies subsequent checkpoints; already transmitted bytes cannot be recalled. The 20-second source-read and 60-second total authorization limits require representative hosted throughput qualification. Browser Blob buffering is bounded by the 250 MB ceiling and still needs real-device memory testing. ZIPs or multiple stems must be individually approved manifest entries; no arbitrary ZIP assembly occurs.

Required before any separately authorized hosted acceptance: private Storage/ownership/version tests; TLS and fixed-origin broker configuration; least-privilege secrets; encrypted ephemeral spool capacity and crash-remnant cleanup/retention; process restart and interrupted transfer drills; maximum-file/stem throughput and backpressure; native Linux AMD64; independent security review; Safari/Firefox/physical device, audio and accessibility acceptance. No hosted cleanup service is installed here. Preserve the Phase A recipient custody/quota/budget holds. See `system09-contract.md` for the precise authority, transfer and rollback contract.

## Command Center and release state

Native in-place reconciliation: **99 cells verified by readback**, Engineering row41 and Blueprint rows801–809, plus scoped evidence notes in Payments, Security, QA, Master and Risks. All25 formal QA remain **Not Run**; all53 qualification stage records, prior System08 Blueprint history, Founder QUERY and four charts are unchanged. Dropdown validation and new-row wrapping are preserved. Google-rendered fit was not independently inspected; API structure/format checks passed.

Local implementation and automated validation are complete. Hosted integration, independent review and formal acceptance remain unexecuted. **Private Beta remains NO-GO. System 10 is not started.** Founder authorization is required to proceed.

## Exact task inventory

35 implementation/contract files in `66cb50d`, plus this acceptance report (36 total). `implementation-staged-files.json`, `implementation-git-show-stat.txt` and `file-inventory.json` record exact paths and hashes. Generated `.next`, `next-env.d.ts`, node_modules, temporary spools, screenshots and test output are excluded from commits.

- `app/(app)/admin/delivery/page.tsx`
- `app/(app)/admin/orders/page.tsx`
- `app/api/delivery/route.ts`
- `components/admin/order-delivery-audit.tsx`
- `components/orders/asset-download-button.tsx`
- `components/orders/delivery-panel.tsx`
- `components/orders/licensed-assets.tsx`
- `components/orders/purchase-workspace.tsx`
- `docs/delivery/system09-contract.md`
- `package.json`
- `scripts/test-buyer-marketplace-browser.mjs`
- `scripts/test-delivery-browser.mjs`
- `scripts/test-delivery-native.mjs`
- `scripts/test-music-uploads-browser.mjs`
- `services/delivery/broker.mjs`
- `services/delivery/operations.ts`
- `services/delivery/server.ts`
- `services/delivery/stream.d.mts`
- `services/delivery/stream.mjs`
- `services/delivery/transfer.d.mts`
- `services/delivery/transfer.mjs`
- `supabase/migrations/20261024105306_system09_secure_delivery.sql`
- `tests/delivery-system-api.test.mjs`
- `tests/delivery-system-db.test.mjs`
- `tests/delivery-system-native.test.mjs`
- `tests/delivery-system-transfer.test.mjs`
- `tests/financial-ledger.test.mjs`
- `tests/helpers/buyer-marketplace-provider-fixture.mjs`
- `tests/helpers/delivery-provider-fixture.mjs`
- `tests/helpers/secure-delivery-fixture.mjs`
- `tests/immutable-source-integration.test.mjs`
- `tests/pr18-pr21-reconciliation.test.mjs`
- `tests/release-candidate-replay.test.mjs`
- `tests/secure-delivery-broker.test.mjs`
- `tests/secure-delivery-transfer.test.mjs`
- `docs/delivery/system09-local-acceptance.md`
