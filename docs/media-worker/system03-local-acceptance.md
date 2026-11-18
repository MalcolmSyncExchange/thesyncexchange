# System 03 — Music Uploads: local acceptance

Baseline: System 02 `d34add3ebab4ff03fe877d2687ea4c085868cbdd`, System 01 `b87e943f6e2d5c7245b31149107bf0cce0150ff6`, descending from frozen candidate `3c5a5a1bcd0bba820776ff40032569d50d1e706f`. Isolated branch: `codex/system03-music-uploads`. Local DoD complete; hosted and formal acceptance remain open. Stop before System 04.

## Reviewed, retained and completed

The existing immutable submission-media schema/RPCs, content validator, job leases/retries, worker/broker, pinned codecs, waveform/preview generation, canonical catalog moderation and PK04/PK08 purchase/delivery protections were reused. The baseline Artist form had a legacy upload interface without an integrated interface for those media contracts, extra deliverable roles, resumable transfer or processing recovery. Legacy metadata/rights/pricing editing and legacy upload endpoints remain compatibility surfaces; this package does not claim to have requalified every legacy ingestion path.

The default `/artist/submit` and resumable `/artist/uploads` now provide master, instrumental, clean, alternate, individually labeled stems, supporting audio and artwork slots; drag/drop, selection, byte progress, pause/resume, cancel, retries, retained replacement history, processing state, missing-file indicators, private waveform/playback, explicit preview/artwork acceptance, measured metadata and human-review submission. Artist track details/editing link to the exact owned media draft. `/admin/media` is MFA-protected, read-only SEC processing/integrity review linked from the canonical track review page.

Audio limits reuse the existing validated profile: WAV/AIFF/AIFF-C PCM or FLAC, 250,000,000 bytes, mono/stereo, 8–192 kHz and 1 second–15 minutes. Artwork: static JPEG/PNG/WebP, 10,000,000 bytes and existing image bounds. MP3, ZIP archives and arbitrary supporting documents are outside this source profile. Extension/size checks are preliminary only; workers fully decode and verify content before readiness. Every additional audio role uses the existing source validator, not a new parser. Uploaded files are candidates; their role does not itself approve a licensed deliverable or add them to every purchased manifest.

Authenticated TUS uses 6 MiB chunks, no upsert, same-origin validated upload locations, bounded backoff, authoritative HEAD offsets and full-file chunk fingerprints for reselected files. Tokens are refreshed from the signed-in session and never persisted by the transfer engine. Persisted transport metadata contains the object identity/location/fingerprint, with no credentials. Reserved uploads expire after 24 hours. Lost mutation responses retain the exact idempotency command; new edits cannot replace unresolved commands. Lost draft-creation responses reuse the creation key. Completed bytes are confirmed server-side against the exact object owner/version/size before a single validation job is queued.

Fixed local defects include duplicate empty drafts after uncertain creation, recovery records overwritten by later edits, fake zero-duration catalog creation, incorrect UUID versus slug navigation, excessive rate-limit consumption by non-admission actions, and an attempted approved-track write while requesting replacement review. Approved catalog records remain unchanged while a candidate awaits review. New media processing does not clear rights, publish catalog inventory, issue licenses or change finance; an Admin approval without the existing rights requirements still fails.

## Database and authorization

One additive migration, number 56: `supabase/migrations/20261024035806_system03_music_uploads.sql`; SHA-256 `ed1072090339c99d02c8cf9e6c1627a5510731d529c678f58f512d8f07d2d099`. The preceding 55 migration files are unchanged. Requires System 01, System 02 and the existing submission-media/PK04 chain in order. This migration changes no provider-owned Storage DDL, bucket configuration, environment switches or hosted data.

New private FORCE-RLS table `submission_media.upload_files` binds immutable role/label/asset identities to existing submissions/assets, enforces one active role/label slot, preserves retired versions and rejects historical rewrites/deletes. Existing operation/event constraints gain narrow upload actions. Replacements allocate new object paths and identities. Removal retires an unsubmitted draft authorization and retains objects/audit evidence; referenced current/accepted/purchased/pending-review assets cannot be removed.

