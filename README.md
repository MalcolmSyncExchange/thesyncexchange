# The Sync Exchange MVP

Production-shaped MVP for a premium sync licensing marketplace built with Next.js 14, TypeScript, Tailwind CSS, Supabase, and Stripe scaffolding.

## Implementation Plan

1. Create the app shell, route groups, theming, shared UI primitives, and core utilities.
2. Build the public marketing pages plus role-specific artist, buyer, and admin experiences.
3. Add Supabase schema, typed models, demo seed data, and auth/session scaffolding.
4. Add Stripe checkout session creation, order persistence, webhook fulfillment, and agreement placeholders.
5. Document setup, deployment, and the next production tasks.

## Files and Folders Created

- `app/` App Router route groups for marketing, auth, onboarding, artist, buyer, admin, API handlers, and confirmation pages
- `components/` Reusable layout, catalog, audio, form, dashboard, table, and UI primitives
- `lib/` Environment helpers, demo data, license placeholder generation, and shared utilities
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

5. Open [http://localhost:3000](http://localhost:3000).

## Demo Mode

- `SYNC_EXCHANGE_DEMO_MODE=true` keeps the app runnable without live Supabase or Stripe credentials.
- Login/signup forms create a cookie-backed demo session so protected role routes can be explored locally.
- Buyer checkout flows route to a confirmation placeholder when Stripe is not configured in demo mode.

## Supabase Notes

- The initial schema is in [`supabase/migrations/0001_initial_schema.sql`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/migrations/0001_initial_schema.sql).
- Demo SQL seeds start in [`supabase/seeds/seed.sql`](/Users/malcolmw/Documents/The Sync Exchange.2/supabase/seeds/seed.sql).
- The app currently uses in-app demo data for the UI. Replacing that with live Supabase queries is the next integration step.

## Stripe Notes

- Checkout scaffold lives at [`app/api/checkout/route.ts`](/Users/malcolmw/Documents/The Sync Exchange.2/app/api/checkout/route.ts).
- Stripe server helpers live at [`services/stripe/server.ts`](/Users/malcolmw/Documents/The Sync Exchange.2/services/stripe/server.ts).
- Webhook fulfillment lives at [`app/api/webhooks/stripe/route.ts`](/Users/malcolmw/Documents/The Sync Exchange.2/app/api/webhooks/stripe/route.ts).
- Agreement artifact generation lives at [`services/agreements/server.ts`](/Users/malcolmw/Documents/The Sync Exchange.2/services/agreements/server.ts).
- Authenticated agreement delivery lives at [`app/api/orders/[orderId]/agreement/route.ts`](/Users/malcolmw/Documents/The Sync Exchange.2/app/api/orders/[orderId]/agreement/route.ts).
- Agreement generation is intentionally marked for legal review before production release.
- Local webhook forwarding can be tested with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## Buyer/Admin QA Flow

1. Create `.env.local` from `.env.example` and set:
   - `SYNC_EXCHANGE_DEMO_MODE=false`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
2. Apply the Supabase migrations, including the agreements storage bucket.
3. Start the app:

```bash
npm run dev
```

4. In a second terminal, forward Stripe events locally:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

5. Artist QA:
   - sign in as an artist
   - submit a track
   - confirm the submission reaches admin review
6. Admin QA:
   - approve the submitted track
   - open Admin Orders and verify new paid orders move to `fulfilled` once an agreement artifact is generated
   - use the agreement link on the order card to inspect the generated document
7. Buyer QA:
   - sign in as a buyer
   - open an approved track
   - start checkout and complete Stripe Checkout with a test card such as `4242 4242 4242 4242`
   - confirm the buyer order page shows progression from `pending` to `fulfilled`
   - open the generated agreement from the buyer order card or confirmation page

If webhook delivery is delayed, the confirmation page also attempts a session-based sync when `session_id` is present on the return URL.

## Vercel Deployment Notes

1. Import the repository into Vercel.
2. Add the environment variables from `.env.local`.
3. Set the production app URL in `NEXT_PUBLIC_APP_URL`.
4. Connect Supabase and Stripe secrets in the Vercel project settings.
5. Configure Stripe webhook delivery to `/api/webhooks/stripe`.

## Current MVP Coverage

- Public marketing pages with premium positioning
- Login, signup, password reset views, and role-aware redirects
- Artist dashboard, catalog, submission form, rights holders, payout settings, and public profile
- Buyer dashboard, searchable catalog, track detail, favorites, checkout scaffold, and order history
- Admin dashboard, review queue, user/track/order management, compliance queue, and analytics overview
- Supabase schema plus seed starter
- Stripe route scaffold and agreement placeholder flow
- Dark mode and light mode

## Still Stubbed or Mocked

- Live Supabase queries, storage uploads, and row-level auth wiring
- Real Stripe checkout pricing and webhook fulfillment
- Generated PDFs or signed legal agreements
- Email delivery, notifications, and team invites
- Production analytics instrumentation
- Full SQL seed coverage for all 20 demo tracks

## Highest-Priority Next Tasks

1. Replace `lib/demo-data.ts` reads with real Supabase queries and mutations.
2. Connect the submit music form to Supabase Storage and server actions.
3. Persist orders and favorites in the database with authenticated buyer context.
4. Finalize legal agreement templates and Stripe fulfillment.
5. Add automated tests for route protection, form validation, and checkout behavior.
