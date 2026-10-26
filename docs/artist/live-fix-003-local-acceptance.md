# Live Fix #003 — local implementation and acceptance evidence

Status: local application implementation validated; **production fix not deployed**. This report does not mark hosted upload/processing or formal QA complete. The production prerequisite manifest is `docs/artist/live-fix-003-production-manifest.md`.

## Verified root cause

Production `sgpubcpldfxcuhjjdcau` has installed media RPCs, canonical Artist authorization and its immutable object guard. Its media read/reservation/worker/activation capabilities are all false and `submission-source`, `submission-artwork`, `submission-derived` are absent. The initial list request therefore fails closed before a user can create a draft. This is not evidence of an expired Artist session or missing role.

The provider's global upload limit is 50 MB with the spend cap retained. The founder explicitly selected initial 50 MB audio uploads. The new interface, API admission and SQL reservation function enforce that ceiling; artwork remains 10 MB. Content validation and rights/catalog approval remain independent requirements.

Two application defects also contributed to the experience: the legacy entry screen required another draft-start click, and metadata saving required an already worker-validated master. The new workspace opens immediately, creates no draft on GET, and saves incomplete metadata independently of worker completion.

## Implementation inventory

| Files | Change |
| --- | --- |
| `app/(app)/artist/submit/page.tsx`, `app/(app)/artist/uploads/page.tsx` | Existing canonical Artist server gate; direct workspace with authenticated account identity and draft/track context. |
| `components/artist/uploads/submission-workspace.tsx` | Seven sections, lazy idempotent draft creation, autosave/explicit save, queued mutations, uncertain-response recovery, stale-edit preservation, desktop/mobile and keyboard section focus. |
| `lib/media/submission-draft.ts` | Strict bounded private draft schema, partial-save/completeness separation, safe availability/error messages and semantic JSONB recovery comparison. |
| `lib/media/upload-contract.ts` | Optional smaller audio limit while preserving the original 250 MB validation default for existing foundation callers. |
| `components/artist/uploads/upload-workbench.tsx` | Embedding, flush-before-mutation, original file handoff, readiness/availability and 50 MB props; existing TUS resume, immutable versioning and review fencing retained. |
| `components/artist/uploads/submission-draft-list.tsx`, `components/artist/artist-dashboard.tsx`, `app/(app)/artist/catalog/page.tsx` | Owner-scoped saved drafts with file counts and separate audio/catalog review status. |
| `app/api/media/route.ts`, `services/media/uploads.ts` | Four strict workspace actions, bounded 48 KB request envelope, existing origin/identity guards, safe disabled/missing-migration errors, 50 MB reservation admission. No new privileged client. |
| `supabase/migrations/20261026021846_artist_submission_workspace.sql` | Two private columns; bounded transactional CAS/idempotency/recovery; trusted catalog seed; four new RPCs and three existing function replacements. No automatic activation or hosted changes. |
| `tests/artist-submission-workspace.test.mjs` | Partial saves, JSONB comparison, 50 MB boundary, malformed claims, CAS, idempotency, audit rollback, account isolation, gates and synthetic THE SEC lifecycle. |
| `tests/artist-submission-workspace-native.test.mjs`, `scripts/test-submission-workspace-native.mjs` | Separate real PostgreSQL connections: concurrent CAS winner, lost-response recovery, owner isolation and exact full migration replay with explicit verified provider installer authority. |
| `tests/music-uploads-api.test.mjs`, `tests/helpers/music-uploads-provider-fixture.mjs`, `tests/pr18-pr21-reconciliation.test.mjs` | Workspace/API/limit coverage, synthetic provider support and explicit additive migration inventory. |
| `scripts/preview-submission-workspace.mjs` | Loopback-only synthetic development/production preview, worker disabled, deterministic interrupted transfer and lost-response controls; inherited credentials excluded. |
| `package.json` | Includes workspace tests in full inventory and adds focused/native commands. No dependency or lockfile change. |
| `docs/artist/live-fix-003-*.md`, `docs/artist/live-fix-003-upload-activation.sql` | Evidence, exact production proposal and gated activation SQL, not executed. |

## Browser evidence

Chrome profile `thesyncexchange.com`, actual production build, synthetic loopback provider and real migration SQL/RLS fixture:

- Direct entry with seven sections and zero read-created drafts.
- Incomplete title/Artist saved, autosaved and restored after refresh; StrictMode refresh behavior verified.
- Lost response after committed save recovered by original operation lookup, without assuming failure or substituting a new transaction. JSONB key ordering does not trigger another save.
- 6,720,044-byte synthetic sine-wave master interrupted after one 6 MiB PATCH, refreshed and resumed with the same fingerprint/reservation. Exactly two PATCH requests total and one reservation.
- Synthetic artwork upload and manual pause/resume of a stem; all received files remain uploaded/queued while workers are off.
- Stale second editor cannot overwrite the saved first-editor revision; explicit reload restores the winner.
- Final 50,000,001-byte synthetic file rejected with zero reservations and zero transferred bytes; a permitted WAV then succeeds.
- Built application returns saved draft and accurate file count in My Catalog.
- Section action places focus on its heading. Mobile 390×844 has no horizontal overflow; all seven section buttons are 48 pixels high. Final built session reports zero browser console errors.

The synthetic full SQL lifecycle reaches a pending THE SEC audio review, creates a catalog draft with credits/release/language, and creates no rights approvals or licenses. This is not a hosted worker/decoder result. No production draft or audio object was created during this investigation.

## Validation record

Detailed command logs and browser screenshots live outside Git at:

`/Users/malcolmw/Documents/The Sync Exchange.2/output/live-fix-003-2026-10-25/`

- `npm run test:submission-workspace`: **43 passed**, including 12 workspace cases and existing upload/API/transfer regressions.
- `npm run test:submission-workspace:native`: **2 passed**, PostgreSQL 17.11 / Darwin ARM64 / Node 24.14.1, all **69 exact local migration files** replayed. Verified Supautils source commit `df32bd65e4d13212bf812ee966a51132d034bc17`; locally compiled library SHA-256 `186dbcbdb664b58e946063bccd8971fe1df9c87e7a4421e527f00de4a046ad62`. This is not native Linux qualification.
- `npm run test:security-pr2`: **300 passed**; `npm run test:artist-security:gate`: **5 passed**.
- `npm run typecheck`: PASS. `npm run lint`: zero errors; one inherited React Hook Form compiler warning in `components/forms/submit-music-form.tsx`.
- `npm run build`: PASS with safe synthetic fixture credentials; final 50 MB production build also exercised in Chrome. Existing middleware deprecation notice retained.
- `git diff --check`: PASS.
- `npm run test:storage-ownership`: **blocked by unavailable local Docker daemon** (three infrastructure startup failures). No policy/application assertion reached; not a passing Storage result. Native provider-shaped PostgreSQL tests and existing SQL/transfer/API regressions are separate evidence.
- Complete final `package.json` unit inventory, `node --test --test-concurrency=2 --experimental-strip-types <all test:unit files>`: **1,944 passed, zero failed/skipped**, 350.172 seconds. Log: `unit-final-bounded.log`. Bounded concurrency prevents CPU starvation of wall-clock diagnostic fixtures; no test was excluded.
- Initial full-suite runs each had one environmental failure: the build guard correctly detected this task's still-running preview; after stopping it the guard's 11 tests passed. A later full run passed 1,941/1,942 with one timing-sensitive Auth diagnostic fixture failing under concurrent CPU load; its focused 24-test file then passed. Logs are retained; these failures were not hidden or counted as acceptance successes.

## Security and remaining limits

Canonical roles, active sessions, owner-only RPCs, empty search paths, private tables and existing MFA Admin read paths remain enforced. Client ownership, private locators, approval status and financial allocations are not accepted as draft fields. Private draft payloads are not written to browser persistence; only account-bound recovery operation identifiers are retained. Existing preview byte integrity/postflight checks, no-overwrite reservations, rights checks, purchase evidence and license delivery paths remain unchanged.

The new catalog bridge seeds a new case only; it does not replace an independently edited case. Rights notes/preferences are private preparation data, never proof of rights or active license offers. Duration comes from validated audio rather than Artist claims. Full source decoding, broker deployment, hosted TUS authorization, real account cross-access tests, browser/device acceptance and THE SEC hosted lifecycle remain pending their respective authorizations and prerequisites.

Existing admission quotas remain four unfinished assets and twenty uploaded reservations per Artist per day. With workers off, received files can consume that unfinished quota; do not bypass it to imply unrestricted production submission availability.

No source push, shared branch merge, deployment, production SQL, bucket/policy change, capability activation, credential change, spend-cap change or real transaction occurred. Auth/PostHog working trees remain separate. Production remains at the homepage-motion commit and deployment identified in the manifest. Keep every existing disabled capability and registration restriction intact.
