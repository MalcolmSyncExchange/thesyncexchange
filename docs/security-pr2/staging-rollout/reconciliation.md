# PR #18 / PR #21 reconciliation

Compared PR #18 at `2166aa172475b23874c14c4f487146e1c85c8722`, PR #21 at `4af5079f4da1e9619c5e826cfefa9e3078b15b39`, and main at `4e47997b7bb71af443660ccd4032d12fd43bf269`. This report is a pre-deployment checkpoint, not a hosted acceptance report.

## Decision

**Partially incorporate PR #18's unique admin-bootstrap protection into PR #21, then mark PR #18 superseded without merging it. Do not rebase or merge its three migrations.** PR #21 is the canonical forward release. The new regression test rejects any additional date-prefixed migration in the directory.

Do not close PR #18 until its unique safeguard and tests are published on PR #21 and CI is green. Retain its staging rehearsal evidence. Its actual staging ledger entries are historical facts and must remain; they are not additional files to replay on production.

## Exact overlap and disposition

| PR #18 surface | Disposition |
| --- | --- |
| `services/storage/avatar-cleanup.ts`, `services/storage/server.ts`, `tests/avatar-cleanup.test.mjs` | Byte-identical on both PR heads. Keep PR #21 versions. |
| `services/auth/actions.ts` | Avatar cleanup integration is already present. PR #21 additionally removes `payoutEmail` from five generic onboarding payload writes. Keep PR #21. |
| `20260915065140_protect_reviewed_rights.sql` | Superseded by PR #21 migration 1. Its reviewed-parent locks, archive protection and trigger are preserved; PR #21 additionally protects rights `approval_status` and linked `user_id`. |
| `20260915065205_protect_referenced_media.sql` | Its three restrictive policies, reference normalizer/lookup and all-role Storage content guard are included in PR #21 migration 1. PR #21 also removes historical broad Storage policies. |
| `20260915082111_allow_artist_avatar_cleanup.sql` | Its narrow canonical-artist avatar SELECT/DELETE policies are included in PR #21 migration 1. Live staging definitions match the canonical definitions. |
| Auth redirect normalization commit `6237e64d` | Already represented on main by PR #19 (`679ec67`, merge `3580a0a`). Do not replay. |
| Demo-invoice isolation commit `f370232f` / `services/buyer/invoices.ts` | Main PR #20 (`81b0a54`, merge `4e47997`) supplies the verified buyer boundary. PR #21 retains that version including `unstable_rethrow` and failure handling. Do not replace it with PR #18's older version. |
| `scripts/lib/admin-bootstrap-identity.mjs` | Unique useful safeguard. Incorporated verbatim from PR #18's committed head. |
| `scripts/create-admin.mjs`, `scripts/seed-test-accounts.mjs` | Incorporated only the verified existing-UUID/confirmed-email guard. Retain PR #21's retired-bootstrap guidance. |
| `supabase/seeds/seed.sql` | Incorporated PR #18's removal of email-only admin promotion. This is a seed-file change, not an extra migration, and has not been executed against either hosted database. |
| `.env.example` | Add `ADMIN_BOOTSTRAP_USER_ID` / `QA_ADMIN_USER_ID`; no credentials. |
| `tests/admin-bootstrap-security.test.mjs`, `tests/admin-seed-db.test.mjs` | Incorporated unchanged; eight tests pass. |
| PR #18 isolated DB regression suites/helper | Keep as historical evidence on PR #18. PR #21's full-schema suite covers the effective protections; the new reconciliation suite starts from captured staging policies/functions and verifies the ordered upgrade. Do not import a second migration tree merely to satisfy old test paths. |
| Package/CI changes | PR #21 already has PGlite and the security jobs. Add the eight bootstrap and three reconciliation tests to its existing security command. No dependency or lockfile change is needed. |
| PR #18 staging documentation and uncommitted rehearsal artifacts | Preserve in the original worktree. They document a different earlier staging rollout and must not be overwritten or represented as this rollout's results. |

## One canonical path

Apply only these three PR #21 files, in this order, after the staging handoff and compatible deployment prerequisites are ready:

1. `20260915224738_reconcile_reviewed_rights_and_storage.sql`
2. `20260915224822_separate_profile_finance_and_buyer_access.sql`
3. `20260915225349_atomic_artist_track_writes.sql`

Migration 2 needed one retry-safety correction discovered by the new idempotence test: drop its own `Private tracks are readable by owners or admins` policy before recreating it. No predicate, grant or security assertion changed. SHA-256 changed from `80c68ee34615f8c66acc46049da9d2cfc40ee9f045823bb1ba05aa76c83235f1` to `4897972b1c27d70e7cdff58a8eabb560ce400177558f8db6d6f95a6f14c99d21`. The manifest records the reviewed new content. No fourth forward migration was added.

