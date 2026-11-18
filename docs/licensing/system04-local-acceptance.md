# System 04 — Rights Verification: local acceptance

Branch `codex/system04-rights-verification`, based on accepted System03 `0899704634b4cbf08d0b255191d0c8611f051981`, System02 `d34add3ebab4ff03fe877d2687ea4c085868cbdd`, System01 `b87e943f6e2d5c7245b31149107bf0cce0150ff6`, and candidate `3c5a5a1bcd0bba820776ff40032569d50d1e706f`. These are verified ancestors. Local implementation only; stop before System05 Catalog Management.

## Existing implementation and the gap

Reviewed PK03/06 `purchase-snapshots.md`, PK04 source-integration/rehearsal documentation, rights/source/delivery migrations, actual checkout/acceptance/issuance contracts, Artist submission/rights pages and SEC moderation guards. PK03 already requires independently controlled master/publishing pools, identified legal parties, reviewed private evidence, explicit scope, exact terms/consents and immutable purchase schedules. PK04 ties those schedules to the canonical approved recording and exact delivery manifest. Their safeguards and payment/finance behavior were retained.

What was missing was the Artist-to-SEC workflow around those contracts: track declarations, supporting evidence upload/access, correction requests, separate-pool review, meaningful status/history and an approved-review bridge. Legacy catalog approval and a single combined `rights_holders` total were never sufficient proof of full license-specific authority.

## Completed workflow

- `/artist/rights` lists owned records; per-track pages prepare seller/work identities and separate master/composition ownership/control. Each pool independently totals 10,000 basis points, with per-party control bounded by ownership. Writer/composer, publisher, administrator, label, distributor and representative roles are explicit. Non-owning administrators/representatives can be recorded at zero percent with documented agency authority, without inflating a pool or automatically becoming a financial payee.
- Documented owner/agent/exclusive-controller authority; distinct recording/work identifiers; permitted uses, territories, exclusions, restrictions, validity dates, maximum license duration and permitted exclusivity. Outside-performance/distribution/sample/likeness/other permissions require explicit responsibility and explanation. Conflicting declarations, incomplete control, missing mandates and expired authority block submission/approval.
- Ten evidence categories cover declarations, mandates, administration, label/publishing agreements, contributor permissions, splits, licensing permission, transfer evidence and correspondence. Uploads are private original PDFs/PNG/JPEG, bounded to3,000,000 bytes; at most20 distinct documents may underpin one review. Historical renewal documents have no lifetime twenty-file cap. Daily admission, operation and access bounds apply.
- Draft/save/resume, pending submission, clarification, corrections, rejection, approval, disputes, expiry and revocation. Changes require a fresh immutable version and human review. SEC `/admin/rights` requires canonical Admin, active session and AAL2; it shows separate pools, documentation/integrity, source/version history, missing authority and shared decision explanations. Review checklists address both pools, documents, mandates, scope, contributors, conflicts and safe document handling. No checkbox substitutes for inspecting the actual mandate.
- Approved scopes are displayed in ordinary language. Existing track pages, upload workbench and Rights Holders page link to the review workflow. Rights approval alone never publishes a track, creates an order or issues an entitlement. Existing catalog/media approval can require the modern review without fabricating a legacy combined pool. This is an integration with that approval boundary, not System05 implementation.
- Earlier PK03 licensing reviews remain explicit historical/legacy records until a new case is enrolled; no legal facts are automatically backfilled. Saving a new declaration pauses current eligibility and requires re-review. It does not rewrite an older acceptance or issued document.

## Immutable evidence and licensing integration

One new migration, number57: `supabase/migrations/20261024044101_system04_rights_verification.sql`; preceding56 files unchanged. SHA256: **edb5504de25b6f865b35dc2368031d2a8deead72819e43238fcca2fffcb78942**. Installer and accepted PK03/PK04/System03 dependencies are checked before DDL. No provider-owned Storage DDL, bucket provisioning, activation or legal/financial policy is included.

New unexposed FORCE-RLS schema `rights_private`: `cases`, `documents`, `versions`, `decisions`, `events`, `operations`, `document_reviews`. Ordinary API/service roles have no direct table or private-helper grants. Version/decision/audit/operation/evidence-link records are immutable. Document identity, version and hash cannot be rewritten after receipt. Unused, unreferenced evidence may be withdrawn; referenced proof is retained. Retention is not physical deletion.

