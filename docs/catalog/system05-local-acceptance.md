# System 05 — Catalog Management: local acceptance

Branch `codex/system05-catalog-management` starts at System04 `c1d23a41ef77e26a73514f0261aedd9a3d78239a`. Accepted Systems01–03 (`b87e943`, `d34add3`, `0899704`) and frozen candidate `3c5a5a1bcd0bba820776ff40032569d50d1e706f` remain ancestors. Local implementation only. System06 Buyer Marketplace is not started.

## Existing implementation reviewed

The accepted baseline already had canonical roles/session/MFA checks, Artist catalog/detail and owner-only preview screens, legacy metadata/atomic writes, SEC moderation/notes/audit, narrow Buyer security-invoker views, immutable media review, PK03 independent licensing authority and legal acceptance, PK04 source evidence, checkout recovery, secure delivery and accounting. These remain in place.

The missing integration was an authoritative catalog publication lifecycle: legacy `approved` also meant discoverable, metadata lacked release/identity/language/credit/tag structure, corrections lacked exact original-versus-approved versions, search loaded a coarse projection, and catalog display did not reflect current rights/source/offer eligibility. Direct quote and option reads also needed publication fencing. The new work reuses the accepted media, rights, terms and source reviews rather than creating replacement approval systems.

## Implementation and behavior

- **Structured metadata:** title, public Artist/contributor credits, description, release title/status/date/year, genre/subgenre, moods, optional BPM/key, measured duration, explicit/vocal classification, language, optional ISRC/ISWC, recording/composition identities and keywords. SQL independently validates direct RPC calls; strict Zod DTOs reject unknown/private fields. Incomplete drafts, empty pending credits and multiline descriptions are supported. Complete submissions require identified recordings, public credits and explicit classifications. ISRC/ISWC format validation is not registry verification.
- **Artist/SEC workflow:** `/artist/catalog/manage` and `/admin/catalog`, linked from existing catalog/detail/upload areas. Artists save, correct and resubmit; SEC inspects metadata, actual asset versions and rights blockers, records corrections/explanations, approves/rejects/requests changes, publishes, unpublishes, suspends, archives or explicitly reopens a restriction for fresh review. Queue filters, stable pagination, bounded history, loading/error/recovery states and responsive labelled forms are included.
- **Publication:** draft → submitted → changes requested/rejected or approved → explicitly published. Unpublished may be republished only with current unchanged approval. Suspension/archive removes approval and requires SEC reopening plus a new review. Stored publication intent and actual visibility are separate facts: a rights-expired published record immediately reports unavailable without rewriting its history.
- **Eligibility:** current approved immutable master and accepted private preview, measured duration, verified independent rights/recording identities, unchanged catalog approval and at least one valid reviewed offer/source/deliverable set. Existing independently reviewed PK03 authority may satisfy legacy rights only when no System04 case exists; combined ownership percentages alone never qualify. An enrolled System04 case cannot fall back to older reviews when disputed, revoked, missing or stale.
- **Integrity:** track lock/CAS, exact operation-key replay, recovery lookup, irreversible context generations for track/media changes, and a serialized duplicate registry. Duplicate ISRCs, same-owner recording identities and identical approved master hashes cannot become separate active records. Original Artist submissions, approved corrections, reviewer identity, explanations and audit events are immutable and paged. Retired/archived history remains intact.
- **Search foundation:** authenticated `catalog_search`, full-text GIN index derived from immutable approved metadata, all requested filters, allowlisted sorting, stable tie-breaks, explicit ordered pages/counts and empty results. Queries recheck visibility and rights at read time; there is no asynchronous index to become stale. Search returns only approved public metadata and current license IDs. Existing Buyer UI is preserved; its backend projection and direct Data API license-option reads now obey the same availability gate. Existing Artist cards/detail also use authoritative publication status, not legacy `approved` alone.
- **Purchase evidence:** quote/acceptance/issuance capture and verify the exact catalog version, decision, approved metadata/hash and context. Catalog changes cannot rebase an in-flight purchase. New quotes require explicit publication. Unissued legacy purchases without original catalog acceptance are held for reconciliation rather than backfilled. Already issued licenses preserve their original schedules, assets and delivery checks; unpublication alone does not revoke an issued license. Existing rights/source revocation, refund and dispute controls still apply.