## Fresh live evidence

Read-only capture: staging project `xgbiypruultmzbwhhjrx`, `2026-09-15T23:28:34.627108Z`. See `catalog-before.json`, `ledger-before.json`, `rls-before.json`, `storage-before.json`, and `drift-before.json` in this directory.

The live ledger has the staging baseline and all three PR #18 rehearsal migrations, including avatar cleanup applied as version `20260915231125`. Earlier PR #21 deployment text saying staging had only two security migrations is now stale. This rollout has not applied a migration.

Live staging has 31 public RLS policies and five Storage policies. Its five Storage policies and application-owned Storage trigger exactly match PR #21's canonical state. The rights guard differs only by PR #21's added rights approval/account-link protection. The missing profile/finance RPC, buyer view, atomic edit RPC and related triggers are expected pre-PR #21 drift.

Two pre-existing constraint/index names differ: staging uses `user_profiles_pkey` / `user_profiles_email_key`; repository history uses `users_pkey` / `users_email_key`. Definitions are equivalent, but the strict comparison remains nonzero. Do not hide this difference or repair metadata under this approval. Recheck definitions in the final live capture before accepting them as a documented naming-only exception.

The separate **Run repository security scan** task was active against this staging project during inspection. Its files continued changing. No migration or fixture mutation was started here; a handoff is necessary before exclusive rollout ownership.

## Hosted acceptance status

No compatible isolated Netlify application has been deployed by this rollout. The existing PR #21 preview is production-backed and is explicitly excluded from write testing. A separate site and CLI login are pending. Stripe's connector confirms sandbox account `acct_1TKlXEPE5yy0L2uG`; its local CLI key is expired. A secure re-login was requested. No sandbox purchase, webhook delivery, license generation or download is claimed.

## Repository validation

[Command results](validation.json): **305 tests passed** (194 unit, 71 baseline, five original security gates, 35 PR #21 security/reconciliation). Typecheck and migration-manifest checks pass. Lint has only the existing React Hook Form warning at `components/forms/submit-music-form.tsx:173`. `npm run build` remains blocked by local Turbopack temporary-port EPERM, including an escalated retry; `npx next build --webpack` passes. Normal CI build must also pass before merge. No assertion was weakened.

The first reconciliation run failed on a duplicate policy during repeat application. The migration correction above fixed that actual SQL failure; the same assertion now passes. No live migration was attempted to work around it.

All 18 requested hosted workflows remain pending for the compatible deployed revision. Prior PR #18 rehearsal results are useful historical evidence, not PR #21 acceptance. In particular, the earlier encoded-avatar test stopped on a transport/stored-name mismatch; its continuation must be reconciled with the other task before rerunning it.

## Recovery and production sequence

Local reconciliation tests prove ordered upgrade on captured staging authorization, preservation of seeded track records, idempotent reapplication, and transaction rollback after an injected migration-2 failure. They do not prove a hosted backup restore or application rollback. A recoverable staging data/Storage backup and a compatible rollback artifact are still required before applying the coupled release.

PR #21 is **not yet cleared to merge**. Once staging passes:

1. Publish the reconciliation changes, pass CI, retain exact commit/SQL checksums and hosted evidence, and mark PR #18 superseded without merging.
2. Obtain explicit approval for merging PR #21 and the production database/application rollout. No approval is inferred from this staging request.
3. Verify production remains at the inspected baseline and take a recoverable database/Storage backup, including payout fields and migration ledger. Prepare a maintenance/read-only window and prevent an automatic app-only release while SQL is pending.
4. Merge only PR #21 through the approved production branch during that controlled window. Coordinate the production build so public flows remain unavailable until both halves are compatible.
5. Apply only the three manifest-pinned forward files above, in order. Record actual deployed version/name/hash. Do not run historical `db push`, replay the bootstrap, or repair the production ledger.
6. Publish the exact approved compatible application from the production branch and production context. Preserve existing production Stripe configuration; never use test keys there.
7. Compare the final catalog/RLS/Storage/grants, run non-purchasing production smoke checks, and reopen flows only after acceptance. Any real-money test needs separate authorization.
8. If a SQL transaction fails, retain the error and rolled-back state. If a committed release fails, keep affected flows in maintenance and use a compatible app artifact or reviewed forward repair. Do not restore permissive policies to accommodate an old app.

Do not start PR #3.