Eleven authenticated RPCs: `rights_save`, `rights_submit`, `rights_review`, `rights_read`, `rights_list`, `rights_recover`, `rights_history`, `rights_document_reserve`, `rights_document_access`, `rights_document_withdraw`, `rights_document_restrict`. They derive canonical actors, require live sessions, enforce ownership or MFA Admin, lock/version cases and retain exact idempotency outcomes. A single service-only `rights_document_server` resolves canonical private coordinates, confirms exact objects and records authorized access/outcomes after server-side checks. All new functions have empty search paths. Large histories are paged without dropping old evidence.

A reviewed version freezes declaration/source/document hashes and server submitter/time. Approval registers the exact original objects in existing `licensing_private.evidence`; approved licensing payloads carry roles, documentation versions/hashes, reviewer/time and declaration/source identity. An offer trigger requires that exact current reviewed payload; the existing `check_offer` OID is preserved and all prior checks are called before new guards. Quote creation additionally checks duration, and offers enforce reviewed exclusivity. Existing use/territory/exclusion/date checks remain in force.

A private monotonic context epoch advances for legacy ownership/authority changes, seller/source-path changes and working-master changes. Editing and then restoring an old value cannot revive its approval. Current authority is checked through quote, acceptance, provider recovery, issuance and final delivery. A paid but legally ineligible order retains its payment/evidence and requires the existing investigation/refund process; it is never silently re-quoted or fulfilled. Original schedules, original agreements and source/asset versions remain historical evidence. Current authorization can be denied without rewriting them.

## Document security and recovery

`POST /api/rights` is same-origin, strictly shaped and body/time bounded. Legal identities are not stored in browser recovery storage; only an operation key/action is retained. A serialized authenticated recovery read determines whether the original operation committed. A second edit cannot replace unresolved evidence.

`PUT /api/rights/documents/[id]` authenticates, verifies the owned reservation and reads a bounded body before creating privilege. Content is checked independently of the filename. Bounded static images are decoded; PDF admission checks a conservative passive profile and rejects known active actions, encryption, forms, embedded content and compressed object/xref containers. No PDF interpreter, macro execution or remote content fetching is used. This is **not antivirus, PDF sanitization, signature validation or proof of legal authority**.

Uploads use canonical private paths and `upsert:false`. A failed/uncertain Storage acknowledgment is reconciled by re-reading exact bytes; no speculative overwrite or deletion occurs. Confirmed object/version/size/hash is frozen. Approval re-reads and verifies the cited originals before the database decision. Downloads recheck authorization and exact identity, hash bytes, audit outcomes and force an octet-stream attachment with no-store/nosniff/referrer protection and CSP sandbox. Buyers, other Artists, missing/revoked sessions and AAL1 Admin are denied. No privileged URL/key is exposed to a client.

Defects/edges resolved include the disconnected review-to-offer path, combined-pool catalog guard incompatibility, stale document revisions after rejection, delayed error feedback, stale-editor retries overwriting a newer declaration, edit/reversion revival, non-owning authority representation, unbounded history responses, a lifetime evidence cap, and malformed direct-RPC identifiers that could poison owned reads. Uploaded proof is never automatically verified.

## Executed local validation

Counts overlap; none constitutes formal release acceptance.

| Command / scope | Result |
| --- | --- |
| `npm run test:unit` | 1,532 PASS, zero failure/skip; all existing checkout, legal, source, delivery, accounting, Auth, onboarding, uploads and PostHog regressions retained |
| `npm run test:rights` | 35 PASS:26 SQL lifecycle/security/integration and9 actual handler/service/content tests |
| `npm run test:rights:native` with explicit Supautils SHA and MEDIA_TOOL_DIR | 40 PASS, zero failure/skip; independent-session Artist CAS/reviewer races, full paid issuance/delivery/revocation, exact grants/FORCE-RLS/installer checks, plus existing native media/provider suites |
| `npm run test:security-pr2` / `npm run test:artist-security:gate` | 300 /5 PASS |
| `npm run test:release-replay` | Clean native PostgreSQL17.11 replay of all57 exact migrations; dormant capabilities, Auth MFA/session and Artist CAS/rollback/RLS retained |
| `npm run test:rights:browser` | 10 Chromium journey groups PASS; production Next/SDK with real local SQL/RLS and synthetic loopback provider; zero browser runtime errors |
| Predecessor browser suites | System03:11; System02:9; System01:8 Chromium journey groups PASS; zero runtime errors |
| `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check` | PASS; lint zero errors/one existing React Hook Form warning at `components/forms/submit-music-form.tsx:178` |

Tests cover incomplete/overlapping ownership, legal identities, missing mandates, evidence restrictions, expiry, disputes/revocation, hostile documents, cross-account/role/MFA/session negatives, stale/concurrent changes, replay/conflicts, clarification/re-review, exact licensing scope, source changes, monotonic reversal denial, original snapshot preservation, paid issuance/delivery, refunds/disputes, audit rollback, history pagination and evidence renewal/withdrawal.

