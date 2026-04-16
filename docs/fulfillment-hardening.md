# Fulfillment and Storage Hardening

This pass tightened the marketplace’s operational behavior around uploads, orders, webhooks, and agreement delivery.

## What is hardened in code

### Upload replacement and cleanup

- avatar replacement deletes the superseded asset only after the new one is stored successfully
- track edit replacement now cleans up superseded:
  - cover art
  - preview audio
  - full audio
  - waveform assets
- storage cleanup deduplicates paths and logs bucket removal failures instead of failing silently

### Track update rollback

The artist track update flow now snapshots and restores:
- the track row
- rights holders
- license options

If a mutation fails after assets are uploaded, the app:
- deletes the newly uploaded assets
- restores the original DB state
- returns a human-readable error

### Webhook and fulfillment safety

- duplicate Stripe webhook events are deduped through order activity dedupe keys
- Stripe fulfillment persists:
  - checkout session id
  - payment intent id
  - webhook event metadata
- webhook failure metadata is stored on the order when the schema supports it
- agreement generation runs only when the order is paid and not already fulfilled/refunded

### Agreement delivery safety

- no inferred agreement path fallback remains
- if the secure agreement path is missing, the delivery route returns `409`
- unauthorized users receive:
  - `401` unauthenticated
  - `403` wrong buyer
- buyer/admin order UI only shows the agreement link when secure delivery is truly ready

## Operational behaviors to watch

### Payment succeeded, agreement failed

Expected admin symptoms:
- admin order card shows a fulfillment attention warning
- `agreement_generation_error` is surfaced
- buyer sees a clear non-success state instead of a false download link

### Payment succeeded, delivery blocked by degraded mode

Expected symptoms:
- agreement may be generated
- buyer/admin UI should say delivery is blocked
- readiness should remain `degraded` or `blocked`

### Storage setup mismatch

If uploads fail with bucket or policy errors:
1. run `npm run setup:storage`
2. apply the finalization SQL bundle
3. re-check `/api/health/readiness`

## Remaining manual ops

- apply the finalization SQL bundle in Supabase
- verify Stripe webhook endpoint configuration in the Stripe dashboard
- run the real happy-path QA flow locally
