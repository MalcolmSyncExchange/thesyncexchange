# Manual Supabase Apply Steps

Use this path when the app code is ready but you do not have Supabase CLI or direct database access wired into the repo.

The app now expects a **hosted-safe finalization bundle**:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql)

That bundle is idempotent and safe to run in the hosted Supabase SQL Editor against:
- a project that still needs the full marketplace schema
- a project that already has the base schema but is missing the later fulfillment/avatar objects

Storage policy SQL that touches `storage.objects` was intentionally split out because hosted SQL Editor execution can fail with owner-permission errors on that table:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-storage-owner-required.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-storage-owner-required.sql)

Do not run the storage-owner-required file unless you have confirmed the executing role owns `storage.objects` or has equivalent elevated privileges.

## Exact order

1. Verify the project wiring:

```bash
npm run verify:supabase
```

2. Create or verify the required storage buckets:

```bash
npm run setup:storage
```

3. Open the Supabase dashboard for the same project used by:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

4. Open **SQL Editor**.

5. Paste the full contents of:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql)

6. Run the query once.

7. Re-check readiness:

```bash
npm run verify:supabase
curl -s http://127.0.0.1:3000/api/health/readiness
```

## What this bundle is expected to provide

- foundational public tables such as `tracks`, `license_types`, `user_profiles`, and `orders`
- the later fulfillment metadata columns on `orders`
- `order_activity_log`
- `avatar_path` on `user_profiles`
- public-schema RLS and SQL functions the app depends on
- admin/helper SQL functions referenced by the app contract

The hosted-safe bootstrap does **not** apply `storage.objects` policy DDL.

## Post-apply SQL checks

Run these in Supabase SQL Editor after the bundle completes:

```sql
select
  to_regclass('public.tracks') as tracks_table,
  to_regclass('public.license_types') as license_types_table,
  to_regclass('public.user_profiles') as user_profiles_table,
  to_regclass('public.orders') as orders_table,
  to_regclass('public.order_activity_log') as order_activity_log_table;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_profiles'
  and column_name = 'avatar_path';

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name in (
    'checkout_created_at',
    'paid_at',
    'agreement_generated_at',
    'fulfilled_at',
    'refunded_at',
    'agreement_path',
    'agreement_content_type',
    'agreement_size_bytes',
    'agreement_generation_error',
    'last_webhook_event_id',
    'last_webhook_event_type',
    'last_webhook_processed_at',
    'last_webhook_error'
  )
order by column_name;
```

## Interpreting readiness after SQL apply

Use [`/Users/malcolmw/Documents/The Sync Exchange.2/docs/supabase-finalization.md`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/docs/supabase-finalization.md) as the runbook, but the short version is:

- `status = "healthy"`
  - the app has the dependencies needed for a real marketplace purchase flow
- `status = "degraded"`
  - the app runs, but final-state marketplace operations are still limited
- `status = "blocked"`
  - the app cannot honestly complete the full purchase flow yet

If readiness still reports missing tables after the SQL bundle succeeds:

1. confirm the env vars point at the same Supabase project
2. wait for PostgREST schema cache refresh
3. re-run `npm run verify:supabase`
4. compare the SQL checks above to the readiness `tableDiagnostics`

## Local follow-up

```bash
npm run validate:env
npm run typecheck
npm run build
ROUTE_VERIFY_REQUIRE_EXISTING=1 npm run verify:smoke
curl -s http://127.0.0.1:3000/api/health/readiness
```

Then continue with:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/docs/test-accounts.md`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/docs/test-accounts.md)
- [`/Users/malcolmw/Documents/The Sync Exchange.2/docs/happy-path-qa.md`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/docs/happy-path-qa.md)
- [`/Users/malcolmw/Documents/The Sync Exchange.2/docs/e2e.md`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/docs/e2e.md)
