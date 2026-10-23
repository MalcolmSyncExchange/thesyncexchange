-- SEC source reader: equality environment, non-test/non-internal artist/buyer
-- cohort, half-open occurred_at range, ORDER BY occurred_at,id, LIMIT 500.
-- The pending-only index omits delivered evidence. This partial index covers
-- every delivery state in the reporting cohort and supports stable pagination.
-- No payload INCLUDE: properties are comparatively large and not search keys.
-- Delivery/retry queries retain analytics_outbox_delivery_due from reliability.
create index if not exists analytics_outbox_reporting_time_id
  on public.analytics_outbox (environment, occurred_at, id)
  where is_test = false and is_internal = false and actor_role in ('artist','buyer');
