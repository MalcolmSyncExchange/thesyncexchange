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

## Supabase

- run `npm run setup:storage` against the target project
- run `npm run seed:license-types` against the target project environment
- apply:
  - [`/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql)
- confirm readiness is not blocked:

```bash
curl -s https://your-domain.example/api/health/readiness
```

## Stripe

- set live or test keys in the deployment platform
- create/update webhook endpoint to:
  - `https://your-domain.example/api/webhooks/stripe`
- subscribe at minimum to:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `charge.refunded`

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

before opening the marketplace to real users.
