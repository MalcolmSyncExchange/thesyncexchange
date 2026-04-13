# Manual Supabase Apply Steps

Use this path when the app code is ready but you do not have Supabase CLI or direct database access wired into the repo.

## Start with diagnosis

Run:

```bash
npm run verify:supabase
```

Use the result to choose the right SQL bundle:

- `recommendedAction = "apply_foundation_bootstrap"`
  - your project does not expose foundational app tables like `public.tracks` and `public.license_types`
  - use [`supabase/manual-apply/2026-04-foundation-bootstrap.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql)
- `recommendedAction = "apply_follow_up_bundle"`
  - the base schema is present, but the later fulfillment/storage/avatar changes are still missing
  - use [`supabase/manual-apply/2026-04-storage-fulfillment-avatar.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-storage-fulfillment-avatar.sql)
- `recommendedAction = "run_storage_setup"`
  - create the buckets first with `npm run setup:storage`

## Prerequisites

These earlier migrations must already be applied in the target Supabase project before you use the **follow-up** bundle:

- `supabase/migrations/0008_database_foundation.sql`
- `supabase/migrations/0009_order_lifecycle.sql`

Make sure the storage buckets already exist:

```bash
npm run setup:storage
```

## Exact SQL execution order

1. Open the Supabase Dashboard for the target project.
2. Go to **SQL Editor**.
3. Create a new query.
4. Paste the full contents of the bundle that matches your diagnosis:

- foundational bootstrap for a project missing baseline app tables:
  - [`supabase/manual-apply/2026-04-foundation-bootstrap.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql)
- follow-up fulfillment/storage/avatar changes for an already-bootstrapped project:
  - [`supabase/manual-apply/2026-04-storage-fulfillment-avatar.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-storage-fulfillment-avatar.sql)

5. Run the query once.

The follow-up bundle applies, in order:

1. `0010_order_fulfillment_hardening.sql`
2. `0011_storage_object_policies.sql`
3. `0012_avatar_storage_path.sql`

## Post-apply checks

Run these checks in the SQL Editor after the migration bundle completes:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name in (
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

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_profiles'
  and column_name = 'avatar_path';

select policyname
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname in (
    'Public avatars are readable',
    'Owners can manage avatars',
    'Public cover art is readable',
    'Artists can manage private track audio',
    'Admins can manage agreements'
  )
order by policyname;
```

Use this check to distinguish whether the tables are truly missing versus merely invisible to PostgREST:

```sql
select
  to_regclass('public.user_profiles') as user_profiles_table,
  to_regclass('public.orders') as orders_table,
  to_regclass('public.order_activity_log') as order_activity_log_table;
```

Interpretation:

- `null` means the table is truly missing in Postgres, so the required migration has not been applied successfully
- a non-null result plus a blocked/degraded readiness report means the table exists, but the app still cannot see it through PostgREST; that usually means:
  - the API schema cache is stale
  - the connected service-role credentials point at the wrong project
  - the Supabase API is not exposing the `public` schema correctly

Map that back to the readiness route like this:

- `tableDiagnostics.<table>.status = "missing_or_stale"`
  - baseline tables are visible
  - run the `to_regclass(...)` query above to distinguish missing migration vs stale PostgREST cache
- `tableDiagnostics.<table>.status = "schema_exposure_blocked"`
  - even baseline public tables are not visible
  - fix credentials / project selection / schema exposure before assuming a migration problem

If the tables exist but readiness still reports them unavailable:

1. Verify `.env.local` uses the same project for:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. Verify the Supabase API is exposing the `public` schema.
3. Wait for the API schema cache to refresh after the SQL run, then recheck:

```bash
curl -s http://127.0.0.1:3000/api/health/readiness
```

If readiness reports `postgrest.baselineTablesVisible = false` and `npm run verify:supabase` recommends `apply_foundation_bootstrap`, do not stop at the smaller follow-up bundle. Apply the full foundation bootstrap first.

## Local follow-up

After the SQL is live:

```bash
npm run validate:env
npm run typecheck
npm run build
ROUTE_VERIFY_REQUIRE_EXISTING=1 npm run verify:smoke
curl -s http://127.0.0.1:3000/api/health/readiness
npm run verify:roles
```

Then run the live QA flow on your machine:

1. artist signup / onboarding / avatar upload
2. track submission with cover art, full audio, and preview upload
3. admin approval
4. buyer checkout
5. Stripe webhook fulfillment
6. agreement download from the buyer order flow
