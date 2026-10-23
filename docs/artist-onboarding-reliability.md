# Artist onboarding reliability remediation — Phase 8A-R

Baseline: `79d1e01f5462fcfa91a4c4ce193abba8e8badd92`. Local-only remediation; no hosted migrations, storage changes, deployments, onboarding, users, emails, payments or Git push.

## Root cause and corrected behavior

| Phase 8A finding | Root cause | Local correction |
|---|---|---|
| A1 required completion | finish wrote a timestamp without checking required saved data/profile | authoritative Zod validation plus locked database validation of canonical role, profile, saved stage, required identity/bio/location/payout/choice; repeated finish is idempotent |
| A2 invalid step/progress | catch-all else treated unknown values as first-track; no persisted-order check | explicit save-step allowlist, server transition check, locked database transition validation; missing/unknown/future/completed saves reject |
| A3 partial persistence | profile upsert preceded canonical upsert in independent requests | one service-only SECURITY INVOKER RPC transaction; failure between profile and progress rolls back both; no legacy fallback |
| A4 clearing links | truthiness defaults confused absent with explicitly blank; social merge retained removed keys | patch-style stage data; omission preserves, empty string clears to NULL; cleared social keys removed; hydration respects explicit empty payload values |
| A5 avatar readiness | staging lacked expected public avatars bucket | separate local storage migration creates/reviews only avatars with 10MiB and image/jpeg/png/webp limits; no hosted execution |
| A6 editing promise | copy promised post-setup editing but inspected workspace had no editor | truthful copy plus identity/profile/licensing edit links before finish; general post-completion editor remains NOT IMPLEMENTED |
| A7 validation | native/server minima differed, no defined caps, URL prefix was not a URL | native minima/maxima aligned; names/location 120, bio 5000, URL 2048, Instagram 120, email 254, preferences 3000; real http(s) URL parsing |
| A8 image type | extension and caller MIME were trusted | Sharp 0.35.4 pinned (already in lock); actual decode, static JPEG/PNG/WebP format/extension agreement, <=16 megapixels, re-encode and trusted MIME, <=10MiB output; generic sanitized failure |
| A9 completion UX | premature complete copy, no review links, duplicate dashboard buttons/separate pending forms | review-stage copy, edit links, one shared form/pending guard and two distinct destinations |
| A10 failure analytics | every failure labeled retryable save_failed | Zod failures labeled validation/nonretryable at existing caller; no changes to PostHog implementation/routing; existing dedupe maintained |
| A11 logo variants | existing shared component used alternate website assets | deferred: named approved Primary_Logo files do not exist in this verified source tree; no fabricated/recolored/replaced brand asset |

Independent review additionally confirmed and closed: direct authenticated avatar-reference mutation, stale rendered forms bypassing fresh-read CAS, and demo edit-back progress regression. Forms now carry a bounded ISO rendered version; SQL compares it under lock. Direct artist onboarding/asset-reference writes are guarded; ordinary owned editable fields and buyer onboarding remain under existing controls. Canonical role hydration/login no longer infers role from profile existence; legacy artist profile presence alone no longer means onboarding complete.

## Persistence/security contract

The existing server uses the authenticated session to derive actor ID, then invokes the existing service-role client only after artist role authorization. New RPCs are SECURITY INVOKER, have an empty search_path and explicit EXECUTE grants to service_role only; anonymous/authenticated RPC execution is revoked. They recheck canonical role under row lock. No new SECURITY DEFINER bypass or authenticated finance grant is introduced. Artist review/verification fields are not included in any onboarding update. Payout remains in private artist_profiles.payout_email and never in canonical onboarding_payload. Buyer mutations and existing role/review/RLS policies are retained.

Artist and canonical writes are one transaction. Stage patches merge against locked current state; earlier edits do not regress progress. The rendered profile updated_at is the optimistic version, including avatar changes. Stale tabs must reload. Completion validates required persisted fields, even when the request comes directly to the server. A trigger prevents ordinary authenticated Data API writes to artist progress, payload, timestamps and avatar references. Role guards prevent changing role to evade this trigger.

