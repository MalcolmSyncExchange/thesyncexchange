# AGENTS.md

## Project Overview

The Sync Exchange is a premium sync licensing marketplace built for three user roles:

- `artist`: submit music, manage catalog and rights, configure payouts
- `buyer`: search approved tracks, save favorites, purchase licenses
- `admin`: review submissions, manage users/orders, handle compliance

Main app areas:

- marketing site
- auth and account recovery
- onboarding
- artist workspace
- buyer workspace
- admin workspace
- API routes for checkout, agreements, webhooks, and auth confirmation

---

## Repo Structure

- `app/`: Next.js App Router routes
  - `app/(marketing)`: public marketing pages
  - `app/(auth)`: `/login`, `/signup`, `/forgot-password`, `/reset-password`
  - `app/onboarding`: canonical onboarding routes
  - `app/(app)/artist`, `app/(app)/buyer`, `app/(app)/admin`: main workspaces
  - `app/dashboard/*`: dashboard alias routes that redirect into canonical workspaces
  - `app/auth/confirm/route.ts`: Supabase email confirmation / recovery callback
  - `app/api/*`: checkout, agreements, Stripe webhook handlers
- `components/`: reusable UI grouped by domain
- `services/`: auth, Supabase, Stripe, domain logic
- `lib/`: env config, validation, helpers
- `middleware.ts`: protected-route gate

---

## Tech Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS + shadcn UI
- React Hook Form + Zod
- Supabase (auth, DB, storage)
- Stripe (payments)
- Netlify deployment
- npm

---

## Decision Hierarchy

When rules conflict, follow this priority order:

1. Auth and routing rules  
2. Supabase and environment rules  
3. Existing code patterns  
4. UI/UX expectations  
5. Engineering standards  

Never override auth or routing rules for convenience.

---

## Standard Implementation Workflow

Use this workflow for ordinary implementation tasks:

1. Inspect the relevant route, service, API, migration, and tests before editing.
2. Identify the smallest safe change that satisfies the request.
3. Preserve existing auth, checkout, webhook, agreement, storage, dashboard, and public-page behavior unless the task explicitly targets it.
4. Make focused edits only in the files required for the task.
5. Add or update tests for behavior, security boundaries, and regressions when practical.
6. Run the relevant validation commands listed below.
7. Report what changed, what was verified, any remaining risks, and any manual deployment or dashboard steps.

Do not refactor broad areas of the app while fixing a narrow issue. Do not hide failing checks; report them with the exact command and failure.

---

## Validation Commands

Use the commands that exist in `package.json`. Pick the focused command first when one matches the work, then run the broader checks when the change is meaningful or security-sensitive.

Core validation:

- `npm run test:unit`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

Supabase and route validation:

- `npm run verify:supabase`
- `npm run verify:routes`
- `npm run verify:smoke`
- `npm run verify:roles`

Focused checks:

- `npm run test:licenses`
- `npm run test:buyer-onboarding`
- `npm run verify:artist-onboarding`
- `npm run verify:buyer-onboarding`
- `npm run validate:env`

E2E and local helpers:

- `npm run e2e:one`
- `npm run e2e`
- `npm run e2e:install`
- `npm run dev`
- `npm run chrome:local`

If a command is unavailable in a future branch, inspect `package.json` and use the closest available equivalent. For security fixes, prefer running `npm run test:unit`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` before asking to stage.

---

## GitHub Branch and PR Workflow

- Work on feature branches for implementation work.
- Do not push directly to `main`.
- Do not force-push unless the user explicitly asks and the risk is understood.
- Do not use `git add .`.
- Stage only the files or hunks the user explicitly approves.
- Keep unrelated local changes unstaged and untouched.
- Do not reset, stash, discard, or overwrite unrelated work without explicit approval.
- Prefer small commits with clear messages.
- Use pull requests for review before merging to `main`.
- For security fixes, keep each remediation isolated so it can be reviewed, deployed, and rolled back independently.

---

## Netlify Deployment Rules

- Netlify is the deployment platform for this project.
- Production deploys must come from the approved production branch and production Netlify context.
- Use Deploy Previews or branch deploys for staging, Stripe test-mode checkout, and production-like verification.
- Keep production and staging environment variables separate where required.
- `NEXT_PUBLIC_APP_URL` must match the deployed environment when absolute URLs are generated.
- Production must not use Stripe test keys.
- Deploy Preview and branch deploy Stripe webhook URLs may differ from production; verify the webhook endpoint for the exact environment being tested.
- Do not assume a local or preview URL is allowed by Supabase Auth until its redirect URL has been configured.
- Netlify password-protected staging requests may require a shared site cookie for route verification tooling; do not confuse Netlify 401 responses with application authorization results.

---

## Supabase Authorization and Security Rules

- `public.user_profiles.role` is the canonical application role for production authorization.
- Do not trust `user_metadata.role` or `app_metadata.role` for privileged authorization.
- Server actions and API routes must re-check authorization server-side; UI, layout, and middleware checks are not enough for mutations.
- Admin-only actions must verify admin authority before using service-role or privileged clients.
- Buyer-only endpoints must verify the current authenticated user is a buyer before accessing buyer-private data.
- Artist-only endpoints must verify the current authenticated user is an artist before accessing artist-private data.
- Use the authenticated SSR Supabase client when RLS should enforce the current user's access.
- Use the service-role client only for trusted server-side workflows that require bypassing RLS, and only after explicit authorization has succeeded.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or privileged query results to the browser.
- Do not rely on client-supplied user IDs, roles, prices, storage paths, order IDs, or ownership claims when the server can derive them from the session or database.
- Agreement PDFs, full audio, and private user/order data must be authorized and delivered through signed or server-mediated access.

---

## Supabase Migration Rules

- Add schema, policy, trigger, function, and storage changes as migrations under `supabase/migrations`.
- For production, provide exact SQL for manual Supabase SQL Editor application when requested.
- Make migrations idempotent where practical.
- Do not apply migrations to production without explicit user approval.
- Do not alter existing production data unless the user explicitly approves the data operation.
- Avoid broad `auth.uid() is null` trusted bypasses. If a privileged path is needed, use explicit `auth.role() = 'service_role'`, verified admin checks, or narrowly scoped `SECURITY DEFINER` functions.
- Protect moderation and role fields with database-level safeguards, not only application code.
- Include RLS `WITH CHECK` policies for write paths where ownership or allowed state transitions matter.
- After migration work, run `npm run verify:supabase` when safe and relevant.

---

## Stripe Rules

- Keep Stripe test and live modes strictly separated.
- Production must use live Stripe keys and live webhook secrets only.
- Staging, Deploy Previews, and local checkout tests must use Stripe test-mode keys and test webhook secrets.
- Never print or expose `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or other secrets.
- Checkout pricing must be derived from trusted server/database data, never from client-controlled amounts.
- Checkout creation must re-check authenticated buyer access, approved track status, active license options, currency, and amount.
- Stripe webhooks must verify signatures using `STRIPE_WEBHOOK_SECRET`.
- Do not fulfill orders from the success page alone; fulfillment must come from verified webhook processing.
- Webhook processing must be idempotent and must reject amount/currency mismatches.
- Generated licenses and order fulfillment must happen only after verified payment.

