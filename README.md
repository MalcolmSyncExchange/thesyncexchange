# The Sync Exchange MVP

Production-shaped MVP for a premium sync licensing marketplace built with Next.js 14, TypeScript, Tailwind CSS, Supabase, and Stripe scaffolding.

## Implementation Plan

1. Create the app shell, route groups, theming, shared UI primitives, and core utilities.
2. Build the public marketing pages plus role-specific artist, buyer, and admin experiences.
3. Add Supabase schema, typed models, demo seed data, and auth/session scaffolding.
4. Add Stripe checkout session creation, order persistence, webhook fulfillment, and agreement delivery.
5. Document setup, deployment, and the next production tasks.

## Files and Folders Created

- `app/` App Router route groups for marketing, auth, onboarding, artist, buyer, admin, API handlers, and confirmation pages
- `components/` Reusable layout, catalog, audio, form, dashboard, table, and UI primitives
- `lib/` Environment helpers, demo data, agreement/document generation, and shared utilities
- `services/` Auth actions and Supabase client helpers
- `hooks/` Catalog filtering hook
- `types/` Shared application models and database typing placeholder
- `supabase/migrations/` Initial SQL schema
- `supabase/seeds/` Demo seed SQL starter
- `.env.example` Environment variable template

## Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- shadcn-style component setup
- Supabase auth/database/storage scaffold
- Stripe checkout scaffold
- React Hook Form + Zod

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env.local
```

3. Optional: set real Supabase and Stripe keys in `.env.local`.

4. Start the app:

```bash
npm run dev
```

5. Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

Useful verification commands:

```bash
npm run validate:env
npm run verify:supabase
npm run create:admin
npm run seed:qa-accounts
npm run typecheck
npm run build
ROUTE_VERIFY_REQUIRE_EXISTING=1 npm run verify:smoke
npm run verify:roles
curl -s http://127.0.0.1:3000/api/health/readiness
```

## Demo Mode

- `SYNC_EXCHANGE_DEMO_MODE=true` keeps the app runnable without live Supabase or Stripe credentials.
- Login/signup forms create a cookie-backed demo session so protected role routes can be explored locally.
- Buyer checkout flows route to a confirmation placeholder when Stripe is not configured in demo mode.

## Supabase Notes

- The initial schema is in [`supabase/migrations/0001_initial_schema.sql`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/migrations/0001_initial_schema.sql).
- Demo SQL seeds start in [`supabase/seeds/seed.sql`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/seeds/seed.sql).
- The current storage and fulfillment hardening migrations are:
  - [`supabase/migrations/0010_order_fulfillment_hardening.sql`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/migrations/0010_order_fulfillment_hardening.sql)
  - [`supabase/migrations/0011_storage_object_policies.sql`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/migrations/0011_storage_object_policies.sql)
  - [`supabase/migrations/0012_avatar_storage_path.sql`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/migrations/0012_avatar_storage_path.sql)
- Storage bucket definitions and operational notes live in:
  - [`supabase/storage-plan.md`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/storage-plan.md)
  - [`supabase/storage-setup.md`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/storage-setup.md)
  - [`supabase/storage-policies.sql`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/storage-policies.sql)
  - [`supabase/manual-apply.md`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply.md)
  - [`docs/supabase-finalization.md`](/Users/malcolmw/Documents/The Sync Exchange.2/docs/supabase-finalization.md)
- Create or verify the required buckets with:

```bash
npm run setup:storage
```

- Diagnose whether the connected Supabase project is ready for the finalization bundle:

```bash
npm run verify:supabase
```

## Stripe Notes

- Checkout scaffold lives at [`app/api/checkout/route.ts`](/Users/malcolmw/Documents/The Sync Exchange.2/app/api/checkout/route.ts).
- Stripe server helpers live at [`services/stripe/server.ts`](/Users/malcolmw/Documents/The Sync Exchange.2/services/stripe/server.ts).
- Webhook fulfillment lives at [`app/api/webhooks/stripe/route.ts`](/Users/malcolmw/Documents/The Sync Exchange.2/app/api/webhooks/stripe/route.ts).
- Agreement artifact generation lives at [`services/agreements/server.ts`](/Users/malcolmw/Documents/The Sync Exchange.2/services/agreements/server.ts).
- Authenticated agreement delivery lives at [`app/api/orders/[orderId]/agreement/route.ts`](/Users/malcolmw/Documents/The Sync Exchange.2/app/api/orders/[orderId]/agreement/route.ts).
- Agreement generation now creates a private PDF artifact and stores it in the `agreements` bucket. Final legal language is still marked for review before production release.
- Readiness diagnostics live at [`app/api/health/readiness/route.ts`](/Users/malcolmw/Documents/The Sync Exchange.2/app/api/health/readiness/route.ts). This route reports whether the storage buckets, `0010` fulfillment metadata, `0012` avatar path column, and `order_activity_log` are actually live.
- Local webhook forwarding can be tested with the Stripe CLI:

```bash
stripe listen --forward-to 127.0.0.1:3000/api/webhooks/stripe
```

- A lightweight local Stripe verification page is available at [http://127.0.0.1:3000/test-checkout](http://127.0.0.1:3000/test-checkout).

## One-Time Admin Bootstrap

Use the server-side bootstrap script to create or elevate the initial admin account for:

- `malcolm@thesyncexchange.com`

This script:

- creates the user through Supabase Auth using the service-role key
- confirms the email immediately
- updates existing auth metadata if the user already exists
- upserts `public.user_profiles` with `role = 'admin'`
- stays idempotent

Set the password only through environment variables. Do not commit it.

Recommended one-time run from your shell:

```bash
ADMIN_BOOTSTRAP_PASSWORD='your-initial-password-here' npm run create:admin
```

Optional behavior for an already-existing account:

```bash
ADMIN_BOOTSTRAP_PASSWORD='your-initial-password-here' ADMIN_BOOTSTRAP_RESET_PASSWORD=true npm run create:admin
```

If you prefer `.env.local`, set these temporarily:

- `ADMIN_BOOTSTRAP_EMAIL=malcolm@thesyncexchange.com`
- `ADMIN_BOOTSTRAP_FULL_NAME=Malcolm`
- `ADMIN_BOOTSTRAP_PASSWORD=...`
- `ADMIN_BOOTSTRAP_RESET_PASSWORD=false`

After the script succeeds:

1. remove `ADMIN_BOOTSTRAP_PASSWORD` from `.env.local` or unset it in your shell
2. sign in normally at `/login`

Important:

- if `npm run verify:supabase` reports `apply_foundation_bootstrap`, run that SQL first
- the admin role is enforced from `public.user_profiles.role` and checked throughout the app with `public.is_admin()`
- the script never exposes the service-role key or password to the browser

## Buyer/Admin QA Flow

Detailed operator docs now live in:

- [`docs/happy-path-qa.md`](/Users/malcolmw/Documents/The Sync Exchange.2/docs/happy-path-qa.md)
- [`docs/e2e.md`](/Users/malcolmw/Documents/The Sync Exchange.2/docs/e2e.md)
- [`docs/test-accounts.md`](/Users/malcolmw/Documents/The Sync Exchange.2/docs/test-accounts.md)
- [`docs/fulfillment-hardening.md`](/Users/malcolmw/Documents/The Sync Exchange.2/docs/fulfillment-hardening.md)
- [`docs/deployment-checklist.md`](/Users/malcolmw/Documents/The Sync Exchange.2/docs/deployment-checklist.md)
- [`docs/permissions-and-buckets-audit.md`](/Users/malcolmw/Documents/The Sync Exchange.2/docs/permissions-and-buckets-audit.md)
- [`docs/legal-review-notes.md`](/Users/malcolmw/Documents/The Sync Exchange.2/docs/legal-review-notes.md)

1. Create `.env.local` from `.env.example` and set:
   - `SYNC_EXCHANGE_DEMO_MODE=false`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
2. Validate the environment:

```bash
npm run validate:env
```

3. Diagnose the target Supabase project:

```bash
npm run verify:supabase
```

4. Apply the Supabase SQL that matches that diagnosis:
   - apply the single finalization bundle:
     - [`supabase/manual-apply/2026-04-foundation-bootstrap.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql)
   - the underlying migration chain included in that bundle is:
   - [`supabase/migrations/0008_database_foundation.sql`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/migrations/0008_database_foundation.sql)
   - [`supabase/migrations/0009_order_lifecycle.sql`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/migrations/0009_order_lifecycle.sql)
   - [`supabase/migrations/0010_order_fulfillment_hardening.sql`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/migrations/0010_order_fulfillment_hardening.sql)
   - [`supabase/migrations/0011_storage_object_policies.sql`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/migrations/0011_storage_object_policies.sql)
   - [`supabase/migrations/0012_avatar_storage_path.sql`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/migrations/0012_avatar_storage_path.sql)
