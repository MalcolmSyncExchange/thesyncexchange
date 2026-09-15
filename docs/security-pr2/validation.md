# PR 2 validation

All commands ran in the isolated PR2 worktree. No test used a live Supabase URL or a real Stripe key.

| Command | Final result |
|---|---|
| `npm run test:unit` | **194 passed, 0 failed, 0 skipped** |
| `npm run test:artist-baseline` | **71 passed, 0 failed, 0 skipped**; historical DB captures plus current route/serialization assertions |
| `npm run test:artist-security:gate` | **5 passed, 0 failed, 0 skipped**; original test file unchanged |
| `npm run test:security-pr2` | **24 passed, 0 failed, 0 skipped**; real PostgreSQL policies/triggers/RPC/rollback and application boundaries |
| `npm run verify:security-baseline` | **Passed**; 24 migration hashes, role/column/RPC/Storage assertions, retired script advice check |
| `npm run typecheck` | **Passed** |
| `npm run lint` | **Passed, 0 errors**; 1 pre-existing React Hook Form `watch()` / React Compiler warning at `components/forms/submit-music-form.tsx:173` |
| `git diff --check` | **Passed** |
| `npm run build` | **Environment-blocked**: Turbopack PostCSS child process/port binding, `Operation not permitted (os error 1)` |
| `node node_modules/next/dist/bin/next build --webpack` | **Passed**; optimized production build and route generation complete; existing middleware deprecation/Supabase edge warnings |
| Preflight against refreshed production and staging exports | **Expected nonzero**: PR2 migrations/code are unapplied; detailed drift reports retained |

**294 passing tests total** across the four non-overlapping commands. Nested SQL scenarios also perform multiple assertions, not separately inflated into test counts.

Build configuration used `CONTEXT=deploy-preview`, `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000`, `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co`, and synthetic CI placeholders for anon/Stripe values. No credentials were copied into the worktree. The Webpack fallback verifies compilation/build; it does not establish a successful Turbopack build.

## Concrete additional proof

- Same five original exploits denied with real PostgreSQL grants/RLS/trigger enforcement; normal profile edit, own finance access, approved catalog/licenses/favorites and admin reads remain possible.
- Reviewed-rights INSERT/UPDATE/DELETE/reparent and archive→pending bypass attempts denied. Draft approval/account-link changes rejected.
- Explicit no-JWT migration replay against both captured production and staging, with a legacy payout duplicate, preserves the contact and unrelated payload fields and resets transaction-local context.
- Atomic update rejects foreign actor/track IDs, wrong roles, protected JSON fields and stale versions; required audit failure rolls parent, rights and pricing back together.
- Disabled license type permits legitimate draft edit while staying unavailable to buyers.
- Full-audio object/path/version substitution, deletion/recreation and legacy URL aliases tested; service role cannot overwrite referenced bytes by changing Storage version. Metadata-only updates work. Narrow avatar owner cleanup succeeds; foreign paths fail.
- Serialized live buyer catalog/order payloads reject injected private fields; safe agreement failure and checkout signals preserve status screens.
- Legacy account deletion effects remain visible: unsold artist cascade, sold-track deletion block, buyer order/license cascade.

## Review and limitations

One fresh read-only investigator and one fresh read-only candidate reviewer were used under the security-fix workflow. Confirmed migration-context, disabled-license and agreement-failure regressions were corrected and retested. No review finding was suppressed by changing the five gate assertions.

No post-migration hosted Auth/PostgREST/browser/Storage/Stripe checkout smoke run was performed because the changes were not approved/applied to staging. `verify:supabase`, HTTP role/onboarding scripts and Playwright against a migrated hosted environment are rollout gates, not claimed passes. Real Storage token redemption and production migration effects remain unverified. Follow the explicit staging plan in `deployment.md` before production approval.