## Database and security boundary

Migration58 `20261024060044_system05_catalog_management.sql` adds unexposed `catalog_private` cases, versions, decisions, events and operations: five FORCE-RLS tables, four immutable history tables, bounded indexes and twelve authenticated public catalog RPCs. No direct table/sequence/private-helper grant is given to API roles. All new definer routines have empty search paths and a verified postgres installer is required. Artists require canonical ownership and a live Auth session; SEC requires canonical Admin, active session and AAL2. Null scope flags fail closed. Buyer search/availability verifies canonical role and live session.

The migration preserves prior `assert_purchase`, licensing-choice and public-view helper identities. It adds catalog quote/acceptance/context triggers and a narrow restrictive Buyer SELECT policy for `track_license_options`. Narrow public views remain security-invoker; their owner-context helpers expose only the existing safe fields with publication filtering. A narrowly granted private boolean helper supports the option policy; it cannot expose another account or resource. There are no Storage DDL, Auth policy, financial ledger, capability, commercial template, deployment or infrastructure changes. All57 earlier migration files remain byte-identical. New migration SHA-256: `1ad3cc36317cd1c8f9df2e7c2ef1429f54eff2711d86cbc4507de885875aae70`.

`POST /api/catalog` is exact-origin, strictly shaped, JSON-only and bounded to50KB/5seconds body admission. Authentication and canonical roles precede RPC access. Duplicate conflicts use a safe domain code without another account/track identity; SQL/provider diagnostics are not exposed. Responses are private/no-store. Browser recovery storage contains only operation key/action, never metadata or legal parties. Repeated stale retries cannot advance a form's original revision; explicit reload is required.

## Executed validation

Final command results, source/migration hashes, local commit/stat and screenshots are recorded with this report in the ignored original-workspace evidence directory:

`output/system05-catalog-management-2026-10-23/`

| Command / scope | Result |
| --- | --- |
| `npm run test:unit` | 1,573 PASS; zero failures/skips. All prior licensing, checkout, delivery, accounting, Auth, onboarding, media and PostHog regressions retained. |
| `npm run test:catalog` | 41 PASS:31 SQL lifecycle/integration/security and10 handler/DTO/presentation tests; included in unit count. |
| `npm run test:catalog:native` | 45 PASS;5 catalog independent-session lifecycle/grant tests plus40 accepted rights/media/provider regressions. |
| `npm run test:security-pr2` / `npm run test:artist-security:gate` | 300 /5 PASS. |
| `npm run test:release-replay` | Clean native PostgreSQL17.11 replay of all58 exact migrations; dormant capability, Auth and Artist guards PASS. |
| Browser suites | Catalog12, Rights10, Uploads11, Artist9, Auth8 Chromium journey groups PASS:50 total; zero runtime errors. Firefox/WebKit unavailable. |
| `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check` | PASS. Lint zero errors/one existing React Hook Form warning at `components/forms/submit-music-form.tsx:178`. |

Native tests include real row-lock contention for competing Artist saves, competing SEC decisions and rights-revocation-versus-publication, plus paid issuance/delivery, unpublication and disputes. SQL/API/browser tests cover all metadata/filter fields, incomplete drafts, corrections, duplicate identities/identical audio, inactive sessions/MFA/null scopes, audit rollback, uncertain commits, immutable schedules, paged history, expiry, source replacement and direct Data API option/quote fencing. A privileged legacy ownership change does not implicitly transfer private review history; existing managed-media transfer protection remains intact. Artist counts/filters do not confuse old media approval with new catalog drafts or submitted reviews.

Existing synthetic purchase fixtures were advanced through authenticated catalog review; historical pre-System05 replay fixtures remain explicitly historical. Old visibility assertions now expect approved-but-unpublished records to remain hidden; positive publication is tested independently. Initial failing development runs are retained in local evidence; these final command results supersede them.

