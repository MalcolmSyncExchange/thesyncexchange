# Security remediation baseline review — 2026-09-15

Original scan: `41a38dfa-7ce4-47c3-8031-6f083dcbc6db`, revision `698139208f5c89357e3e1fff1869402c2ed4db8e`.
Worktree: `/private/tmp/sync-exchange-security-fixes`; branch: `codex/security-scan-remediation`.

## Refreshed production-branch baseline

Before preparing commits, `git fetch origin main` and an independent `git ls-remote origin refs/heads/main` both verified **`1f4b844e4450f223c4070c23b35e978a5aaaf598`**. `FETCH_HEAD`, `origin/main`, and the worktree's starting HEAD matched. No upstream commits needed rebasing; this baseline has the same source tree as the scanned revision. This verifies the production branch, not which revision is currently deployed to Netlify.

All five findings remain on that baseline. None was fully or partially closed by newer upstream commits. Existing track cleanup containment and rate limiting were already present and do not close these findings. Each prepared patch was compared with current source; the media patch required additional work described below. The earlier five exported patch files are superseded by this branch's reviewed changes.

| Original finding | Status on origin/main | Local remediation |
| --- | --- | --- |
| Cross-user avatar deletion (Medium) | Present: self-editable old avatar path reaches privileged cleanup. | Live artist authentication, canonical role, strict generated owner/profile path, and authenticated Storage deletion; normal replacement and rollback use the same guard. |
| Reviewed rights changed directly (Medium) | Present: owner rights-holder writes remain unrestricted after approval. | Database trigger checks both parents, locks them in deterministic order, blocks direct artist writes on approved/ever-approved tracks, and preserves trusted edit/resubmit. |
| Approved media replacement/deletion (Medium) | Present: direct Storage writes and privileged redemption of earlier signed upsert tokens bypass application cleanup. | Restrictive RLS plus an all-role trigger block referenced object recreation, deletion, locator changes and version changes. Legacy absolute Storage URL aliases are resolved as well as raw paths. |
| Authentication open redirect (Low) | Present: a slash/backslash destination passes the old string-only check. | Shared resolver rejects unsafe encodings/control characters/backslashes, validates normalized origin and returns an internal destination across confirmation and login/signup helpers. |
| Conditional demo invoice access (Low) | Present when demo mode and Stripe credentials coexist: unverified demo email can reach privileged invoice lookup. | Parameterless loader exits in demo/missing configuration, verifies live identity and canonical buyer role, then uses verified email for Stripe. |

### Media rework and compatibility

The fresh read-only reviewer found an absolute-Storage-URL bypass in the prepared reference check. A PostgreSQL regression reproduced modification of an approved preview before the correction. The migration now recognizes public, signed, authenticated, legacy object and image-render URLs, percent-encoded names/slashes, Unicode names and dot segments. Malformed URL bytes do not break unrelated Storage operations. Raw paths are not percent-decoded, preserving literal object names. The regression now passes.

Admins and service-role callers must replace referenced media using a **new object path**, then update the track through the review workflow. Existing application upload flows already generate unique paths. Same-version maintenance metadata and reads remain possible for trusted Storage operations. Authenticated artist updates to referenced rows are blocked by RLS.

Reference matching ignores host and bucket conservatively to support configured aliases. It may block same-named objects in other buckets. Keep `security_private` out of exposed API schemas. This protects currently referenced Supabase objects; it does not freeze historical media after an authorized track reference change, nor can it freeze bytes on arbitrary external hosting.

Legacy noncanonical avatar paths are intentionally not deleted. Rights edits on ever-approved tracks require the existing trusted application/service-role workflow; a deployment without its service-role configuration cannot perform those edits through an authenticated fallback. Invoice customer selection still uses the verified buyer email; changing to persisted Stripe customer IDs is outside this fix.

## Conditional admin bootstrap: code resolved, historical state escalated

Both admin scripts could promote an existing email-matched account while retaining its password. The SQL demo seed could also grant admin by email alone. These are confirmed source-level unsafe promotion paths, although repository evidence cannot establish a past production compromise.

A separate sixth change now requires `ADMIN_BOOTSTRAP_USER_ID` or `QA_ADMIN_USER_ID` for existing accounts, matching the operator-verified Auth UUID and configured email, with a confirmed email. Missing/mismatched/unconfirmed identities fail before mutations. New-account creation still uses the operator's password. The generic SQL seed no longer grants admin. Tests execute the actual scripts with mocked clients and prove the rejected cases perform zero writes; a PostgreSQL test executes the seed profile block.

**Outstanding owner/security review:** audit existing production admin Auth UUIDs, canonical `user_profiles` roles, account creation/confirmation history, and prior bootstrap runs. Confirm legitimate ownership independently before supplying a UUID. A confirmed email alone does not prove the password/session was never attacker-controlled. If an account was incorrectly promoted, plan role removal and credential/session revocation for explicit approval. No account, password, session, role or production data was changed here. This historical question is escalated, not silently marked resolved.

## Validation

- `npm ci --ignore-scripts --no-audit --no-fund`: passed with isolated worktree dependencies; no shared dependency symlink remains.
- `npm run test:unit`: **204 passed** (including checkout, license, auth, role, admin, storage, avatar, invoice and bootstrap regressions).
- `npm run test:security-db`: **5 passed**. Embedded PostgreSQL reproduces baseline rights/media mutations, applies migrations twice, checks RLS and BYPASSRLS controls, legacy URL aliases, malformed URL handling and admin seed behavior. Reapplying older permissive Storage policies does not remove the restrictive protection.
- `npm run typecheck`: passed.
- `npm run lint`: passed with one pre-existing React Hook Form compiler warning in `components/forms/submit-music-form.tsx`.
- `npm run build`: failed twice, including an approved unsandboxed attempt, because Turbopack's CSS worker cannot create a process/bind a local port (`Operation not permitted`, OS error 1).
- `npx next build --webpack`: passed; existing middleware/Edge-runtime warnings remain. The standard CI build command is unchanged and still needs to run successfully in CI.
- `git diff --check`: passed.
- `npm run verify:supabase`: blocked by missing `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` in this isolated worktree. No production credentials were copied.

A fresh investigator revalidated all five source-to-sink boundaries against refreshed main. A fresh reviewer assessed the candidate patch; its concrete URL alias issue was independently reproduced and corrected. Embedded PostgreSQL is not a hosted Storage integration test: provider trigger permissions, actual signed-token redemption and concurrent/network behavior still require staging verification. No hosted E2E suite was run.

## Migrations awaiting application

Neither migration has been applied to a hosted database:

1. `supabase/migrations/20260915065140_protect_reviewed_rights.sql`
2. `supabase/migrations/20260915065205_protect_referenced_media.sql`

Review them against the full existing chain through `0021_rate_limit_foundation.sql`. In a future authorized staging run, apply in order, verify the rights-holder and Storage triggers plus all three restrictive policies, and test with two synthetic artists, a buyer and an admin. Verify approved/archived rights denial, normal trusted edit/resubmit, direct and signed-token media mutation denial (including absolute URLs), new-path replacement, reads, cross-owner avatars, valid signup/recovery, and demo isolation using Stripe test credentials.

Production application, merging and deployment require a later explicit approval. No push, merge, Netlify deployment, hosted SQL execution, or production changes are part of this task. Production remediation remains pending review, CI/staging verification, application of the migrations and deployment of the application fixes. Dropping the guards reopens the database findings; evaluate security impact before rollback.
