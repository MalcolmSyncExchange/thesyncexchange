# Browser E2E

The repo now includes a first browser E2E scaffold for the real marketplace path:

- artist submits a track
- admin approves it
- buyer reaches hosted Stripe Checkout
- the exact checkout order is completed through a signed local webhook event
- a generated license agreement becomes downloadable for buyer/admin and is rejected for the wrong buyer

## Files

- [`/Users/malcolmw/Documents/The Sync Exchange.2/playwright.config.mjs`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/playwright.config.mjs)
- [`/Users/malcolmw/Documents/The Sync Exchange.2/e2e/marketplace-happy-path.spec.mjs`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/e2e/marketplace-happy-path.spec.mjs)

## Install

If `@playwright/test` is not already present locally, install it first:

```bash
npm install -D @playwright/test
```

Then install the local browser runtime:

```bash
npm run e2e:install
```

## Required environment

The spec reads these variables:

- `E2E_BASE_URL` (defaults to `http://127.0.0.1:3000`)
- `E2E_ARTIST_EMAIL`
- `E2E_ARTIST_PASSWORD`
- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`
- `E2E_BUYER_EMAIL`
- `E2E_BUYER_PASSWORD`
- `E2E_WRONG_BUYER_EMAIL`
- `E2E_WRONG_BUYER_PASSWORD`
- `E2E_COVER_ART_PATH`
- `E2E_AUDIO_PATH`
- `E2E_PREVIEW_AUDIO_PATH`
- `STRIPE_WEBHOOK_SECRET`

The spec also falls back to the seeded QA account env vars:

- `QA_ARTIST_EMAIL`
- `QA_ADMIN_EMAIL`
- `QA_BUYER_EMAIL`
- `QA_WRONG_BUYER_EMAIL`
- `QA_TEST_ACCOUNT_PASSWORD`

If the media fixture env vars are not set, the spec now falls back to repo-local fixtures:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/tests/fixtures/cover-art.png`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/tests/fixtures/cover-art.png)
- [`/Users/malcolmw/Documents/The Sync Exchange.2/tests/fixtures/full-track.wav`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/tests/fixtures/full-track.wav)
- [`/Users/malcolmw/Documents/The Sync Exchange.2/tests/fixtures/preview-track.wav`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/tests/fixtures/preview-track.wav)

## Recommended local setup

1. Seed QA accounts:

```bash
QA_TEST_ACCOUNT_PASSWORD='your-strong-local-password' npm run seed:qa-accounts
```

2. Export the E2E fixture paths if you want to override the built-in repo fixtures:

```bash
export E2E_COVER_ART_PATH='/absolute/path/to/cover-art.png'
export E2E_AUDIO_PATH='/absolute/path/to/full-track.wav'
export E2E_PREVIEW_AUDIO_PATH='/absolute/path/to/preview-track.mp3'
```

3. Start the app:

```bash
npm run dev
```

4. Start Stripe forwarding:

```bash
stripe listen --forward-to 127.0.0.1:3000/api/webhooks/stripe
```

5. Run the single marketplace spec:

```bash
E2E_REUSE_EXISTING_SERVER=true npm run e2e:one
```

6. Run the full E2E set:

```bash
E2E_REUSE_EXISTING_SERVER=true npm run e2e
```

## Notes

- The test is intentionally serial because it exercises one evolving marketplace record from submission to purchase.
- The test uses stable selectors where they matter:
  - login form
  - track submission form
  - publish button
  - admin approve action
  - checkout form/button
- The browser flow still verifies that buyer checkout reaches hosted Stripe Checkout.
- The final payment completion is triggered by a signed local webhook event for the exact order/session that the app created. This keeps the E2E deterministic without depending on Stripe's hosted card-entry UI remaining automatable in headless Chrome.
- The webhook phase now expects `public.generated_licenses` to exist. If migration `0013_generated_licenses.sql` has not been applied yet, the spec should fail with a clear `generated_licenses is unavailable` message instead of silently falling back to legacy order-only agreement behavior.
- If the spec skips immediately, inspect the skip message for missing env vars or fixture files.
