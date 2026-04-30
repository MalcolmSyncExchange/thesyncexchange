# Supabase Finalization Runbook

This runbook closes the remaining gap between “the app boots” and “the marketplace can complete a real purchase flow.”

## What to run

1. Verify the target project:

```bash
npm run verify:supabase
```

2. Create/verify buckets:

```bash
npm run setup:storage
```

3. Apply the hosted-safe SQL bundle in Supabase SQL Editor:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql)

4. Only if you have a role that owns `storage.objects`, optionally apply:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-storage-owner-required.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-storage-owner-required.sql)

5. Re-check readiness:

```bash
curl -s http://127.0.0.1:3000/api/health/readiness
```

6. If readiness reports missing marketplace license types, seed them:

```bash
npm run seed:license-types
```

7. If buyer-authenticated catalog or favorites reads fail with a Postgres stack-depth / recursive policy error after readiness is already healthy, apply:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-rls-recursion-fix.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-rls-recursion-fix.sql)

## Readiness meanings

### `status = "healthy"`

The app has enough infrastructure to support:
- auth/profile hydration
- private/public storage access patterns
- order persistence
- webhook processing
- agreement generation and secure delivery
- generated license persistence and retry
- order activity logging
- a real buyer purchase flow

### `status = "degraded"`

The app runs, but launch-critical infrastructure is still incomplete.

Typical degraded examples:
- `avatar_path` not live yet
- fulfillment metadata columns missing
- agreement metadata reduced
- activity log unavailable

The app should not be treated as launch-ready in this state.

### `status = "blocked"`

The app cannot honestly complete the marketplace flow end to end.

Typical blocked examples:
- missing Supabase core env
- missing Stripe webhook/secret env
- missing storage buckets
- missing public tables like `tracks`, `license_types`, `orders`, or `user_profiles`

## Domain checks returned by readiness

The readiness route reports domain-level statuses for:
- `authProfile`
- `storage`
- `orders`
- `generatedLicenses`
- `agreements`
- `activityLog`
- `webhook`
- `purchaseFlow`

The marketplace should only be considered final-state ready when:
- no domain is `blocked`
- no launch-critical domain remains `degraded`
- `purchaseFlow.status = "available"`

## What degraded mode still allows vs blocks

### Allows
- browsing public marketing/auth surfaces
- logging in
- basic artist/buyer/admin navigation
- some compatibility-mode order syncing

### Blocks or limits
- secure agreement delivery when `agreement_path` metadata is unavailable
- structured agreement persistence when `generated_licenses` is unavailable
- full admin audit visibility when `order_activity_log` is unavailable
- final avatar storage contract when `avatar_path` is unavailable
- complete webhook/fulfillment diagnostics when `last_webhook_*` columns are missing

## SQL validation checks

Run these in Supabase SQL Editor if readiness still reports degraded/blocked after the bundle:

```sql
select
  to_regclass('public.tracks') as tracks_table,
  to_regclass('public.license_types') as license_types_table,
  to_regclass('public.user_profiles') as user_profiles_table,
  to_regclass('public.orders') as orders_table,
  to_regclass('public.order_activity_log') as order_activity_log_table,
  to_regclass('public.generated_licenses') as generated_licenses_table;
```

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name in (
    'agreement_path',
    'agreement_generation_error',
    'agreement_content_type',
    'agreement_size_bytes',
    'last_webhook_event_id',
    'last_webhook_event_type',
    'last_webhook_processed_at',
    'last_webhook_error'
  )
order by column_name;
```

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'generated_licenses'
  and column_name in (
    'agreement_number',
    'status',
    'terms_snapshot_json',
    'pdf_storage_path',
    'generation_error',
    'generated_at',
    'downloaded_at'
  )
order by column_name;
```

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_profiles'
  and column_name = 'avatar_path';
```

## If readiness still looks wrong after SQL apply

1. Confirm `.env.local` points at the same Supabase project for all keys.
2. Wait for PostgREST schema cache refresh.
3. Re-run:

```bash
npm run verify:supabase
curl -s http://127.0.0.1:3000/api/health/readiness
```

4. Compare:
   - SQL `to_regclass(...)` results
   - readiness `tableDiagnostics`
   - readiness `domains`

If SQL says the table exists but readiness still says `missing_or_stale`, the likely remaining issue is schema cache or wrong project credentials rather than missing migrations.
