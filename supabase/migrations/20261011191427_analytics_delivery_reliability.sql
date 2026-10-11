-- Phase 2 delivery reliability. No historical event is enqueued or replayed.
alter table public.analytics_outbox
  add column if not exists delivery_status text,
  add column if not exists attempt_count integer,
  add column if not exists delivery_cycle integer,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists failure_category text;

update public.analytics_outbox
set delivery_status = case when delivered_at is not null then 'delivered' else 'pending' end
where delivery_status is null;
update public.analytics_outbox set attempt_count = 0 where attempt_count is null;
update public.analytics_outbox set delivery_cycle = 0 where delivery_cycle is null;
alter table public.analytics_outbox
  alter column delivery_status set default 'pending',
  alter column delivery_status set not null,
  alter column attempt_count set default 0,
  alter column attempt_count set not null,
  alter column delivery_cycle set default 0,
  alter column delivery_cycle set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'analytics_delivery_status_check'
      and conrelid = 'public.analytics_outbox'::regclass) then
    alter table public.analytics_outbox add constraint analytics_delivery_status_check
      check (delivery_status in ('pending','processing','delivered','retry_scheduled','held','exhausted'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'analytics_attempt_count_check'
      and conrelid = 'public.analytics_outbox'::regclass) then
    alter table public.analytics_outbox add constraint analytics_attempt_count_check
      check (attempt_count between 0 and 8 and delivery_cycle >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'analytics_failure_category_check'
      and conrelid = 'public.analytics_outbox'::regclass) then
    alter table public.analytics_outbox add constraint analytics_failure_category_check
      check (failure_category is null or failure_category in
        ('network_error','timeout','rate_limited','server_error','client_rejected','configuration_error','unknown_error'));
  end if;
end $$;

create index if not exists analytics_outbox_delivery_due
  on public.analytics_outbox (environment, next_retry_at, occurred_at)
  where delivery_status in ('pending','retry_scheduled','processing');

-- The original 30-second lease remains the sole concurrency lock. Reclaiming a
-- crashed worker keeps its original event UUID/time and consumes another attempt.
create or replace function public.claim_analytics_event(p_environment text, p_id uuid default null)
returns setof public.analytics_outbox language plpgsql security invoker set search_path = '' as $$
begin
  update public.analytics_outbox set delivery_status = 'exhausted', lease_id = null, lease_until = null,
      next_retry_at = null, failure_category = coalesce(failure_category, 'unknown_error')
  where environment = p_environment and (p_id is null or id = p_id)
    and delivery_status = 'processing' and attempt_count >= 8 and lease_until < now();

  return query
  update public.analytics_outbox o
  set delivery_status = 'processing', attempt_count = o.attempt_count + 1,
      last_attempt_at = now(), next_retry_at = null,
      lease_id = gen_random_uuid(), lease_until = now() + interval '30 seconds'
  where o.id = (
    select q.id from public.analytics_outbox q
    where q.environment = p_environment and q.delivered_at is null
      and (p_id is null or q.id = p_id) and q.attempt_count < 8
      and (q.delivery_status = 'pending'
        or (q.delivery_status = 'retry_scheduled' and q.next_retry_at <= now())
        or (q.delivery_status = 'processing' and q.lease_until < now()))
      and (q.lease_until is null or q.lease_until < now())
    order by q.occurred_at for update skip locked limit 1
  ) returning o.*;
end; $$;
revoke all on function public.claim_analytics_event(text,uuid) from public, anon, authenticated;
grant execute on function public.claim_analytics_event(text,uuid) to service_role;

create or replace function public.complete_analytics_event(p_id uuid, p_lease_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  with updated as (
    update public.analytics_outbox set delivery_status = 'delivered', delivered_at = now(),
      lease_id = null, lease_until = null, next_retry_at = null, failure_category = null
    where id = p_id and lease_id = p_lease_id and delivery_status = 'processing'
      and lease_until > now() and delivered_at is null
    returning id
  ) select exists(select 1 from updated);
$$;
revoke all on function public.complete_analytics_event(uuid,uuid) from public, anon, authenticated;
grant execute on function public.complete_analytics_event(uuid,uuid) to service_role;

create or replace function public.fail_analytics_event(p_id uuid, p_lease_id uuid,
  p_category text, p_retry_at timestamptz default null)
returns boolean language sql security invoker set search_path = '' as $$
  with updated as (
    update public.analytics_outbox
    set delivery_status = case
          when attempt_count >= 8 then 'exhausted'
          when p_category in ('client_rejected','configuration_error') then 'held'
          else 'retry_scheduled' end,
        failure_category = p_category,
        next_retry_at = case
          when attempt_count < 8 and p_category in
            ('network_error','timeout','rate_limited','server_error','unknown_error') then p_retry_at
          else null end,
        lease_id = null, lease_until = null
    where id = p_id and lease_id = p_lease_id and delivery_status = 'processing'
      and lease_until > now() and delivered_at is null
      and p_category in ('network_error','timeout','rate_limited','server_error',
        'client_rejected','configuration_error','unknown_error')
      and (attempt_count >= 8 or p_category in ('client_rejected','configuration_error')
        or (p_retry_at > now() and p_retry_at <= now() + interval '27 hours'))
    returning id
  ) select exists(select 1 from updated);
$$;
revoke all on function public.fail_analytics_event(uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.fail_analytics_event(uuid,uuid,text,timestamptz) to service_role;

create or replace function public.hold_analytics_event(p_environment text, p_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  with updated as (
    update public.analytics_outbox set delivery_status = 'held', next_retry_at = null,
      lease_id = null, lease_until = null
    where id = p_id and environment = p_environment and delivered_at is null
      and delivery_status in ('pending','retry_scheduled','exhausted') returning id
  ) select exists(select 1 from updated);
$$;
revoke all on function public.hold_analytics_event(text,uuid) from public, anon, authenticated;
grant execute on function public.hold_analytics_event(text,uuid) to service_role;

create or replace function public.release_analytics_event(p_environment text, p_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  with updated as (
    update public.analytics_outbox set delivery_status = 'pending', attempt_count = 0,
      delivery_cycle = delivery_cycle + 1, next_retry_at = null, failure_category = null,
      lease_id = null, lease_until = null
    where id = p_id and environment = p_environment and delivered_at is null
      and delivery_status in ('held','exhausted') returning id
  ) select exists(select 1 from updated);
$$;
revoke all on function public.release_analytics_event(text,uuid) from public, anon, authenticated;
grant execute on function public.release_analytics_event(text,uuid) to service_role;

-- Aggregate operational data only; no event properties, actors or raw errors.
create or replace function public.get_analytics_delivery_health(p_environment text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'statuses', coalesce((select jsonb_object_agg(delivery_status, total) from
      (select delivery_status, count(*) total from public.analytics_outbox
       where environment = p_environment group by delivery_status) s), '{}'::jsonb),
    'failures', coalesce((select jsonb_object_agg(failure_category, total) from
      (select failure_category, count(*) total from public.analytics_outbox
       where environment = p_environment and failure_category is not null
       group by failure_category) f), '{}'::jsonb),
    'retry_due', (select count(*) from public.analytics_outbox where environment = p_environment
      and delivery_status = 'retry_scheduled' and next_retry_at <= now()),
    'retry_waiting', (select count(*) from public.analytics_outbox where environment = p_environment
      and delivery_status = 'retry_scheduled' and next_retry_at > now()));
$$;
revoke all on function public.get_analytics_delivery_health(text) from public, anon, authenticated;
grant execute on function public.get_analytics_delivery_health(text) to service_role;
