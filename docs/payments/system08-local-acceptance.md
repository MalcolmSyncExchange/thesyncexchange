# System 08 — local acceptance report

**Local engineering complete; not live. Private Beta, hosted integration and commercial activation remain NO-GO. Stop before System 09.**

Branch: `codex/system08-checkout-payments`. Parent: System 07 `566979cd332b8b2cf17f6e6856cba4634450279e` (implementation `365e29b`). Security commit: `3256d126b97ebaf7fd67ab96c29d170cb7ddfb85`. Implementation commit: `b213145ef4b4a2c2f3a5834f710d513975e04fe3`.

## Reviewed and preserved

Systems 01–07, the integrated candidate lineage and PK03/04/06/07/08/09 were reviewed through their current services, migration contracts and regressions. Existing durable checkout reservations, provider idempotency/leases, exact legal acceptance, rights/source/catalog fences, immutable agreements, entitlement holds, ledger posting/reconciliation, Auth and PostHog behavior remain in place. All 60 predecessor migrations are byte-identical. The original workspace's 25 dirty tracked files and prior System worktrees are protected by before/after hashes; final preservation evidence is recorded separately.

## Implemented and corrected

- Checkout consumes the original accepted USD amount, parties and license scope; strict order-only inputs, canonical active Buyer/ownership checks, origin/body limits, payment-mode/configuration and shared rate admission precede payment. It never reprices an accepted order. Durable session binding remains in PK07, avoiding a redundant API write after session creation.
- Signed payment retention uses immutable order/session/intent/amount/currency facts before rights-sensitive fulfillment. A catalog/rights change cannot erase the authenticated payment; it still prevents invalid license issuance. Success pages, retrievals, canceled returns and uncertain API responses never authorize fulfillment.
- Buyer confirmation/history distinguish pending, expired, failed, paid, partial/full refund, dispute, hold, agreement and contractual state. Both PK07 and canonical commerce payment-evidence paths are recognized. Original checkout recovery reuses the existing provider attempt; unknown requests outside the replay window require investigation. Private order polling now uses the active ownership/MFA payment gate and no-store responses.
- Immutable refund observations preserve provider identifiers/status/timestamps/hash, including failed refunds. They do not manufacture completed refunds or ledger reversals. All dispute lifecycle events impose the existing hold, including closed/reinstated events arriving out of order. Historical agreements, accepted terms and accounting evidence remain retained; refunds are distinct from termination.
- `/admin/payments` provides bounded evidence, exact-order links, audit history and MFA-protected investigation/eligible fulfillment retry. Requests have immutable inputs, idempotent UUIDs, fenced leases and durable outcomes. Manual payment/refund status editing and unaudited regeneration entry paths are disabled. Existing finance exception/correction workflows remain separate.
- The unowned fixed-price test-charge helper is retired (410 outside production, existing production 404 retained). Shared checkout recovery validates Stripe navigation URLs. Webhook bodies are always bounded and client errors omit provider diagnostics. Buyer messages explain recovery without backend migration instructions.

Detailed contract, RPCs, state meanings and operator procedure: `docs/payments/system08-contract.md`.

## Database and infrastructure

One additive local migration: `20261024094011_system08_checkout_payments.sql` (61 total). It adds forced-RLS private `checkout_recovery.refund_observations` and `operator_requests`, owner/MFA Admin status/list RPCs, an authenticated audited operation RPC, two service-only completion/evidence RPCs, private projection/guard helpers and drift-checked dispute allowlist extensions. It rewrites no financial journal or previous migration. No hosted SQL, Storage, environment configuration, capability activation, credentials, provider transaction, push, merge or deployment was performed.

Stripe/PDFKit remain server dependencies; Stripe is explicitly externalized for server packaging. The synthetic SDK adapter is confined to test code, requires loopback and denies external HTTPS; application code exposes no transport override. Existing Auth/PostHog streams and the frozen qualification candidate are not modified.

## Verified local evidence

