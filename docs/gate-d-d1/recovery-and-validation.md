# Gate D D1 recovery and validation

## Forward recovery and rollback

The executable migrations are intentionally forward-only and retain evidence. Before any hosted use, capture migration ledger state and both SHA-256 hashes. Apply A, verify the two zero-row tables/guards/RLS/ACLs, then apply B and verify exact functions/EXECUTE grants. Do not create data during installation.

If migration A fails, its transaction rolls back. Correct the reviewed source and apply a new timestamped migration; do not edit an applied migration. If A succeeds and B fails, tables remain dormant with no executable API path. Correct B in a new reviewed migration. If application publication fails after both migrations, leave migrations dormant: no fixture or grant means no behavior.

After a later authorized execution, never drop evidence to roll back. Disable/remove the application entry point first, reconcile any nonterminal grant through reviewed provider evidence, and apply the separately reviewed D5 cleanup. The prepared cleanup revokes/drops executable functions while retaining grant/audit rows, FKs, RLS, state/no-delete guards, append-only audit, and receipt Storage immutability.

## Local validation evidence

Final pre-commit results on 2026-10-03:

- `npm run test:gate-d`: PASS, 31/31.
- `npm run test:gate-d-concurrency`: PASS, 1/1 on PostgreSQL 17 with two connections.
- `npm run test:unit`: PASS, 385/385.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS with zero errors and one pre-existing React Compiler warning in `components/forms/submit-music-form.tsx`.
- `npm run build`: PASS; only the existing Next.js middleware convention deprecation warning.
- `git diff --check`: PASS.
- Fresh disposable migration application: PASS repeatedly through the PGlite suites and once through PostgreSQL 17.
- Exact changed-file secret-pattern scan: PASS, no matching key/token material.

Migration hashes:

- `20261004023232_gate_d_acceptance_schema.sql`: `9a9083644e544c9344ee56b37a9dccb9bd9415428137d859434a72a570f977b8`
- `20261004023241_gate_d_acceptance_functions.sql`: `4e32e9bdf157f87d86e09f7625a0e339458d9e5f3829b7d96ab3cc8160391ca9`

No command in this package accepts or uses a hosted Supabase URL. The concurrency test starts an already-cached `postgres:17` image with `--network none`, no host port, no credentials, no volume mount, and removes it afterward.

## Evidence map

| Requirement | Automated evidence |
|---|---|
| zero-data healthy / all capabilities OFF | `gate-d-acceptance.test.mjs` |
| exact ACL/RLS/EXECUTE | `gate-d-acceptance.test.mjs` |
| missing/malformed/deleted/mismatched/new session | `gate-d-acceptance.test.mjs` |
| global single grant and immutable attempt/lease recovery | `gate-d-acceptance.test.mjs`, `gate-d-concurrency.test.mjs` |
| stale worker and confused deputy denial | both database suites |
| digest drift, timeout, same key, binding failure | `gate-d-application.test.mjs` |
| Session-only webhook, conflict, ordinary path, Connect/live rejection | `purchase-completion-webhook.test.mjs`, database suite |
| exactly four jobs and activation unclaimable | `gate-d-acceptance.test.mjs` |
| receipt bounds/path/adoption/mismatch hold | `gate-d-receipt.test.mjs`, `gate-d-application.test.mjs` |
| pending entitlement and `can_deliver=false` | `gate-d-acceptance.test.mjs` |
| terminal payment preservation | `gate-d-acceptance.test.mjs` |
| final invariant/incomplete rejection/idempotent consume | `gate-d-acceptance.test.mjs` |
| ordinary checkout/agreements/roles/health regression | repository `test:unit`, typecheck, lint, build |
