# Isolated hosted Supabase staging requirements

This is a requirements/runbook document only. No project, deployment, bucket, user or database has been created or changed by this task.

## Isolation gate — before any test writes

The existing PR #18 Netlify preview is **not staging**: the audited site's all-context Supabase URL points to production. Do not run migrations, seed scripts, account tests, Storage mutations or Stripe-backed flows against it.

Provision a separate hosted Supabase project (preferred for this rehearsal) and a separate Netlify staging site in a later authorized task. A Supabase branch is acceptable only after proving its database, Auth, Storage, keys and data are isolated; a different branch name alone is insufficient. A separate Netlify site avoids changing production configuration or inheriting all-context secrets.

Record and independently verify:

- Production project reference to reject: `sgpubcpldfxcuhjjdcau`.
- A different staging project reference, API hostname, database connection target, Auth issuer and signing keys.
- Separate Storage buckets and bytes. Never use production Storage URLs, signed tokens or copied customer files.
- Separate anon/publishable and server-only service-role/secret keys belonging to staging. Do not reuse production keys or copy production `.env.local`.
- A distinct staging site ID and URL, with its own scoped settings; no automatic production-domain publishing.
- All test tools must require an explicit staging reference/URL allowlist and abort if a target is missing, is the production project, or falls back to another environment. Confirm the effective target immediately before each write-capable command.

Do not create or switch any of these resources as part of a read-only audit.

## Exact application configuration

Set these only on the separate staging site/project during authorized provisioning:

| Variable / setting | Required value or scope |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Staging project API URL; no production fallback in any context used for rehearsal. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Staging public key matching that project. |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging-only secret in Netlify Functions scope; never public/client scope. |
| `NEXT_PUBLIC_APP_URL` | Exact staging HTTPS site origin. Resolve any legacy site-URL alias to the same origin. |
| `SYNC_EXCHANGE_DEMO_MODE` | `false` for normal hosted rehearsal. Test demo isolation separately using staging credentials only. |
| Avatar bucket config | `NEXT_PUBLIC_SUPABASE_AVATARS_BUCKET=avatars`; the new policy deliberately targets this exact bucket. |
| Other bucket config | Match `cover-art`, `track-previews`, `track-audio`, `agreements` and audited application mappings. |
| Stripe keys | All test-mode keys, including the public key and a dedicated staging/test webhook secret. No production customer/order/price IDs. |
| Supabase Auth Site URL and redirects | Staging URL plus its exact callback/reset routes; separate from production. |
| Email delivery | Test mailbox/sink; no customer addresses or production email campaign credentials. |
| Admin bootstrap | Fresh synthetic admin, or explicit verified staging UUID via `ADMIN_BOOTSTRAP_USER_ID` / `QA_ADMIN_USER_ID` for an existing account. |

Any required signing/email/integration configuration must be independently scoped to staging. Disable production webhooks, imports and scheduled side effects in the staging configuration. Never print secret values while verifying presence or project matching.

## Reconstruct the correct database baseline

The production migration ledger lists only the rate-limit migration despite older schema objects existing. Do not treat that ledger as the complete schema, and do not blindly replay old bootstrap/policy SQL onto production or a copied customer database.

1. Build an empty, reviewed staging schema from repository definitions reconciled with the read-only production catalog: tables, enums, foreign keys, canonical `current_app_role`/`is_admin`, moderation/profile guards, grants and rate limiting.
2. Confirm the hosted provider's `storage.objects` schema, `version`, provider deletion guard, maintenance triggers and RLS are present. Do not insert/delete Storage metadata manually.
3. For the primary audited-production rehearsal, start with **zero Storage policies**, not `supabase/storage-policies.sql`.
4. Create the five staging buckets through supported provisioning APIs; public: avatars/cover art/previews; private: full audio/agreements. Use matching MIME/size limits.
5. Seed only synthetic artist A, artist B, buyer and admin identities, synthetic tracks/rights/license options/orders and small generated test assets. Use no production Auth export, passwords, tokens, licensed audio or customer PII.
6. Build a separate synthetic load fixture if more than the audited 32 tracks/113 objects is needed for performance testing.
7. Capture baseline definitions and a tested recovery plan before applying the three candidate migrations below.

## Migration and application matrix

Pin the exact PR head under review and current main `3580a0ac650545015b30e9cf1bc0f44e2ba642d4`. Verify the target again before each action. Apply, only in staging:

1. `20260915065140_protect_reviewed_rights.sql`
2. `20260915065205_protect_referenced_media.sql`
3. `20260915082111_allow_artist_avatar_cleanup.sql`

The avatar migration fails unless the referenced-media trigger is already enabled. Both earlier SQL files remain unchanged. Use bounded lock/statement timeouts, record each file's result and stop on failure; each file has its own transaction.

Rehearse current-main compatibility with the DB guards, then the revised PR application. Current main still has old avatar cleanup code; the revised PR must demonstrate the authenticated cleanup path. A second disposable staging fixture may test legacy permissive policies, but must not silently replace the zero-policy fixture or broaden production grants.

## Required acceptance evidence

- Own generated avatar upload through the server action, replacement and failed-persistence cleanup actually remove the intended old/new object. Capture returned object counts and re-list/download results; a 2xx response alone is insufficient.
- Cross-user, buyer/admin direct, role-revoked, forged/legacy/traversal/encoded/control-character cleanup fails without affecting the target. Authenticated avatar INSERT/UPDATE/upsert remains denied. Demo mode never reaches live cleanup.
- Signed/server track uploads use fresh paths; direct authenticated uploads/updates/deletes stay denied on the zero-policy baseline. Referenced audio, previews, waveforms and artwork resist overwrite/delete/recreation and saved signed-upsert-token replay, including admin/service-role paths and absolute/encoded references.
- Valid temporary cleanup works. Referenced-avatar collisions remain protected. Missing referenced objects cannot be recreated at the protected name.
- Public images/previews, authorized full-audio signing and agreement access work. Cross-buyer agreement access fails. Test agreement generation/upsert/rollback and idempotent webhook fulfillment using Stripe test mode only.
- Reviewed-rights direct writes, archive/reassignment bypasses fail; normal draft/edit/resubmit/moderation and rollback work.
- Authentication return paths remain safe (already deployed by PR #19); demo invoice lookup remains isolated; bootstrap guard rejects unbound existing identities without mutations.
- Exercise actual Storage API delete protection, same-version maintenance, signed-token finalization and concurrency. Compare object bytes as well as DB metadata after denied mutations.
- Record latency/lock behavior and rehearse rollback on staging. The embedded PostgreSQL tests do not replace these provider checks.

Production release remains a separate approval after the results, backup capability, current deployment settings and historical admin/rights provenance questions have been reviewed. No production credentials or targets may be used to satisfy staging acceptance tests.
