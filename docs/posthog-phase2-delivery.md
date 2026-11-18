# Phase 2 Slice 2: delivery reliability contract

This slice extends the single Phase 1 outbox. It does not install a schedule, enable analytics, configure a token, or apply a hosted migration. The follow-on migration is `20261011191427_analytics_delivery_reliability.sql`; historical migrations and event payloads remain unchanged.

## State and retry policy

`pending` is immediately eligible. Claiming atomically changes it to `processing`, increments `attempt_count`, and assigns the existing 30-second lease. A 2xx response means **accepted by the ingestion endpoint only**. The lease holder then marks the row `delivered`; it does not establish reporting visibility. Retryable and unknown failures become `retry_scheduled`; a permanent client rejection or configuration error becomes `held`. The eighth failed attempt becomes `exhausted`. A crashed worker's expired `processing` lease is claimable again with the same event UUID and original occurrence time. An expired lease after attempt eight becomes exhausted. A stale lease cannot acknowledge or fail another worker's claim.

There are at most eight attempts per delivery cycle: immediate, then approximately 1 minute, 5 minutes, 15 minutes, 1 hour, 4 hours, 12 hours, and 24 hours. Each delay has bounded ±10% jitter; tests inject a deterministic random source. Administrators can explicitly release held or exhausted rows, starting a new cycle and incrementing `delivery_cycle`. Holding an active claim is rejected, so an in-flight HTTP request cannot be silently reclassified.

The only persisted failure values are `network_error`, `timeout`, `rate_limited`, `server_error`, `client_rejected`, `configuration_error`, and `unknown_error`. No response body, exception message, token, request header, cookie, actor email, payment information, or event payload is returned by the admin health route. The transport still applies the Phase 1 property allowlist and uses the durable row ID as the PostHog event UUID. Retries are at-least-once; a crash after HTTP acceptance and before database acknowledgement can resend the stable UUID. Downstream uniqueness depends on PostHog honoring that UUID.

## Worker and administration

`runAnalyticsDeliveryBatch` is a `server-only` entrypoint with a hard limit of 10. Only the existing authenticated, canonical-admin route invokes it now. No browser-accessible privileged worker endpoint or hosted schedule is installed. `GET /api/admin/analytics/retry` returns aggregate status/category counts and at most 50 held/exhausted rows with only ID, event name, state, attempt/cycle counts, safe category and timestamps. `POST` requires same origin and canonical admin. Actions are `run_due`, `retry` a due row, `hold`, or `release`; the latter two require an explicit UUID. The service-role client is created only after admin authorization. A future scheduler must have separate server-side authorization and must not expose the service role to the browser.

## Rollout prerequisites

Do not point this code at a database lacking the follow-on migration: new RPCs and fields are required. Apply the migration to an isolated staging database in a separately authorized change, then deploy this code there with analytics still disabled. Verify existing delivered rows, pending eligibility, grants/RLS, concurrency, and status aggregates before a separately authorized event test. No historical outbox backfill or automatic replay is performed by the migration. Before production, review mixed-version rollout behavior, schedule authentication, PostHog UUID deduplication and operational alert thresholds.

## Funnel coverage

`assessFunnelCoverage` reports the observation window state, late-arrival allowance state, independent source verification state, and finality. The default allowance is 24 hours. A result is finalized only after the window and allowance close **and** a separately verified source watermark reaches the allowance deadline. A closed clock window or an ingestion 2xx alone never grants finality.