Counts overlap and are supporting automated evidence. They are not hosted validation, an independent security audit, actual legal/rightsholder acceptance, physical-device qualification or a formal release gate. Native execution is Darwin ARM64 / Node24.14.1 / PostgreSQL17.11 with the accepted explicit Supautils checksum and unchanged pinned FFmpeg9.0.2 tools; no Linux AMD64 evidence is inferred. Browser providers are loopback synthetic Auth/Storage with genuine migration SQL/RLS. No hosted DSN or application credentials are accepted by the native runner; production builds use stripped synthetic configuration.

## Hosted dependencies and operational rollout

1. Separately authorize an isolated environment and exact candidate/migration manifest. Replay58 exact migrations using the verified provider installer/ACL/extension baseline; independent SQL/RLS/security review remains required.
2. **Inventory legacy listings and open orders before any future application.** The migration does not automatically publish existing `approved` tracks. Existing rows/history are retained; catalog enrollment and explicit human approval/publication are required. Pending legacy purchases lacking original catalog assent require investigation, cancellation/refund or a newly accepted transaction, never silent rebasing. No bulk backfill or hosted reconciliation was executed.
3. Configure/verify the already planned private media/evidence/delivery Storage and broker/TLS/worker prerequisites under separate approval. Supply real approved rights, exact assets, source reviews, license terms, manifests and financial policies; synthetic fixtures provide no legal clearance or commercial authorization.
4. Qualify real PostgREST/Auth/RLS/MFA/session revocation, object authority, concurrent publication and transactions. Benchmark realistic catalog cardinality/filter plans and provider limits, configure edge/read-abuse monitoring, backups/audit retention and operational alerts. Local small-fixture search correctness is not hosted load acceptance.
5. Run actual Firefox/WebKit, physical mobile/device, screen-reader, contrast and accessibility acceptance plus independent security/legal review and the formal QA procedures. All25 formal QA scenarios remain Not Run. The53 historical qualification stage records and PhaseA custody/quota/budget holds are unchanged.
6. Rollback preparation: keep commerce held; unpublish affected records, retain all immutable rows/schedules, roll back application routing only through a separately reviewed compatible manifest, and forward-fix schema under approval. Do not drop evidence tables, edit issued schedules, regenerate fulfilled agreements or recreate approvals to force a pass.

Private Beta, real-money beta and full hosted integration remain **NO-GO** pending the existing separately authorized gates. Founder must authorize System06; stop after this package.

## Exact task file inventory

34 task files, including this report. Exact staged paths:

- `app/(app)/admin/catalog/page.tsx`
- `app/(app)/admin/tracks/[id]/page.tsx`
- `app/(app)/admin/tracks/page.tsx`
- `app/(app)/artist/catalog/manage/page.tsx`
- `app/(app)/artist/catalog/page.tsx`
- `app/(app)/artist/tracks/[slug]/page.tsx`
- `app/api/catalog/route.ts`
- `components/artist/catalog/catalog-workbench.tsx`
- `components/artist/uploads/upload-workbench.tsx`
- `docs/catalog/system05-local-acceptance.md`
- `lib/artist-track-presentation.ts`
- `lib/catalog/contract.ts`
- `package.json`
- `scripts/test-catalog-browser.mjs`
- `scripts/test-catalog-native.mjs`
- `services/artist/catalog-contract.ts`
- `services/artist/queries.ts`
- `services/buyer/queries.ts`
- `services/catalog/server.ts`
- `supabase/migrations/20261024060044_system05_catalog_management.sql`
- `tests/catalog-management-api.test.mjs`
- `tests/catalog-management-db.test.mjs`
- `tests/catalog-management-native.test.mjs`
- `tests/helpers/catalog-management-fixture.mjs`
- `tests/helpers/catalog-provider-fixture.mjs`
- `tests/helpers/immutable-source-fixture.mjs`
- `tests/helpers/purchase-legal-fixture.mjs`
- `tests/helpers/secure-delivery-fixture.mjs`
- `tests/phase-2-artist-catalog-track.test.mjs`
- `tests/pr18-pr21-reconciliation.test.mjs`
- `tests/release-candidate-replay.test.mjs`
- `tests/security-pr2-db.test.mjs`
- `tests/submission-media-postgres.test.mjs`
- `types/models.ts`
