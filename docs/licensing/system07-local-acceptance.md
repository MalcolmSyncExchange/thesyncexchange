# System 07 — Licensing: local completion

2026-10-24. **Locally complete — Not Live. Private Beta / hosted integration remain NO-GO.**

Implementation commit: `365e29b5498dfb8cc7c44e281301dba7357f8b2f` on `codex/system07-licensing`. Parent: `8c3d12af98441b06b0a52875a41353c06a833fc7`. The follow-up report commit changes documentation only. Nothing was pushed, merged, deployed, activated, migrated on a hosted database or transacted with real money. Stop before System 08.

## Review and preserved foundations

Reviewed the actual PK03/PK06 purchase/party/rights/acceptance schema and services; PK04 approved-source chain; PK07 payment/recovery/issuance fencing; PK08 manifests, private delivery and historical agreement access; PK09 accepted economics/ledger/reconciliation; and Systems01–06 rights/catalog/Buyer interfaces and reports. Existing quote/consent/payment/source/catalog protections, immutable issued artifacts, recovery behavior, financial books and regression coverage were reused.

The isolated branch descends from all accepted Systems01–06 and the frozen integrated RC. All seven prior workspaces retain their original HEAD/status; the main checkout's25 dirty tracked file hashes are unchanged. Original Auth/PostHog work and the frozen `3c5a5a1bcd0bba820776ff40032569d50d1e706f` candidate were not modified.

## Completed licensing behavior

- Versioned, configurable category and fixed media/distribution/audience/campaign/exclusivity/restriction/renewal/termination scope. Cleared uses/territories remain constrained by independent rights. No commercial category, legal text or pricing was seeded.
- Deterministic exact use/territory pricing rules with explicit currency, reviewed seller-tier input, commission, discounts/override references and rounding. Quote/acceptance retain the full contract, policy, selected rule, inputs and hashes. USD is the only enabled rail; unsupported currency or missing/ambiguous rules fail closed. Synthetic fixture economics are not approved policy.
- Buyer comparison shows safe reviewed scope and **From** pricing; transaction review shows exact scope, money, specific consent statements and document version. Existing original acceptance/recovery cannot silently acquire newer terms.
- Unicode PDFs embed bundled pinned SIL OFL fonts, approved logo/watermark assets, measured wrapping, page numbers, exact legal text and complete immutable receipt. Synthetic artifacts are labeled on every page. Separate master/composition pools are retained; approved Artist credit is distinct from the legal seller. Existing fulfilled PDFs are never regenerated.
- Buyer private records, bounded Artist own-catalog summaries, and MFA SEC exact-evidence/source/issuance oversight. Artist responses exclude Buyer identity/project, private agreements, contacts and contributor allocations. Internal correction notes/references remain SEC-only.
- Append-only, actor/time/authority/revision/request-key audited lifecycle commands. Pending, issued, active, expired, terminated and revoked contracts are distinct from payment/issuance/refund/dispute states. Termination/revocation deny issuance and broker/ticket asset delivery. Original agreements remain available as historical evidence to their authenticated owner/MFA Admin. Refunds do not invent automatic contractual termination.
- Renewals/material amendments require a separately reviewed agreement and fresh assent; no renewal pricing or automatic renewal checkout was invented. New offer configuration does not copy source/delivery approval and cannot itself make the new offer purchasable.

Full field definitions, rules, bounds and operating procedure: `docs/licensing/system07-contract.md`.

## Defects corrected

1. Lossy ASCII PDF names and escaped-only Unicode appendix; replaced with actual embedded Unicode text and searchable receipts.
2. A misleading combined master-plus-publishing200% ownership total; independent pools remain distinct.
3. Artist attribution used legal seller name even when immutable approved catalog Artist credit existed.
4. Valid agreement downloads failed403 behind Next's internal URL normalization; CSRF now binds the configured public origin, with foreign origins still denied.
5. Provider-valid but revoked Buyer sessions could reach legacy legal reads/assent or agreement access; active-session checks now precede those operations/privileged delivery.
6. Existing delivery-contract creation compared the accepted rule price with today's catalog base price. It now uses verified original accepted economics/rights, while preserving legacy strict fences. A synthetic$55 purchase posts one balanced journal:5500 clearing,1100 platform fee,2640 master and1760 publishing obligations. This is licensing integration with the existing adapter, not System08 feature development.
7. Refunded/disputed evidence could appear as a fulfilled payment label. Verified adverse evidence is now visible without silently changing contractual status.
8. Pending lifecycle edits could race a form reset; busy controls and explicit accessible names now protect the workflow.

## Database/API inventory and rollout boundary

One local migration: `supabase/migrations/20261024080855_system07_licensing.sql`.
SHA-256: `7717a6626bc93196a19bd2f4a0b73d93ced4fe3cfb285eba9589da4dd5493cdb`. All59 predecessors are byte-identical; clean native replay installs60 exact migrations. No Storage bucket/policy/infrastructure changes or capability activation are included.

