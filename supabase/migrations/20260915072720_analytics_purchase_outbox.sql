-- Explicit analytics only. No browser/authenticated role can write or read this outbox.
create table if not exists public.analytics_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,
  environment text not null check (environment in ('production', 'preview')),
  event text not null check (event in ('signup_completed','onboarding_started','onboarding_completed','submission_started','submission_completed','catalog_searched','track_preview_started','license_selected','checkout_started','purchase_verified','funnel_step_failed')),
  actor_id uuid not null references auth.users(id) on delete cascade,
  actor_role text not null check (actor_role in ('artist','buyer','admin','unassigned')),
  properties jsonb not null check (jsonb_typeof(properties) = 'object' and octet_length(properties::text) <= 2048),
  is_internal boolean not null,
  is_test boolean not null,
  occurred_at timestamptz not null default now(),
  delivered_at timestamptz,
  lease_id uuid,
  lease_until timestamptz,
  unique (environment, dedupe_key)
);
alter table public.analytics_outbox enable row level security;
revoke all on public.analytics_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.analytics_outbox to service_role;
create index if not exists analytics_outbox_pending on public.analytics_outbox (environment, occurred_at) where delivered_at is null;
create index if not exists analytics_outbox_actor_time on public.analytics_outbox (actor_id, occurred_at);

create or replace function public.enqueue_analytics_event(
  p_environment text, p_event text, p_actor_id uuid, p_actor_role text,
  p_properties jsonb, p_dedupe_key text, p_is_internal boolean, p_is_test boolean
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare result uuid;
begin
  -- Serializes duplicate/quota checks for one user across concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 7321));
  select id into result from public.analytics_outbox where environment = p_environment and dedupe_key = p_dedupe_key;
  if result is not null then return result; end if;
  -- Purchases must survive a burst of browser events; browser requests cannot select this event.
  if p_event <> 'purchase_verified' and (
    (select count(*) from public.analytics_outbox where actor_id = p_actor_id and occurred_at > now() - interval '1 minute') >= 120 or
    (select count(*) from public.analytics_outbox where actor_id = p_actor_id and occurred_at > now() - interval '1 day') >= 3000
  ) then return null; end if;
  if p_event = 'purchase_verified' and not exists (
    select 1 from public.orders o join public.user_profiles u on u.id = o.buyer_user_id
    where o.id = (p_properties->>'order_id')::uuid and o.buyer_user_id = p_actor_id
      and o.track_id = (p_properties->>'track_id')::uuid and u.role = 'buyer'
      and o.paid_at is not null and o.status in ('paid','fulfilled','refunded')
  ) then raise exception 'analytics_purchase_not_persisted'; end if;
  insert into public.analytics_outbox(environment,event,actor_id,actor_role,properties,dedupe_key,is_internal,is_test)
    values(p_environment,p_event,p_actor_id,p_actor_role,p_properties,p_dedupe_key,p_is_internal,p_is_test)
    on conflict (environment,dedupe_key) do nothing returning id into result;
  return result;
end; $$;
revoke all on function public.enqueue_analytics_event(text,text,uuid,text,jsonb,text,boolean,boolean) from public, anon, authenticated;
grant execute on function public.enqueue_analytics_event(text,text,uuid,text,jsonb,text,boolean,boolean) to service_role;

create or replace function public.claim_analytics_event(p_environment text, p_id uuid default null)
returns setof public.analytics_outbox language sql security invoker set search_path = '' as $$
  update public.analytics_outbox set lease_id = gen_random_uuid(), lease_until = now() + interval '30 seconds'
  where id = (
    select id from public.analytics_outbox where environment = p_environment and delivered_at is null
      and (p_id is null or id = p_id) and (lease_until is null or lease_until < now())
    order by occurred_at for update skip locked limit 1
  ) returning *;
$$;
revoke all on function public.claim_analytics_event(text,uuid) from public, anon, authenticated;
grant execute on function public.claim_analytics_event(text,uuid) to service_role;
