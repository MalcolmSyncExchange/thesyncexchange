# Happy Path QA

This checklist verifies the real marketplace flow:

artist signup/onboarding -> upload -> admin approval -> buyer purchase -> webhook fulfillment -> agreement delivery

## Prerequisites

- `.env.local` contains live local-development credentials:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000`
- Supabase storage buckets created with:

```bash
npm run setup:storage
```

- Supabase SQL finalized with:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql)

- readiness is not blocked:

```bash
curl -s http://127.0.0.1:3000/api/health/readiness
```

- QA accounts seeded:

```bash
QA_TEST_ACCOUNT_PASSWORD='your-strong-local-password' npm run seed:qa-accounts
```

## Test accounts

Defaults are documented in:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/docs/test-accounts.md`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/docs/test-accounts.md)

At minimum you need:
- artist
- buyer
- wrong buyer
- admin

## Local services

Start the app:

```bash
npm run dev
```

Start Stripe forwarding in a second terminal:

```bash
stripe listen --forward-to 127.0.0.1:3000/api/webhooks/stripe
```

## Flow

### 1. Artist sign in

1. Open `/login`
2. Sign in as the artist QA account

Expected:
- lands in the artist workspace or artist onboarding
- no redirect loop

Failure signals:
- bounced back to `/login`
- role mismatch redirect
- onboarding form errors before submission

### 2. Artist onboarding + avatar upload

1. If onboarding is incomplete, finish artist onboarding
2. Upload an avatar in the basics step

Expected:
- onboarding saves
- avatar replacement works without crashing
- artist reaches the workspace

Failure signals:
- upload error message mentioning buckets or unauthorized access
- avatar appears to save but disappears on refresh

### 3. Track submission

1. Open `/artist/submit`
2. Upload:
   - cover art
   - full audio
   - preview audio
3. Publish for review

Expected:
- “Track submitted for review.”
- track persists with `pending_review`
- no orphan-asset cleanup error

Failure signals:
- form accepts files locally but submit fails server-side
- success message appears but track is missing in artist/admin surfaces

### 4. Admin review + approval

1. Sign in as admin
2. Open `/admin/review-queue`
3. Find the submitted track
4. Approve it

Expected:
- track moves out of the pending queue
- buyer catalog becomes able to surface the track
- admin track detail still renders

Failure signals:
- approve button does nothing
- track remains invisible to buyer after approval

### 5. Buyer catalog discovery

1. Sign in as buyer
2. Open `/buyer/catalog`
3. Find the approved track
4. Open the track detail page

Expected:
- track appears in catalog
- preview audio is playable
- checkout button is visible

Failure signals:
- approved track does not appear
- buyer sees full audio when preview is missing
- missing license options

### 6. Buyer checkout

1. Open `/buyer/checkout/[trackSlug]`
2. Continue to Stripe Checkout
3. Use test card:
   - `4242 4242 4242 4242`
   - any future expiry
   - any CVC

Expected:
- pending order created exactly once
- Stripe Checkout loads
- success returns to `/license-confirmation/[orderId]`

Failure signals:
- duplicate pending orders for one click
- track/license mismatch on checkout return
- canceled checkout leaves unclear UI

### 7. Webhook fulfillment

Expected after successful payment:
- `orders.status` transitions from `pending` -> `paid` -> `fulfilled`
- webhook metadata updates
- admin order shows recent activity

Failure signals:
- confirmation page stuck on pending
- webhook 500s in terminal
- order shows paid but no agreement progress

Logs to inspect:
- local Next terminal
- Stripe CLI terminal
- admin order card error surface

### 8. Agreement generation + buyer delivery

1. Wait on the confirmation page or open `/buyer/orders`
2. Open the agreement link

Expected:
- agreement PDF is generated
- authorized buyer gets signed access
- wrong buyer receives `403`
- unauthenticated request receives `401`
- admin can also access

Failure signals:
- agreement link shown before document is truly ready
- download route returns `409` after payment has settled for too long
- agreement generation error appears in admin without recovery guidance

### 9. Admin order visibility

1. Open `/admin/orders`
2. Confirm the order shows:
   - checkout created
   - paid
   - agreement generated
   - fulfilled

Expected:
- order activity/history visible
- no false “agreement ready” messaging if delivery is blocked

## Helpful verification commands

```bash
npm run validate:env
npm run verify:supabase
ROUTE_VERIFY_REQUIRE_EXISTING=1 npm run verify:smoke
curl -s http://127.0.0.1:3000/api/health/readiness
```

If you already have valid session cookies:

```bash
ARTIST_COOKIE_HEADER='...'
BUYER_COOKIE_HEADER='...'
ADMIN_COOKIE_HEADER='...'
WRONG_BUYER_COOKIE_HEADER='...'
ORDER_ID='...'
npm run verify:roles
```

## Where to inspect failures

- Next.js server terminal
- Stripe CLI output
- `/admin/orders`
- `/license-confirmation/[orderId]`
- `/buyer/orders`
- `/api/health/readiness`
