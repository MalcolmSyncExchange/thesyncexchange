# Canonical security deployment and migration-history reconciliation

**PR 2 prepares code and SQL. Nothing in this procedure has been applied live.** Do not run an unrestricted `supabase db push`, a reset, migration repair, or an old bootstrap against either existing project.

## Evidence and repository integrity

- Approved historical baseline: `35062fb`, based on deployed `4e47997`.
- Current expected effects: ordered 24-file [migration manifest](migration-manifest.json). The historical 21 SQL files remain byte-for-byte unchanged; three forward migrations define PR 2.
- [Read-only inventory](../../scripts/artist-baseline/inventory.sql) captures tables/columns/constraints/indexes/views/functions/triggers/policies/grants/buckets/ledger, not customer rows.
- [Preflight](../../scripts/security-pr2/preflight.mjs) replays canonical SQL in an isolated in-memory PostgreSQL instance. It does not open a network connection.

```sh
npm run verify:security-baseline
npm run test:artist-security:gate
npm run test:security-pr2
node scripts/security-pr2/preflight.mjs --capture /absolute/path/to/catalog-export.json --report /absolute/path/to/drift-report.json
```

The capture comparison must return nonzero for today's production/staging: PR 2 is unapplied. A green repository-only check is not a live attestation. Catalog comparison covers application schema and application-owned Storage policies/trigger; hosted internal Storage structures are excluded. New RPC EXECUTE grants and profile column grants are checked; provider owners, default privileges and provider maintenance behavior still require operator review.

`--write-manifest` is a deliberate maintainer operation **after reviewing changed SQL**, not an automatic CI repair. CI compares the committed manifest and runs the original five gates plus the security regressions.

## Production ledger: do not fabricate history

Production records only `20260913180113 / 0021_rate_limit_foundation`, despite independently verified effects of the historical application schema. Staging records its bootstrap plus two security migrations. Historical filenames also contain two `0006` versions; they cannot safely be treated as a clean CLI version ledger.

1. Retain the live catalog exports, query hash, SQL hashes and ledger as immutable evidence.
2. Verify each expected effect, including function bodies, constraints, RLS, grants, Storage and removed auth triggers. A matching name is insufficient.
3. Apply only approved **new forward** migrations by explicit SQL or migration API, not by replaying “missing” historical entries. Record their actual deployed version/name/checksum and post-apply export.
4. Keep the earlier ledger discrepancy visible. Do not mark the old Storage policies applied: they were absent and their effect is deliberately superseded.
5. After canonical post-apply state and staging behavior are proven, propose a separate controlled ledger/checkpoint reconciliation. It needs an approved mapping from each historical file to independently verified effects, handling duplicate `0006` identities and intentional supersession. Back up the ledger and catalog, dry-run on a disposable clone, obtain approval, and compare before/after. This PR neither repairs nor invents those entries.
6. Until that operation is reviewed, deploy by the explicit approved forward-file list and integrity manifest. The manifest describes expected state; the ledger describes observed execution history. Neither is a substitute for the other.

Fresh projects should use a reviewed baseline provisioning plan that respects this duplicate-version history. Do not use the retired manual bundle as a shortcut.

## Forward deployment sequence — approval required

Target staging first. Confirm the target project and take a recoverable database/Storage backup. Keep production credentials separate. Capture the catalog and compare it immediately before any mutation; resolve unknown drift first.

Apply exactly these files in order:

1. `20260915224738_reconcile_reviewed_rights_and_storage.sql`
2. `20260915224822_separate_profile_finance_and_buyer_access.sql`
3. `20260915225349_atomic_artist_track_writes.sql`

Migration 2 has an explicit, bounded data operation: if an artist's existing payout contact is null, preserve the already-entered `onboarding_payload.payoutEmail` there, then remove only that duplicate key from generic onboarding payloads. It does **not** infer a payee or entity. Review affected-row counts privately before approval. Its transaction-local service claim lets SQL Editor/CLI migrations run without an end-user JWT; it resets at transaction end and does not weaken application guards.

This is a **coupled application/database release**: the new app needs the views/RPCs, while the old app's `SELECT *` and old onboarding payload writes will fail after the column restrictions/duplicate guard. Use an approved maintenance/read-only window for affected artist and buyer flows. Apply SQL, deploy this compatible app revision, reload PostgREST schema metadata if required, perform role-isolation and hosted Storage tests, and reopen flows only after verification. Do not deploy either half alone and call the rollout complete.

Staging validation must include independent artist onboarding/profile/payout defaults, rights edit/review, avatar replacement/failure cleanup, buyer discovery/favorites, Stripe **test-mode** checkout/webhook, paid-order history and agreement download, wrong-owner IDs, signed-upload redemption against referenced media, and no-JWT migration execution with legacy payout values.

Production requires separate explicit approval after staging evidence. A feature-branch PR or Deploy Preview does not apply Supabase migrations and is not approval for production changes.

## Recovery

Each migration is transactional. On failure, roll back its SQL transaction and retain the exact error/catalog export. For an application rollback after restrictions are active, use a revision that understands these boundaries; never restore the old permissive policy/bootstrap to make an older build work. Prefer a reviewed forward repair or keep affected flows in maintenance. Restore data only from an approved, verified backup operation, particularly for the payout duplicate relocation. No automatic data or ledger rollback is supplied.

## Retired material

`supabase/manual-apply/2026-04-foundation-bootstrap.sql` can restore superseded null-user trust logic and removed auth triggers. The historical Storage bundle restores broad owner writes. Both remain intact for evidence/tests, with retired notices in their entry points and directory README. Use these files for investigation only. Active setup scripts, readiness advice and runbooks now point here.