Avatar uploads first decode/re-encode, then use a unique owned path. A failed transaction with a definitive SQL validation/conflict error allows compensation; an ambiguous transport result retains uploaded bytes, because it does not prove rollback. Old-avatar cleanup is still authenticated, canonical-role and namespace checked, then protected by Storage RLS. The storage migration denies raw authenticated avatar INSERT/UPDATE and deletion of an active owned reference. It grants no additional write permission; server upload is the only normalized upload path. These rules do not affect non-avatar storage objects.

## Migration and staging rollout prerequisites — NOT APPLIED

1. Review `20261012173855_artist_onboarding_atomic.sql` against staging schema and existing triggers/grants. It adds two service-only RPCs, a private validation helper and a narrow user-profile guard; no data backfill or role/RLS changes.
2. Separately review `20261012173856_staging_avatar_storage_readiness.sql`. Expected bucket is exactly `avatars`. Existing incompatible bucket configuration causes explicit failure rather than silent mutation. Review public-image intent and canonical artist cleanup policies from `20260915224738_reconcile_reviewed_rights_and_storage.sql`. Storage platform ownership compatibility still needs actual staging validation after separate authorization; in-memory tests are not a substitute for managed Storage testing.
3. Check historical artist completion records before rollout. The local migrations do not rewrite accounts previously completed under the old vulnerable code. Validate known data rather than auto-repairing it.
4. Obtain separate founder authorization before any hosted SQL/bucket action. Apply/reload schema cache and verify function grants and migration state before deploying the application. This patch intentionally fails closed if the RPCs/version column cannot be read; do not deploy the app alone against the current schema.
5. Preserve staging Supabase `oppijylbkcbiqfuvckgj`, PostHog `657650`, disabled purchase capabilities, and exact approved deployment origin during a later deployment. No auth callback, environment setting, analytics token or payment setting is changed here.
6. Existing open forms need a reload to carry the new version field. Verify a fresh read-only authenticated rendering before authorizing the one controlled onboarding submission. No automatic retries.

Rollback must be separately reviewed. Do not remove the data-integrity guard while permitting the old vulnerable artist onboarding flow. Prefer pausing onboarding and rolling forward over restoring unchecked completion. Storage bucket data must not be deleted as part of rollback.

## Refresh/resume contract and limits

Successful saves are authoritative database progress. Refresh, reauthentication and reopening hydrate the saved stage. Earlier-step navigation is allowed; future GETs clamp to persisted stage. Back leaves unsaved current edits unsaved. There is no autosave/draft promise. Missing sessions redirect to login before mutation; saved state is available after reauthentication. Version conflicts instruct reload. The diagnostic browser was not used and no live Auth session was created in Phase 8A-R.

General post-completion editing and public artist directory are not implemented by this reliability patch. Branding A11 remains a follow-up requiring actual approved source assets. Hosted RPC/managed Storage behavior, full later-stage visual QA and live multi-browser recovery remain unverified until separately authorized. Local build is only a mock-mode compilation, not a new staging deployment artifact or source-to-provider attestation.

## Regression checks

New `test:artist-onboarding` command covers required-field rejection, unknown/future steps, optional presence/clearing, real URL validation, rendered version propagation, demo edit-back, refresh/reopen/resume, transactional rollback, stale writes, direct state/reference forgery, cross-account denial, protected review status, finance isolation, idempotent finish/migration, active-avatar cleanup and decoded image validation. Existing avatar compensation and analytics write-order mocks were adapted to the single RPC; no synthetic events are sent.

Requested validation: focused onboarding, full unit suite, TypeScript, lint, additional local ownership/storage security checks and git diff --check. A local mock-mode build is also checked. Do not run `verify:artist-onboarding` during this phase: it creates accounts/uploads/submissions and conflicts with the authorization.