Eleven authenticated, empty-search-path RPCs: `media_upload_reserve`, `media_upload_destination`, `media_upload_confirm`, `media_upload_remove`, `media_upload_read`, `media_upload_admin_read`, `media_upload_list`, `media_upload_save_metadata`, `media_upload_submit`, `media_upload_can_play`, `media_upload_find`. Each uses the canonical owner/role or existing active-session/AAL2 Admin guard. A service-only exact-asset resolver `media_upload_playback_authorized` follows server SSR authorization; `media_upload_playback` is revoked from application roles. Private helper `submission_media.upload_state` and an immutable-history trigger complete the projection. No direct private-table grants were added for API/service roles.

`POST /api/media` checks exact configured Origin, JSON shape, a 16 KB/5-second body bound, fresh identity/canonical role, revision/idempotency and reservation admission limits. `GET /api/media/[submission]/[asset]` serves only exact generated preview/waveform bytes, never originals, with live owner/MFA authorization before privileged access, bounded reads, verified SHA-256/version and a final authority/locator recheck. Responses are private/no-store/nosniff. Paths, privileged URLs, raw provider errors, leases and keys are excluded from client projections. Existing analytics events retain stable dedupe keys and allowlisted properties only after verified commits; telemetry failure does not undo media success. No analytics was enabled.

## Executed validation

Counts overlap; they are not additive release-acceptance totals. Evidence directory (local, ignored/uncommitted): `output/system03-music-uploads-2026-10-23/` in the original workspace.

| Command / exercise | Verified result |
| --- | --- |
| `npm run test:unit` | 1,497 PASS; 0 failure/skip; includes existing Auth/licensing/checkout/finance/PostHog regressions and new upload cases |
| `npm run test:music-uploads` | 28 PASS: 14 SQL/RLS lifecycle/negative cases, 6 real transfer-engine cases, 8 API/service/byte-access cases |
| `npm run test:music-uploads:native` with explicitly hashed Supautils and pinned media tools | 36 PASS; real PG17 sessions, reservation/confirmation contention, additional-asset worker execution, all media/provider suites, private Storage isolation, exact grants and preservation of existing policies/triggers |
| `npm run test:release-replay` | Clean native PostgreSQL 17.11 replay of all 56 exact migrations; disabled capabilities, Auth assurance, Artist CAS/rollback/RLS preserved |
| `npm run test:security-pr2` / `npm run test:artist-security:gate` | 300 / 5 PASS |
| Native codec suites (`media-worker-media`, `media-worker-remediation`, `media-worker-security`) with pinned tools | 15 PASS, 0 FAIL, 1 explicit Linux-descendant SKIP; previously tool-dependent codec failures pass on Darwin ARM64 |
| `npm run test:music-uploads:browser` | 11 Chromium production/SDK journey groups PASS; actual SQL/RLS plus synthetic loopback Auth/TUS/Storage and native worker; 0 browser runtime errors; desktop1440/mobile390 screenshots |
| `npm run test:artist-onboarding:browser` / `npm run test:auth:browser` | 9 / 8 Chromium journey groups PASS; 0 browser runtime errors |
| `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check` | PASS; lint has 0 errors and 1 pre-existing React Hook Form warning in `components/forms/submit-music-form.tsx:178` |

The unchanged resource exercise was adapted only for local imports/tool/scratch paths (retained in ignored evidence). A synthetic 249,984,044-byte, 325.5-second, 192 kHz stereo WAV passed full validation/hash, waveform and 60-second preview. Wall time 7,728 ms; Node peak RSS 253,575,168 bytes; parser peak 21,708,800 bytes; scratch 251,736,908 bytes; waveform130,712 bytes; preview1,622,152 bytes. Existing memory/scratch/time assertions passed. This is a local source-processing exercise, not a hosted 250 MB TUS/network/runtime benchmark.

Environment: native macOS/Darwin ARM64, Node24.14.1, PostgreSQL17.11. Built the repository's unchanged `workers/media/build-ffmpeg.sh` from FFmpeg9.0.2, matching repository-pinned source SHA-256 `8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e`; GPG release-signature verification was unavailable. Tools: `/private/tmp/tse-system03-codec/tools/bin`; ffmpegSHA256 `a64ea24de42f3588ca66503793a325b14774878efd4f39c9d187931fbcf2e6aa`, ffprobeSHA256 `ee76f9bee582e67fafba2b0cf87f90a0cc73af2eaf9dd3d41b37dc487180837f`. Provider fixture uses explicit Supautils SHA-256 `ad18bd34a2f76a9b586484e35f41d591b19c07c7fbaef9ed140cc4d5e8ac94b7`; the native command refuses an absent, symlinked or mismatched library. Production Linux/Node26 profiles and frozen qualification capsule are unchanged.