| Validation | Result |
| --- | --- |
| `npm run test:unit -- --test-concurrency=8` | 1,660 passed; 0 failed/skipped |
| `npm run test:payments` | 118 passed; overlaps unit suite |
| `npm run test:security-pr2` | 300 passed |
| `npm run test:artist-security:gate` | 5 passed |
| `npm run test:payments:native` | 57 passed; includes four new native concurrency/financial cases and all 53 prior native regressions |
| `npm run test:release-replay` | Clean PostgreSQL replay of 61 exact migrations; dormant switches and permissions preserved |
| Eight available browser suites | 82 Chromium scenario groups passed across all eight suites; 0 runtime exceptions |
| Typecheck / lint | Passed; lint retains one existing React Hook Form warning at `components/forms/submit-music-form.tsx:178` |
| Production build / diff check | Passed on committed implementation `b213145`; synthetic environment only; final report HEAD build recorded separately |
| Fresh `npm audit --json` | 0 critical; 3 high, 3 moderate remaining; Next/Sharp entries absent |

Native environment: Darwin ARM64, Node 24.14.1, PostgreSQL 17.11, pinned Supautils provider-authority library SHA-256 `ad18bd34a2f76a9b586484e35f41d591b19c07c7fbaef9ed140cc4d5e8ac94b7`; no database TCP listener. This is not native Linux AMD64 qualification. Browser tests use a production Next build, the actual Supabase SDK, migrated SQL/RLS and synthetic loopback Auth/Stripe/Storage. Firefox/WebKit executables are unavailable locally; their scenarios remain Not Run. Browser groups include 9 Payments, 8 Licensing, 15 Buyer, 12 Catalog, 10 Rights, 11 Uploads, 9 Artist and 8 Auth; counts are groups, not distinct human acceptance scenarios.

Evidence directory: `/Users/malcolmw/Documents/The Sync Exchange.2/output/system08-checkout-payments-2026-10-24/`. Final validation logs/summary, browser results/screenshots, dependency audits, migration/file hashes, commit stats, preservation and Command Center readback are retained there. Repaired intermediate failures remain visible: initial unit/API harnesses lacked new bounded/strict inputs and globals; the migration inventory needed its explicit new entry; early browser fixtures lacked the real RPC/SDK transport/table contracts. The substantive webhook catalog-dependence defect was corrected, with a first-payment rights-revocation regression. An optional legacy-helper cleanup was rejected by automatic approval review for an overbroad deletion range and skipped; the disabled mutation action and original unused helper definitions remain intact.

## Dependency advisory disposition

Next `16.3.5` → `16.4.1`, matching ESLint config, and direct Sharp `0.35.4` → `0.35.5` are the minimum complete compatible patch boundary. Only their native/framework dependency families changed. App Router Server Actions establish the DoS prerequisite. Image optimization is exposed, with SVG disabled; Linux/Netlify exploitability was not asserted. No application `next/og`, `ImageResponse`, `use cache` or Cache Components use was found. Independent read-only boundary/candidate reviews found no concrete remaining dependency bypass/regression; 47 focused avatar/rights/brand/config tests and harmless image-type controls passed. This is a scoped dependency review, not an independent audit of the entire checkout system. Runtime controls verify approved PNG optimization, foreign-source rejection and SVG rejection; no destructive RCE payload was executed.