Native execution is **Darwin ARM64**, Node24.14.1, PostgreSQL17.11, using the unchanged repository-pinned FFmpeg9.0.2 tools from System03 and explicit Supautils SHA256 `ad18bd34a2f76a9b586484e35f41d591b19c07c7fbaef9ed140cc4d5e8ac94b7`. Native runner strips application credentials and accepts only its disposable Unix-socket cluster, no hosted DSN/listener. Provider fixture Auth installer read/reference grants are a declared local baseline; actual hosted grants remain unverified. No Linux AMD64 or hosted acceptance is inferred.

Ignored local evidence: original workspace `output/system04-rights-verification-2026-10-23/`, including logs, browser results/screenshots, preservation hashes, exact commit/stat, Command Center readback and integrity manifest.

## Outstanding legal and hosted acceptance

1. Founder/counsel approval of actual mandates, signature/representation standards, platform role, scope/exclusivity, contributor permissions and transfer evidence. No real legal document/template, offer, commission or payee policy was approved or seeded. Collective evidence validity is the reviewed authority window; the reviewer must ensure it does not exceed any cited mandate.
2. Privacy, sensitive-evidence retention/erasure, abandoned-byte cleanup and approved safe document handling/malware scanning before real external evidence collection. The passive admission rules and forced attachments are containment controls, not malware clearance. No document purge or physical overwrite is implemented.
3. Separately authorize an isolated57-migration rehearsal. Provision **private** `rights-evidence`, max3,000,000 bytes, PDF/PNG/JPEG only, with no authenticated/anonymous direct read/write policies. Confirm server-only service access, actual provider object versions/immutability, disabled public URLs, canonical/MFA/session and cross-account negatives, upload acknowledgment failure and hosted payload/time ceilings. Do not apply this configuration to shared environments under the current authorization.
4. Confirm existing server-only credentials/TLS, backup/recovery and audit retention/deny monitoring in that isolated target. Never log keys, URLs or full declarations. A schema rollback must retain evidence; disable the new entry points and use a reviewed forward correction rather than dropping records or regenerating historical licenses.
5. Independent security review, actual Firefox/Safari/physical-device/accessibility and legal/operator acceptance. Firefox/WebKit were unavailable locally. Formal QA remains Not Run. Native AMD64/PhaseA custody/quota/dispatch gates remain separately open; no hosted job ran.
6. Legal ownership transfers are represented by a new reviewed declaration/authority chain. Cross-account catalog reassignment is fenced and must use a separately reviewed administrative transfer process; it does not automatically disclose the old owner's private evidence.

## Command Center and completion boundary

Record System04 LOCAL COMPLETE — NOT LIVE in Engineering and Blueprint Reconciliation, with supporting Product/security/legal/QA notes. Actual legal document statuses stay Drafted/Needs Verification; all25 formal QA remain Not Run. Preserve existing53 qualification-stage records, IDs, formulas, charts and historical entries. Exact written-cell readback is retained in local output after commit.

The original dirty checkout and accepted Systems01/02/03 are preserved. Only the exact task inventory below is committed locally; generated artifacts are excluded. No push/merge/deploy, hosted migration/Storage change, commerce activation or real transaction. **System05 has not started.**

## Exact changed-file inventory

- `app/(app)/admin/rights/page.tsx`
- `app/(app)/admin/tracks/[id]/page.tsx`
- `app/(app)/artist/rights-holders/page.tsx`
- `app/(app)/artist/rights/page.tsx`
- `app/(app)/artist/tracks/[slug]/page.tsx`
- `app/api/rights/documents/[id]/route.ts`
- `app/api/rights/route.ts`
- `components/artist/rights/rights-workbench.tsx`
- `components/artist/uploads/upload-workbench.tsx`
- `docs/licensing/system04-local-acceptance.md`
- `lib/rights/contract.ts`
- `package.json`
- `scripts/test-rights-browser.mjs`
- `scripts/test-rights-native.mjs`
- `services/rights/document-content.ts`
- `services/rights/documents.ts`
- `services/rights/server.ts`
- `supabase/migrations/20261024044101_system04_rights_verification.sql`
- `tests/helpers/rights-provider-fixture.mjs`
- `tests/helpers/rights-verification-fixture.mjs`
- `tests/helpers/secure-delivery-fixture.mjs`
- `tests/pr18-pr21-reconciliation.test.mjs`
- `tests/release-candidate-replay.test.mjs`
- `tests/rights-api.test.mjs`
- `tests/rights-verification-db.test.mjs`
- `tests/rights-verification-native.test.mjs`
