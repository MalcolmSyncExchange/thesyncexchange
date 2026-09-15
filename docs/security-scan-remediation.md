# PR #18 security remediation revision — 2026-09-15

## Baseline and review scope

Fresh fetch and remote-reference inspection verified `origin/main` at **3580a0ac650545015b30e9cf1bc0f44e2ba642d4**. Main was merged locally into the published remediation branch to preserve shared history. PR #19 already deployed the authentication-redirect remediation: its original commit remains in ancestry, but there is no net auth-redirect patch against main.

| Original finding | Current disposition |
| --- | --- |
| Cross-user avatar deletion | PR retains authenticated canonical artist/path cleanup and adds the missing narrowly scoped database authorization. |
| Direct reviewed-rights mutation | PR retains both-parent locking and approved/ever-approved rights guard with trusted edit/resubmit support. |
| Referenced media overwrite/deletion | PR retains restrictive RLS and all-role trigger protection for recreation, deletion, locator and version changes, including legacy URL references. |
| Authentication open redirect | Already remediated on main through PR #19; no duplicate net change. |
| Conditional demo invoice access | PR retains live verified buyer authorization and demo-mode early exit before privileged invoice lookup. |

Additional admin-bootstrap hardening binds existing-account promotion to an explicitly verified Auth UUID and confirmed email. The generic SQL seed does not promote an email-matched account. Historical production ownership/promotion provenance remains outstanding; confirmed email alone does not establish intended ownership.

## Storage authorization revision

The audited production database has RLS enabled on `storage.objects` and **zero Storage policies**. Restrictive policies alone do not authorize cleanup. A new additive migration grants authenticated artists exactly SELECT and DELETE on their own canonical generated avatar names in bucket `avatars`:

`<auth.uid()>/profile/<13-digit timestamp>-<UUID or 13-digit timestamp>.jpg|jpeg|png|webp`

Both policies check canonical `public.current_app_role() = 'artist'`, exact first-segment ownership and the entire generated name. Control characters, legacy names and alternate buckets are excluded. SELECT is required for Storage deletion discovery. No authenticated INSERT/UPDATE, admin exception, track-wide owner policy or other bucket permission is added. Role revocation removes this access immediately. Application cleanup rejects demo mode before Storage access; strict path validation now also rejects trailing whitespace/control characters.

The new migration requires the enabled referenced-media trigger first. Existing restrictive policies and the trigger continue preventing mutations of any track-referenced path, even if the path is an otherwise permitted avatar. Service-role bypass of RLS does not bypass that trigger. Media replacement uses a fresh object name followed by the authorized review workflow. Current references are protected; old unreferenced objects and arbitrary external-host bytes are not frozen.

### Storage caller compatibility

| Caller | Intended authorization |
| --- | --- |
| Avatar upload | Validated server action, service-role upload with fresh name and `upsert:false`. |
| Avatar replacement/failed-save cleanup | Authenticated artist client plus the two new narrow policies; actual deletion verified in database tests. |
| Cover art, preview, full audio and waveform upload | Role/ownership-checked server upload or signed upload issuance, fresh paths; no new direct authenticated Storage grants. |
| Track temporary cleanup | Authorized server path, ownership/namespace/reference checks before service delete. |
| Public avatar/art/preview serving | Public bucket byte serving; SQL SELECT grant is not needed for public delivery. |
| Full audio and agreement download | Authorized server-mediated signing; buyer/order and track checks remain. |
| Agreement generation/upsert/failed-save cleanup | Trusted service-role workflow; noncolliding names remain usable. A track reference collision is intentionally blocked. |
| Authenticated fallback helpers | Do not broaden RLS to compensate for absent trusted service configuration. Required server capability must be verified in hosted rehearsal. |

Production audit found no missing media objects or path collisions. The reviewed-rights historical timestamp question is qualified in [the event review](security-rights-event-review.md); it does not justify removing the guard.

## Migration history

The two published SQL files remain byte-for-byte unchanged:

1. `supabase/migrations/20260915065140_protect_reviewed_rights.sql`
2. `supabase/migrations/20260915065205_protect_referenced_media.sql`

New additive migration:

3. `supabase/migrations/20260915082111_allow_artist_avatar_cleanup.sql`

Apply in that order only during a separately authorized rehearsal/release. Each file is transactional; the avatar policy migration is idempotent and fails atomically without the media trigger. No hosted migration was applied. Production's incomplete migration ledger is not proof of a complete schema history; preserving published files avoids rewriting potentially applied history.

## Validation

- `npm run test:unit`: 204 passed.
- `npm run test:security-db`: 9 passed (original five plus four zero-policy avatar/lifecycle cases).
- Independent read-only reviewer: no surviving bypass/regression; independently ran seven avatar/media PostgreSQL tests successfully.
- `npm run lint`: passed with the existing `react-hooks/incompatible-library` warning in `components/forms/submit-music-form.tsx`.
- `npm run build`: environment-blocked; Turbopack CSS worker process/port creation fails with OS error 1.
- `npx next build --webpack`: passed (existing middleware/Edge-runtime warnings).
- `npm run typecheck`: passed.
- `git diff --check`: passed.

Tests demonstrate real owner-avatar deletion, cross-owner/role/legacy/forged path denial, no authenticated upload/update/upsert grant, role-revocation behavior, trusted nonreferenced asset/agreement workflows, missing referenced-path recreation denial and referenced-avatar collision protection. Both the audited zero-policy fixture and legacy permissive-policy fixture are exercised. Embedded PostgreSQL cannot establish hosted Storage HTTP byte handling, signed-token finalization or provider-trigger privileges.

## Hosted staging and production gates

Use [the isolated hosted staging requirements](isolated-supabase-staging.md). The current Netlify preview points to production Supabase and must not receive write-capable tests. A distinct hosted project, isolated application configuration and synthetic data are required.

Before production authorization: pass hosted Storage/RLS/trigger and application rehearsal; verify backup/recovery capability and current auto-deploy settings; resolve or explicitly disposition historical admin identity/promotion and rights provenance questions; validate the trusted server capability without exposing secrets. No new blanket Storage permissions are acceptable as a compatibility workaround.

The candidate is for another CI review after local validation. Production remains unmodified. Push, hosted migration application, PR merge and deployment are outside this task.