Maintainer evidence: [image optimization RCE](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [ImageResponse RCE](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [typed-array cache RCE](https://github.com/advisories/GHSA-673q-mjm6-r5xr), [Server Action DoS](https://github.com/advisories/GHSA-p3m5-59mp-jv5r). Patched versions are present in the installed tree and every relevant locked platform binding. Native glibc/deployed packaging remains untested here. Remaining high entries: `brace-expansion`, `source-map-js`, `zod`; moderate: `postcss-nested`, `postcss-selector-parser`, `tailwindcss`. No unrelated dependency upgrades were made. Review/remediate these before exposure or real-money activation.

## Command Center and remaining acceptance

110 native cells updated and readback-verified. Engineering row40 records Complete — Not Live; nine Blueprint records occupy rows792–800. Existing checkout/refund/security/QA/tracker/blocker evidence is appended. All25 formal QA scenarios remain Not Run; all53 qualification-stage records, four chart IDs/titles, Founder Actions QUERY and System07 history were verified unchanged. Native validation/checkbox/wrapping metadata is preserved; Google-rendered fit was not independently observed. Evidence: `command-center-reconciliation.json`.

Hosted dependencies remain: separately authorized isolated migration/package rehearsal; dedicated provider test-account/key/webhook/API-version and endpoint-event bindings; real provider retries/outages; worker scheduling/dead-letter alert delivery; broker/private Storage/TLS and entitlement revocation validation; backup/restore and audit-retention drills; native Linux/Netlify qualification; independent security/accounting/legal approval; real-device/accessibility and formal human acceptance. Never clear holds or fabricate provider evidence to satisfy a test. Refund initiation remains an authorized manual provider/SOP operation, not an automatic app action. No live transaction or commercial license has been qualified by these simulations.

Private Beta critical path: founder authorization for System 09 → complete the remaining systems in the approved sequence → resolve dependency/legal/operational holds → separately authorize isolated hosted rehearsal → execute formal acceptance and independent reviews → explicit founder stage-transition approval. The Phase A custody/quota/budget holds and all 53 qualification records remain unchanged. Dashboard progress does not approve a release.

## Exact file inventory

49 distinct task files across the security, implementation and acceptance commits (generated local evidence, `next-env.d.ts`, CLI temp data and dependencies excluded):

- `app/(app)/admin/orders/page.tsx`
- `app/(app)/admin/payments/page.tsx`
- `app/(app)/buyer/orders/[orderId]/page.tsx`
- `app/api/checkout/route.ts`
- `app/api/create-checkout-session/route.ts`
- `app/api/orders/[orderId]/route.ts`
- `app/api/payments/route.ts`
- `app/api/webhooks/stripe/route.ts`
- `components/admin/order-status-form.tsx`
- `components/admin/retry-agreement-generation-form.tsx`
- `components/orders/license-confirmation-client.tsx`
- `components/orders/payment-panel.tsx`
- `components/orders/purchase-workspace.tsx`
- `docs/payments/system08-contract.md`
- `docs/payments/system08-local-acceptance.md`
- `next.config.mjs`
- `package-lock.json`
- `package.json`
- `scripts/test-payments-browser.mjs`
- `scripts/test-payments-native.mjs`
- `services/admin/actions.ts`
- `services/buyer/purchases.ts`
- `services/buyer/queries.ts`
- `services/orders/checkout-recovery.ts`
- `services/orders/payment-request.ts`
- `services/orders/payments.ts`
- `services/orders/refund-observations.ts`
- `services/purchase-completion/server.ts`
- `services/stripe/server.ts`
- `supabase/migrations/20261024094011_system08_checkout_payments.sql`
- `tests/admin-actions-security.test.mjs`
- `tests/analytics.test.mjs`
- `tests/buyer-purchases.test.mjs`
- `tests/checkout-recovery.test.mjs`
- `tests/checkout-webhook-recovery.test.mjs`
- `tests/founder-webhook-routing.test.mjs`
- `tests/helpers/buyer-marketplace-provider-fixture.mjs`
- `tests/helpers/payments-provider-fixture.mjs`
- `tests/helpers/payments-stripe-preload.mjs`
- `tests/payments-dependency-security.test.mjs`
- `tests/payments-system-api.test.mjs`
- `tests/payments-system-db.test.mjs`
- `tests/payments-system-native.test.mjs`
- `tests/pr18-pr21-reconciliation.test.mjs`
- `tests/production-beta-payments.test.mjs`
- `tests/purchase-analytics-retry.test.mjs`
- `tests/purchase-completion-webhook.test.mjs`
- `tests/rate-limit-security.test.mjs`
- `tests/release-candidate-replay.test.mjs`