Adds private FORCE-RLS immutable `licensing_private.lifecycle_events`; contract validation/quote pricing/issuance/session/lifecycle helpers and triggers; safe comparison pricing/scope projection; and accepted-economics integration in the existing delivery-contract function. Existing helper OIDs and prior checks are preserved; private helpers and tables have no API/service direct execution/read grants.

New authenticated RPCs: `license_records`, `license_record`, `license_lifecycle_command`, `license_offer_contract`, `license_configure_contract`. Privileged commands require canonical Admin, active session and AAL2 inside SQL and the application. New same-origin, bounded JSON endpoint: `POST /api/licensing`. New role-gated pages: `/buyer/licenses`, `/artist/licenses`, `/admin/licenses`. Existing agreement handler now uses trusted public origin and active session; existing agreement worker awaits the Unicode renderer.

A future authorized rollout must inventory actual migration/object/grant drift, quiesce writers, apply the compatible60-migration sequence in an isolated environment, verify schema cache/RPC grants, include font/PDFKit assets in the deployment package, and execute provider/Storage/broker/TLS/max-size/negative-role acceptance. Build tracing includes the bundled fonts and brand assets. No hosted advisor, credential, Storage, migration or deployment operation was run here.

Rollback: keep admissions/commerce disabled; revert application changes only through reviewed local history and a separately authorized release. Retain the additive schema, accepted snapshots, issued files/hashes, ledger and lifecycle events. Do not delete evidence, reprice orders, regenerate fulfilled PDFs or restore closed licenses as a rollback shortcut.

## Executed validation

| Command / evidence | Result |
| --- | --- |
| `npm run test:unit -- --test-concurrency=8` | **1,633 PASS**,0 fail/skip. Includes prior checkout, finance, delivery, Auth, PostHog, onboarding, media and licensing regressions. |
| `npm run test:licensing` | **68 PASS**,0 fail/skip; overlaps unit coverage. |
| `npm run test:security-pr2` | **300 PASS**,0 fail/skip. |
| `npm run test:artist-security:gate` | **5 PASS**. |
| `npm run test:licensing:native` | **53 PASS**,0 fail/skip; genuine PG sessions, concurrency/retry effects and provider-owned private Storage hooks. |
| `npm run test:release-replay` | PASS; all60 exact migrations, real pgcrypto, disabled capabilities, native Auth/CAS/RLS checks. |
| All seven available local browser scripts | **73 Chromium groups PASS**,0 runtime exceptions:8 Licensing,15 Buyer,12 Catalog,10 Rights,11 Uploads,9 Artist,8 Auth. |
| `npm run typecheck` | PASS after adding exact RPC typings. Earlier missing-function typecheck failure is retained in validation history. |
| `npm run lint` |0 errors; one inherited React Hook Form warning at `components/forms/submit-music-form.tsx:178`. |
| `npm run build`, `git diff --check` | PASS; synthetic-only whitelisted build configuration. |
| PDF extraction + Poppler rendering |17-page synthetic artifact reviewed; Latin/Japanese/Korean/Arabic/Devanagari legal names legible, no clipping/missing glyph boxes, test labels and page numbers retained. |

Native environment: Node24.14.1, PostgreSQL17.11, Darwin ARM64. Supautils SHA-256 `ad18bd34a2f76a9b586484e35f41d591b19c07c7fbaef9ed140cc4d5e8ac94b7`; pinned local FFmpeg tools. No hosted DSN/listener or application credentials were used. Browser fixtures use genuine production Next/Supabase SDK flows and actual local migration SQL/RLS with synthetic loopback Auth/Storage; they are not hosted Supabase acceptance. Ancillary SEC dashboard analytics/audit fixture omissions are not claimed as System14 qualification.

Negative tests cover bad/missing consent, superseded/expired terms, invalid rights/source/catalog, incomplete parties, unpaid/failed/duplicate issuance, cross-account/private access, stale/revoked sessions, MFA, concurrent requests, interrupted response replay, refund/partial refund/dispute, expiry, revocation/ticket denial, immutable history and ledger conservation. Unsupported glyph/control input fails rendering rather than creating a corrupt authorized agreement. Existing recovery/fencing tests remain intact.

Test harness corrections preserve real security negatives: the old GateD synthetic payload now uses booleanfalse, not string"false"; explicitly empty sessions stay empty even though omitted Buyer sessions create legitimate synthetic sessions. No application guard was weakened. Firefox/WebKit executables were unavailable locally; their browser/device acceptance is Not Run.

## Security/legal/hosted holds

Fresh npm audit of the accepted System06 lockfile and System07 reports the same **8 affected package entries:1 critical,4 high,3 moderate**, including Next16.3.5. No existing locked package version changed and no newly affected package was introduced by PDF dependencies. These inherited advisories require separate remediation/exposure review before hosted release. Their absence was not inferred from passing tests, and the Command Center's older completed dependency disposition was reopened. This is a scoped engineering review, not independent security certification.

