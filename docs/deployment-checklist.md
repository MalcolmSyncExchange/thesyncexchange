# Deployment Checklist

Use this checklist before a real deployment cutover.

## Environment variables

Set all of these in the deployment platform:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_AVATARS_BUCKET`
- `NEXT_PUBLIC_SUPABASE_COVER_ART_BUCKET`
- `NEXT_PUBLIC_SUPABASE_TRACK_AUDIO_BUCKET`
- `NEXT_PUBLIC_SUPABASE_TRACK_PREVIEWS_BUCKET`
- `NEXT_PUBLIC_SUPABASE_AGREEMENTS_BUCKET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- optional:
  - `SENTRY_DSN`
  - `SENTRY_ENVIRONMENT`

Production expectations:

- `NEXT_PUBLIC_APP_URL` must be the public origin: `https://thesyncexchange.com`
- production Stripe keys must be mode-matched:
  - `STRIPE_SECRET_KEY=sk_live_...`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...`
- `STRIPE_WEBHOOK_SECRET` must come from the production webhook endpoint, not from the Stripe CLI
- never leave legacy GoTrue variables in the deployment platform:
  - `GOTRUE_JWT_DEFAULT_GROUP_NAME`
  - `GOTRUE_JWT_ADMIN_GROUP_NAME`

## Supabase

- run `npm run setup:storage` against the target project
- run `npm run seed:license-types` against the target project environment
- apply:
  - [`/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql)
- confirm migration `0013_generated_licenses` is live so paid checkouts can persist one finalized agreement row per order
- confirm readiness is not blocked:

```bash
curl -s https://your-domain.example/api/health/readiness
```

## Auth email delivery

Supabase Dashboard -> **Authentication -> URL Configuration**

1. Set **Site URL** to:
   - `https://thesyncexchange.com`
2. Add **Additional Redirect URLs**:
   - `https://thesyncexchange.com/auth/confirm`
   - `https://thesyncexchange.com/auth/email-action`
   - `https://thesyncexchange.com/reset-password`
   - `https://thesyncexchange.com/login`
   - `http://127.0.0.1:3000/auth/confirm`
   - `http://127.0.0.1:3000/auth/email-action`
   - `http://127.0.0.1:3000/reset-password`
   - `http://127.0.0.1:3000/login`
3. If you use deployment previews, add the provider-specific preview wildcard recommended by Supabase:
   - Vercel example: `https://*-your-team-slug.vercel.app/**`
   - Netlify example: `https://**--your-site.netlify.app/**`

Supabase Dashboard -> **Authentication -> Email -> SMTP Settings**

1. Enable **Custom SMTP**
2. Configure Resend:
   - **Host:** `smtp.resend.com`
   - **Port:** `465` (SMTPS) or `587` (STARTTLS)
   - **Username:** `resend`
   - **Password:** your Resend API key
   - **Sender Email:** `no-reply@thesyncexchange.com`
   - **Sender Name:** `The Sync Exchange`
3. Save, then send a real password-reset test

Resend requirements:

- verify the sending domain used by `no-reply@thesyncexchange.com`
- confirm SPF and DKIM are green before launch
- keep sender email aligned with the verified domain

Template setup:

- paste the hardened branded templates from:
  - [`/Users/malcolmw/Documents/The Sync Exchange.2/docs/supabase-auth-email-templates.md`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/docs/supabase-auth-email-templates.md)

Final auth checks:

- test password reset against a non-team address after SMTP is configured
- test signup confirmation against a non-team address after SMTP is configured
- confirm the interstitial route works:
  - `/auth/email-action`

## Stripe

Deployment platform:

- set live or test keys in the deployment platform
- make sure the secret and publishable keys are from the same mode

Stripe Dashboard -> **Developers -> Webhooks**

1. Create or update the production endpoint:
   - `https://thesyncexchange.com/api/webhooks/stripe`
2. Subscribe to the events used by the app:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `charge.refunded`
3. Reveal the signing secret and copy it into:
   - `STRIPE_WEBHOOK_SECRET`

Before cutover:

- confirm the production deployment uses `sk_live_...` + `pk_live_...`
- do not reuse the Stripe CLI signing secret in production
- confirm the deployed webhook endpoint returns `200` on a Stripe test delivery
- confirm the webhook updates both `orders` and `generated_licenses` before calling the flow launch-ready

## Domain and auth callbacks

- set `NEXT_PUBLIC_APP_URL` to the public domain
- verify Supabase auth redirect/callback URLs include:
  - `/auth/confirm`
  - `/login`
  - `/reset-password`
  - onboarding/workspace return paths if required by your project config

## Storage audit

- `avatars` public
- `cover-art` public
- `track-previews` public
- `track-audio` private
- `agreements` private

## Agreement generation audit

- confirm a paid order creates exactly one row in `public.generated_licenses`
- confirm `generated_licenses.pdf_storage_path` points to a private object in the `agreements` bucket
- confirm `generated_licenses.terms_snapshot_json` is populated
- confirm buyer download works only through the private agreement route
- confirm admin can retry failed agreement generation from the orders screen

## Admin bootstrap

Create or elevate the initial admin account:

```bash
ADMIN_BOOTSTRAP_PASSWORD='your-strong-password' npm run create:admin
```

## Smoke tests after deploy

```bash
npm run validate:env
npm run verify:supabase
ROUTE_VERIFY_REQUIRE_EXISTING=1 npm run verify:smoke
curl -s https://your-domain.example/api/health/readiness
```

## Manual launch QA

Run:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/docs/happy-path-qa.md`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/docs/happy-path-qa.md)
- [`/Users/malcolmw/Documents/The Sync Exchange.2/docs/production-smoke-test.md`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/docs/production-smoke-test.md)
- [`/Users/malcolmw/Documents/The Sync Exchange.2/docs/automated-license-generation.md`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/docs/automated-license-generation.md)

before opening the marketplace to real users.