The real PostgreSQL provider fixture now explicitly supplies the trusted installer SELECT/REFERENCES baseline on provider-owned Auth users/sessions required by the accepted Auth/FK chain. API/worker roles receive no such grants. Assertions prove preservation relative to that declared fixture baseline; actual hosted Auth grants must still be verified. Browser Storage transport emulates TUS with real policy checks; it does not qualify managed Storage installation authority. `verify:supabase` was intentionally not run against shared projects.

## Outstanding hosted / external acceptance

- Separately authorized isolated migration replay, actual provider-owned Storage authority and private buckets/policies, authenticated TUS/CORS/token refresh/expiry/uncertain responses, object identity/version and cross-account canaries. No hosted configuration or flags were changed.
- Native Linux AMD64/production Node26 container qualification, Linux descendant teardown and retained Phase A evidence custody/quota/budget prerequisites. The 53 historic qualification records remain separate; Darwin successes do not accept their isolated-platform stage. No Phase A dispatch occurred.
- Authorized worker/broker/Storage credentials, TLS, scheduling, retry/lease recovery, actual provider read failures and deployment-runtime limits. Private preview byte access requires existing server-side delivery configuration. No application credentials were used in simulations.
- Real Safari/Firefox, physical devices, keyboard/screen-reader/accessibility and independent security review. Firefox/WebKit were unavailable locally; automated responsive Chromium checks are supporting evidence only.
- Retention/cleanup policy and recovery for abandoned/cancelled private bytes. Removal does not physically delete immutable evidence or terminate an already-issued TUS resource; that resource can finish privately until expiry, but active-draft confirmation/playback/review authorization is denied. No purchase entitlement follows. Cleanup must respect PK04/PK08/purchase references and be separately reviewed; no purge job was introduced.
- New media remains a review candidate. Rights verification, approved source-to-license deliverable manifests and commercial release acceptance remain in their existing gated workflows; System 04 has not started. Arbitrary document/ZIP delivery requires a separate approved content profile.

## Command Center and preservation

Record this package as LOCAL COMPLETE — NOT LIVE in Engineering; append implementation, validation, security, runtime and acceptance evidence to Blueprint Reconciliation and supporting Product/QA/security notes. Preserve all existing IDs/formulas/charts/history, all 25 formal QA scenarios as Not Run, and the 53 platform qualification stage records. Command Center readback/custody evidence and exact local commit/stat are recorded in the ignored output directory after commit.

The original dirty workspace HEAD/status and SHA-256 of all 25 dirty tracked files match the preflight snapshot. Accepted Systems01/02 remain clean at their original commits. Only the exact inventory below is staged/committed. Generated build/provider/test artifacts are excluded. No push, merge, deployment, hosted migration/Storage changes, commerce activation, real transaction or System04 implementation was performed.

## Exact changed-file inventory

- `app/(app)/admin/media/page.tsx`
- `app/(app)/admin/tracks/[id]/page.tsx`
- `app/(app)/artist/submit/page.tsx`
- `app/(app)/artist/tracks/[slug]/edit/page.tsx`
- `app/(app)/artist/tracks/[slug]/page.tsx`
- `app/(app)/artist/uploads/page.tsx`
- `app/api/media/[submission]/[asset]/route.ts`
- `app/api/media/route.ts`
- `components/artist/uploads/upload-workbench.tsx`
- `docs/media-worker/system03-local-acceptance.md`
- `lib/media/resumable-upload.d.mts`
- `lib/media/resumable-upload.mjs`
- `lib/media/upload-contract.ts`
- `package.json`
- `scripts/test-music-uploads-browser.mjs`
- `scripts/test-music-uploads-native.mjs`
- `services/media/playback.ts`
- `services/media/uploads.ts`
- `supabase/migrations/20261024035806_system03_music_uploads.sql`
- `tests/helpers/artist-onboarding-provider-fixture.mjs`
- `tests/helpers/music-uploads-fixture.mjs`
- `tests/helpers/music-uploads-provider-fixture.mjs`
- `tests/helpers/submission-media-postgres.mjs`
- `tests/music-uploads-api.test.mjs`
- `tests/music-uploads-db.test.mjs`
- `tests/music-uploads-native.test.mjs`
- `tests/music-uploads-transfer.test.mjs`
- `tests/pr18-pr21-reconciliation.test.mjs`
- `tests/release-candidate-replay.test.mjs`
- `tests/submission-media-postgres.test.mjs`