Actual legal text, rights mandates, commission/tier/discount policy, currency expansion, renewal/termination and assent enforceability still require founder/counsel approval. An Admin reference is an audit pointer, not legal proof. Font coverage is finite; additional scripts/emoji require reviewed fonts and actual-party rehearsal. This artifact is not PDF/UA certified or a cryptographic/rightsholder signature.

Hosted private Storage/broker/TLS/provider TEST integration, Linux AMD64 execution, maximum-size runtime acceptance, independent security/accounting review, backup/retention operations, real devices/Safari/accessibility/Buyer comprehension and formal human acceptance remain outstanding. PhaseA custody/quota/budget verification holds are unchanged; this directive did not authorize its hosted job. Existing received bytes cannot be remotely erased.

Private Beta critical path: founder-authorized Systems08–14 as applicable → inherited dependency remediation → approved real legal/commercial configuration and rights-cleared catalog → separately authorized isolated platform/hosted rehearsal → independent/formal QA → explicit founder stage approval. Local completion is not a release or commerce authorization.

## Command Center reconciliation

Verified all121 changed cells. Engineering `A39:O39`: **Complete — Not Live**, built/tested true, merged/deployed/production-verified false. Blueprint `A783:G791`:9 distinct System07 evidence records. Product/UX, Legal, Payments, Security, Risks and Master Tracker evidence were reconciled; broad commercial/legal/Buyer readiness holds were retained.

All25 formal QA statuses remain **Not Run**. All53 qualification-stage records, prior Blueprint774–782, native validations, four chart IDs/titles and Founder Actions QUERY formula were preserved. Current dependency security control is **Needs Verification / Critical** based on fresh audit evidence, with historical deployment booleans retained. Formatting/WRAP metadata was verified; Google-rendered visual fit was not independently verified. Evidence: `output/system07-licensing-2026-10-24/command-center-reconciliation.json` in the original workspace.

## Exact file inventory

The implementation commit stages only these50 files; this acceptance report is the sole follow-up documentation file. No `.env`, `node_modules`, generated PDF/PNG, output directory, unrelated change or application history publication is included.

- `app/(app)/admin/licenses/page.tsx`
- `app/(app)/artist/licenses/page.tsx`
- `app/(app)/buyer/licenses/page.tsx`
- `app/api/licensing/route.ts`
- `assets/license-fonts/NotoSans-Regular.ttf`
- `assets/license-fonts/NotoSansArabic-Regular.ttf`
- `assets/license-fonts/NotoSansCJKjp-Regular.otf`
- `assets/license-fonts/NotoSansDevanagari-Regular.ttf`
- `assets/license-fonts/OFL-CJK.txt`
- `assets/license-fonts/OFL.txt`
- `assets/license-fonts/manifest.json`
- `components/admin-v2/admin-shell.tsx`
- `components/artist/artist-workspace-shell.tsx`
- `components/catalog/license-option-card.tsx`
- `components/checkout/purchase-review.tsx`
- `components/licensing/license-workspace.tsx`
- `docs/licensing/pk08-secure-delivery-plan.md`
- `docs/licensing/purchase-snapshots.md`
- `docs/licensing/system07-contract.md`
- `lib/licenses/accepted-purchase-snapshot.ts`
- `lib/licenses/templates/sync-license-template.ts`
- `lib/licenses/templates/unicode-agreement-pdf.ts`
- `next.config.mjs`
- `package-lock.json`
- `package.json`
- `scripts/test-licensing-browser.mjs`
- `scripts/test-licensing-native.mjs`
- `services/agreements/access.ts`
- `services/agreements/server.ts`
- `services/licensing/purchases.ts`
- `services/licensing/records.ts`
- `supabase/migrations/20261024080855_system07_licensing.sql`
- `tests/agreement-download.test.mjs`
- `tests/gate-d-acceptance.test.mjs`
- `tests/generated-license.test.mjs`
- `tests/helpers/agreement-access-harness.mjs`
- `tests/helpers/artist-baseline-db.mjs`
- `tests/helpers/buyer-marketplace-provider-fixture.mjs`
- `tests/helpers/licensing-provider-fixture.mjs`
- `tests/helpers/licensing-system-fixture.mjs`
- `tests/helpers/pdf-text.mjs`
- `tests/licensing-system-api.test.mjs`
- `tests/licensing-system-db.test.mjs`
- `tests/licensing-system-native.test.mjs`
- `tests/licensing-unicode-pdf.test.mjs`
- `tests/pr18-pr21-reconciliation.test.mjs`
- `tests/purchase-legal-snapshot.test.mjs`
- `tests/release-candidate-replay.test.mjs`
- `types/database.ts`
- `types/models.ts`
- `docs/licensing/system07-local-acceptance.md` (follow-up report commit)

External local evidence includes full commands/results, exact file hashes/sizes, native and browser logs, screenshots, PDF renders, migration integrity, baseline preservation, dependency audits and Command Center readback. These synthetic artifacts remain outside Git.
