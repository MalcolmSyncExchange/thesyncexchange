# The Sync Exchange — Engineering Operating Skill v1

## Purpose

This document defines the project-specific engineering workflow for The Sync Exchange. It supplements `AGENTS.md`; it does not replace it. If this document conflicts with `AGENTS.md`, the stricter security, authorization, production-safety, or approval rule wins.

## Scope

Use this operating skill for work involving:

- GitHub branches, commits, pull requests, CI, and releases
- Next.js application code and API routes
- Supabase Auth, Postgres, RLS, Storage, migrations, and server-side authorization
- Netlify previews, environment configuration, and production deployment
- Stripe integration code when engineering changes intersect checkout, webhooks, fulfillment, or environment configuration
- security review, regression testing, and launch readiness

## Source-of-Truth Order

Before changing behavior, inspect current state rather than relying on a prior chat or stale status report.

1. Current repository state on the target branch
2. Current production/staging service configuration when accessible
3. Current migrations and database state
4. Current tests and CI results
5. Frozen/approved project artifacts and decisions
6. Prior reports and conversation history

Prior work is context, not proof that a change is still present or live.

## Standard Status Language

Use exactly these project statuses when reporting implementation state:

- **COMPLETE** — implemented and verified in the environment claimed.
- **COMPLETE — NOT LIVE** — implementation is finished and verified as far as possible, but production deployment, configuration, migration, credentials, activation, or another launch step remains.
- **IN PROGRESS** — implementation has started but required work or verification remains.
- **BLOCKED** — work cannot safely continue until a named dependency or decision is resolved.
- **NOT STARTED** — no implementation has begun.

Never call work COMPLETE solely because code exists. State what was actually verified.

## Default Engineering Workflow

For a meaningful change:

1. Reconstruct the current state from the repository and relevant connected services.
2. Identify the environment: local, preview/staging, or production.
3. Identify affected trust boundaries: unauthenticated, artist, buyer, admin, service role, payment, storage, or webhook.
4. Create or reuse a focused feature branch. Never implement directly on `main`.
5. Make the smallest coherent change.
6. Add or update focused tests.
7. Run focused validation first, then broader validation proportional to risk.
8. Review the diff for unrelated changes and secret exposure.
9. Push the feature branch and open/update a PR.
10. Inspect CI and preview results.
11. Report status using the standard status language.
12. Obtain explicit approval before any production-impacting action listed in `AGENTS.md`.

## Environment Rules

Always name the environment being inspected or changed.

### Local / isolated test
Safe for iterative implementation and destructive test data when clearly isolated.

### Preview / staging
Use for production-like verification, test-mode Stripe, hosted auth checks, and migration rehearsal. Do not assume preview environment variables, Supabase redirect URLs, webhooks, or database targets match production.

### Production
Treat as protected. Production data, secrets, RLS/auth policies, storage, live Stripe configuration, production migrations, protected-branch merges, and production availability require explicit approval as defined in `AGENTS.md`.

Never infer production readiness from a local or preview pass alone.

## GitHub Rules

- Base new work on the current intended base branch/commit, not an old conversational SHA.
- Prefer one concern per branch and reviewable commits.
- Never push directly to `main`.
- Do not merge a PR merely because CI is green; verify scope and required environment checks.
- Before recommending merge, report:
  - branch and base
  - changed files / scope
  - test and CI results
  - migration/configuration implications
  - preview/staging verification
  - remaining risks
- A merged PR is not automatically a verified production deployment.

## Supabase Rules

Follow the installed/current Supabase skill and documentation in addition to `AGENTS.md`.

For exposed schemas, require RLS where appropriate and verify policies against the actual role/ownership model.

Do not use deprecated `auth.role()` policy checks as a general authorization pattern. Prefer explicit policy target roles (`TO authenticated`, `TO anon`, etc.) plus ownership/authorization predicates. For privileged server workflows, authorize the caller before using a service-role client.

Do not add `SECURITY DEFINER` merely to bypass a permission failure. When it is genuinely required, minimize scope, lock down execution, validate caller authorization, and review exposure.

Schema/security work is incomplete until the relevant migration, policy behavior, and verification path are accounted for.

Production migrations and production data mutations require explicit approval.

## Netlify Rules

- Use deploy previews/branch deploys before production when the change affects hosted behavior.
- Verify the exact deploy/commit being reviewed.
- Keep preview/staging and production environment configuration distinct.
- Treat a successful build as different from a successful smoke test.
- Treat a successful smoke test as different from production acceptance.
- Never silently change production environment variables or trigger a production-impacting deployment.

## Security Gate

For auth, permissions, payments, storage, uploads, downloads, agreements, admin behavior, or user data, explicitly review:

- server-side authentication
- role and ownership authorization
- RLS/grants/policies
- service-role boundaries
- input validation
- secret exposure
- storage path and signed URL authorization
- redirect and URL handling
- rate/abuse controls where relevant
- payment amount/currency trust and webhook verification where relevant
- cross-user/cross-role access
- regression tests for the repaired boundary

A security fix is not complete because the happy path works. Test the forbidden path too.

## Validation Levels

Choose validation based on risk.

### Documentation-only
Review diff and links/references. No application build is required unless documentation changes executable/configured behavior.

### Low-risk UI / isolated logic
Run focused tests plus typecheck/lint as relevant.

### Application behavior
Run focused tests, unit tests, typecheck, lint, and build when practical.

### Auth / Supabase / payment / security-sensitive
Run the broad relevant suite from `AGENTS.md`, including Supabase/route/role verification where applicable, plus targeted regression tests and hosted preview/staging verification when the issue depends on hosted behavior.

If a required check cannot run, report it. Do not silently downgrade verification.

## Approval Boundary

Read-only inspection, local validation, focused feature-branch work, commits, pushes to non-protected feature branches, and PR creation/update may proceed under the autonomy rules in `AGENTS.md`.

Explicit user approval is required before actions that can affect real users, real money, production data, production security, production configuration, or protected production branches.

When uncertain whether an action crosses that boundary, stop before the action and explain the exact effect requiring approval.

## Completion Report

Every meaningful engineering task should end with:

1. **Status** — one standard status label.
2. **What changed** — concise scope.
3. **Where** — branch/PR/environment.
4. **Verification** — tests, CI, preview/staging checks actually completed.
5. **Production state** — explicitly say whether it is live.
6. **Remaining actions** — migrations, env vars, dashboard work, deployment, manual verification, or approvals.
7. **Risks/limitations** — only material unresolved items.

## Definition of Done

Engineering work is done only when the requested scope is implemented, the relevant trust boundaries are verified, required checks are accounted for, and the status accurately distinguishes code-complete from production-live.