---

## Autonomous Actions Permitted

Without asking first, it is acceptable to:

- Inspect files, routes, services, migrations, tests, and static configuration.
- Run read-only git status/diff/show/log commands.
- Run local tests, typecheck, lint, build, and verification scripts.
- Make focused local code edits that directly implement the user's requested fix.
- Add focused tests and documentation for the requested change.
- Generate local-only artifacts for inspection when the task requests them, as long as they are not staged or uploaded.

Always keep the user informed when a task is long-running or security-sensitive.

---

## Actions Requiring Explicit Approval

Ask for explicit approval before:

- Pushing to any remote branch.
- Committing, unless the user has asked for that commit.
- Staging files or hunks, unless the user has asked for staging.
- Applying Supabase SQL or changing production data.
- Changing Stripe dashboard settings, webhook endpoints, or live/test credentials.
- Running destructive commands such as `rm`, `git reset`, `git checkout --`, database deletes, or storage deletes.
- Force-pushing, rewriting history, or amending commits already pushed to a shared branch.
- Regenerating existing fulfilled agreements.
- Touching production storage objects or performing live checkout/payment actions.

---

## Security Review Checklist

Before launch-sensitive changes, inspect the relevant surface for:

- Server-side authentication and role checks on every protected API route and server action.
- RLS policies, grants, triggers, and `SECURITY DEFINER` helper functions.
- Service-role usage after authorization, never before.
- Buyer, artist, admin, and unauthenticated route boundaries.
- Order ownership and agreement download authorization.
- Storage bucket privacy, signed URL lifetime, and path validation.
- Stripe checkout price trust, approved-track checks, active-license checks, webhook signature verification, and idempotency.
- Input validation for forms, uploads, search/filter fields, admin notes, contact forms, and webhook metadata.
- Open redirects, path traversal, unsafe URL handling, XSS, raw HTML interpolation, and unbounded user-controlled strings.
- Rate limiting or abuse controls for contact, checkout, upload URL generation, auth, downloads, and admin actions.
- Secret boundaries between server-only and `NEXT_PUBLIC_*` variables.
- Security headers and Netlify headers/redirect configuration where applicable.

Categorize findings as:

- Critical: do not launch.
- High: fix before enabling real payments.
- Medium: fix before public beta.
- Low: hardening or polish.

---

## Standard Completion Report

When finishing a task, report the highest-signal facts:

- Files changed.
- Migrations added or SQL that must be applied.
- API routes, server actions, or policies changed.
- Security and authorization behavior affected.
- Commands run and results.
- Git status and staging/commit state when relevant.
- Manual Netlify, Supabase, Stripe, DNS, or email-provider steps still required.
- Remaining risks, known limitations, or follow-up recommendations.

For commit/staging requests, include the exact staged files, commit hash, `git show --stat --oneline HEAD`, and confirmation that unrelated files remain unstaged when applicable.

---

# The Sync Exchange brand asset rules

All approved brand assets live in:

/public/brand/the-sync-exchange/

## Logos
- /public/brand/the-sync-exchange/logos/Primary_Logo_Dark_Mode.png
- /public/brand/the-sync-exchange/logos/Primary_Logo_Light_Mode.png
- /public/brand/the-sync-exchange/logos/Icon_Gold.png

## App icons
- /public/brand/the-sync-exchange/app/AppIcon_1024.png
- /public/brand/the-sync-exchange/app/AppIcon_512.png
- /public/brand/the-sync-exchange/app/AppIcon_256.png

## Watermark
- /public/brand/the-sync-exchange/watermark/Watermark.png

## Usage rules
- Use Primary_Logo_Dark_Mode.png on dark backgrounds and dark-mode surfaces
- Use Primary_Logo_Light_Mode.png on light backgrounds and light-mode surfaces
- Use Icon_Gold.png for compact icon placements
- Use AppIcon files for app and metadata icon references where appropriate
- Use Watermark.png for licensing, export, delivery, confirmation, and downloaded asset experiences
- Do not invent new logo treatments
- Do not redraw the logo using text
- Do not crop, stretch, rotate, recolor, or restyle the logo assets
- Preserve aspect ratio
- Remove any mismatched background containers, cards, pills, shadows, borders, or boxed wrappers behind logo images if they make the logo look incorrect