5. Create or verify the storage buckets:

```bash
npm run setup:storage
```

6. Start the app:

```bash
npm run dev
```

7. In a second terminal, forward Stripe events locally:

```bash
stripe listen --forward-to 127.0.0.1:3000/api/webhooks/stripe
```

8. Artist QA:
   - sign in as an artist
   - complete onboarding if prompted
   - submit a track with cover art, source audio, preview audio, and metadata
   - confirm the submission reaches admin review
9. Admin QA:
   - approve the submitted track
   - open Admin Orders and verify lifecycle timestamps move through `checkout created` -> `paid` -> `agreement ready` -> `fulfilled`
   - use the agreement link on the order card to inspect the generated document
   - confirm agreement or webhook failures surface on the order card if they occur
10. Buyer QA:
   - sign in as a buyer
   - open an approved track
   - start checkout and complete Stripe Checkout with a test card such as `4242 4242 4242 4242`
   - confirm the buyer order page shows progression from `pending` to `fulfilled`
   - open the generated agreement from the buyer order card or confirmation page
11. Run smoke checks against the already-running local server:

```bash
ROUTE_VERIFY_REQUIRE_EXISTING=1 npm run verify:smoke
curl -s http://127.0.0.1:3000/api/health/readiness
```

12. Optional role-based verification scaffold:

```bash
ARTIST_COOKIE_HEADER='sb-...'
BUYER_COOKIE_HEADER='sb-...'
ADMIN_COOKIE_HEADER='sb-...'
WRONG_BUYER_COOKIE_HEADER='sb-...'
ORDER_ID='your-real-order-id'
npm run verify:roles
```

You can capture those cookie headers from a logged-in browser session or from scripted login requests in your own local QA setup. The script is meant to verify authorization and protected-route behavior once you already have valid role sessions.

If webhook delivery is delayed, the confirmation page also attempts a session-based sync when `session_id` is present on the return URL.

## Pre/Post Migration Behavior

Before the manual SQL bundle is applied:

- avatar uploads still work, but `avatar_path` falls back to `avatar_url` compatibility mode
- payment syncing still works, but order rows will not retain the richer `0010` webhook/document metadata
- agreement PDFs can still be generated, but secure buyer delivery stays blocked until `agreement_path` metadata is live
- admin orders omit recent activity when `order_activity_log` is not live
- readiness diagnostics will report `manualSupabaseActionRequired: true`
- `npm run verify:supabase` will usually recommend either `apply_foundation_bootstrap` or `apply_follow_up_bundle`

After the manual SQL bundle is applied:

- avatar storage paths become first-class persisted fields
- webhook processing errors and agreement generation errors are recorded on orders
- order activity and webhook dedupe are fully enabled
- admin order cards show the richer fulfillment lifecycle and recent activity

## Readiness Status Meaning

`/api/health/readiness` reports one of three states:

- `healthy`
  - buckets are present
  - PostgREST can see the expected public tables
  - avatar path support is live
  - fulfillment/agreement metadata is live
  - order activity auditing is live
- `degraded`
  - the app can still run
  - compatibility fallbacks are active
  - at least one capability is reduced, such as missing `0010`/`0012` columns or stale PostgREST visibility for newly added objects
- `blocked`
  - a core assumption is missing
  - examples: missing env, missing service-role key, missing buckets, or public schema visibility not available through PostgREST

Important: readiness can verify what the app can see through Supabase APIs, but it cannot directly prove whether a table exists in Postgres if PostgREST is not exposing it. Use the SQL checks in [`supabase/manual-apply.md`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply.md) to distinguish:

- table truly missing
- table exists but PostgREST schema cache is stale
- table exists but schema exposure/project credentials are wrong

The readiness payload also includes `tableDiagnostics` for `user_profiles`, `orders`, and `order_activity_log`:

- `visible`: the table is reachable through PostgREST
- `missing_or_stale`: baseline public tables are visible, but this table is not; use the SQL `to_regclass(...)` checks to tell missing migration vs stale cache
- `schema_exposure_blocked`: even baseline public tables are not visible, so credentials / API schema exposure should be checked before blaming migrations
- `unknown`: the API returned an unexpected error and needs direct inspection

## Vercel Deployment Notes

1. Import the repository into Vercel.
2. Add the environment variables from `.env.local`.
3. Set the production app URL in `NEXT_PUBLIC_APP_URL`.
4. Connect Supabase and Stripe secrets in the Vercel project settings.
5. Configure Stripe webhook delivery to `/api/webhooks/stripe`.
6. Run `npm run validate:env`, `npm run typecheck`, and `npm run build` before promoting the release.
7. Apply the latest Supabase migrations and storage object policies before sending production traffic to the deployment.

## Test Accounts

- This repo includes seed/demo data structure, but local and hosted Supabase projects may not share the same credentials.
- Create one artist, one buyer, and one admin account in the connected Supabase project before full QA.
- Recommended QA usage:
  - artist: onboarding + track submission
  - buyer: discovery + checkout + agreement download
  - admin: submission moderation + order visibility
- Agreement authorization matrix to verify locally:
  - unauthenticated -> `401`
  - wrong buyer -> `403`
  - correct buyer -> `200` or `307`
  - admin -> `200` or `307`

## Deployment Checklist

- Configure all required env vars in Vercel and Supabase.
- Apply the database migrations through your normal Supabase deployment workflow.
- Run `npm run setup:storage` against the target Supabase project.
- Apply [`supabase/storage-policies.sql`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/storage-policies.sql) or the matching migration before enabling uploads.
- Configure Stripe webhook delivery to the deployed `/api/webhooks/stripe` route.
- Run one full artist -> admin -> buyer -> webhook -> agreement QA pass against production-like data before launch.

## Current MVP Coverage

- Public marketing pages with premium positioning
- Login, signup, password reset views, and role-aware redirects
- Artist dashboard, catalog, submission form, rights holders, payout settings, and public profile
- Buyer dashboard, searchable catalog, track detail, favorites, checkout scaffold, and order history
- Admin dashboard, review queue, user/track/order management, compliance queue, and analytics overview
- Supabase schema plus seed starter
- Stripe route scaffold and agreement delivery flow
- Dark mode and light mode

## Still Stubbed or Mocked

- Email delivery, notifications, and team invites
- Production analytics instrumentation
- Full SQL seed coverage for all 20 demo tracks

## Highest-Priority Next Tasks

1. Apply the storage/fulfillment/avatar SQL bundle to the connected Supabase project if it is not already live.
2. Run a full artist upload -> admin approval -> buyer purchase -> webhook fulfillment QA pass against the live project.
3. Expand smoke coverage to include authenticated marketplace flows, not just route health.
4. Add email notifications for submission review, payment confirmation, and agreement readiness.
5. Replace the interim PDF legal language with final reviewed contract language once approved.
