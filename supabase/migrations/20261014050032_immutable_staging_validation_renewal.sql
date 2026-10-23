-- Follow-on: preserves legacy grant values; creates no authorization grant.
-- Explicit reviewed service-role arming only. No automatic renewal.
alter table public.staging_analytics_validation add column if not exists operator_id uuid references public.user_profiles(id);
alter table public.staging_analytics_validation drop constraint if exists staging_analytics_validation_singleton_key;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='staging_validation_five_minutes' and conrelid='public.staging_analytics_validation'::regclass) then
  alter table public.staging_analytics_validation add constraint staging_validation_five_minutes
   check(operator_id is null or expires_at=created_at+interval '5 minutes');
 end if;
end $$;
create table if not exists public.staging_analytics_validation_slot(
 singleton boolean primary key default true check(singleton),
 authorization_id uuid references public.staging_analytics_validation(id)
);
insert into public.staging_analytics_validation_slot(singleton) values(true) on conflict do nothing;
alter table public.staging_analytics_validation_slot enable row level security;
revoke all on public.staging_analytics_validation_slot from public,anon,authenticated,service_role;
grant select on public.staging_analytics_validation_slot to service_role;
-- DML is encapsulated by narrowly granted, identity-checked RPCs. The service
-- role cannot directly insert/reset/delete audit records or change the slot.
revoke insert,update,delete on public.staging_analytics_validation from service_role;
create or replace function public.protect_staging_analytics_validation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP='DELETE' then raise exception 'staging_validation_immutable'; end if;
  if old.operator_id is null or old.finished_at is not null or (old.consumed_at is null and old.expires_at<=clock_timestamp()) then raise exception 'staging_validation_immutable'; end if;
  if (new.id,new.singleton,new.operator_id,new.artist_id,new.event,new.event_limit,new.created_at,new.expires_at)
    is distinct from (old.id,old.singleton,old.operator_id,old.artist_id,old.event,old.event_limit,old.created_at,old.expires_at)
    or (old.consumed_at is not null and (new.consumed_at,new.event_id,new.lease_id) is distinct from (old.consumed_at,old.event_id,old.lease_id))
    or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
    or (old.finished_at is not null and (new.finished_at,new.outcome) is distinct from (old.finished_at,old.outcome)) then
    raise exception 'staging_validation_immutable';
  end if;
  return new;
end; $$;
revoke all on function public.protect_staging_analytics_validation() from public,anon,authenticated;
drop trigger if exists staging_analytics_validation_immutable on public.staging_analytics_validation;
create trigger staging_analytics_validation_immutable before update or delete on public.staging_analytics_validation
  for each row execute function public.protect_staging_analytics_validation();

create or replace function public.arm_staging_analytics_validation(p_authorization uuid,p_artist uuid,p_operator uuid,p_event text)
returns setof public.staging_analytics_validation language plpgsql security definer set search_path='' as $$
declare active_id uuid; previous public.staging_analytics_validation; armed_at timestamptz; flags record;
begin
 if current_setting('request.jwt.claims',true)::jsonb->>'ref' is distinct from 'oppijylbkcbiqfuvckgj'
  or current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'service_role' then raise exception 'staging_validation_identity'; end if;
 if p_authorization is null or p_authorization='00000000-0000-0000-0000-000000000000' or p_event is distinct from 'submission_started' then raise exception 'validation_authorization_invalid'; end if;
 select authorization_id into active_id from public.staging_analytics_validation_slot where singleton for update;
 if not found then raise exception 'validation_slot_missing'; end if;
 if exists(select 1 from public.staging_analytics_validation where id=p_authorization) then raise exception 'validation_authorization_exists'; end if;
 if active_id is not null then
  select * into previous from public.staging_analytics_validation where id=active_id for update;
  if (previous.consumed_at is null and previous.revoked_at is null and previous.expires_at>clock_timestamp())
   or (previous.consumed_at is not null and previous.finished_at is null) then raise exception 'validation_authorization_active'; end if;
 end if;
 -- An unmigrated/legacy live grant also prevents replacement; nothing is reset.
 if exists(select 1 from public.staging_analytics_validation where consumed_at is null and revoked_at is null and expires_at>clock_timestamp()) then raise exception 'validation_authorization_active'; end if;
 perform 1 from public.user_profiles where id=p_operator and role='admin' for share;
 if not found then raise exception 'validation_operator_invalid'; end if;
 perform 1 from public.user_profiles where id=p_artist and role='artist' for share;
 if not found then raise exception 'validation_artist_invalid'; end if;
 if exists(select 1 from public.analytics_outbox where delivered_at is null or lease_until>clock_timestamp()) then raise exception 'validation_queue_not_quiet'; end if;
 -- Definer reads the private singleton after service/project validation; the
 -- existing invoker-only admin capability RPC retains its strict role guard.
 select * into flags from commerce_private.capabilities where singleton for share;
 if not found or flags.foundation_enabled is distinct from false or flags.asset_preparation_enabled is distinct from false or flags.receipt_generation_enabled is distinct from false or flags.entitlement_activation_enabled is distinct from false or flags.transaction_projection_enabled is distinct from false or flags.payment_adapter_enabled is distinct from false then raise exception 'validation_payments_enabled'; end if;
 armed_at:=clock_timestamp();
 insert into public.staging_analytics_validation(id,artist_id,operator_id,event,created_at,expires_at)
 values(p_authorization,p_artist,p_operator,p_event,armed_at,armed_at+interval '5 minutes');
 update public.staging_analytics_validation_slot set authorization_id=p_authorization where singleton;
 return query select * from public.staging_analytics_validation where id=p_authorization;
end $$;
revoke all on function public.arm_staging_analytics_validation(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.arm_staging_analytics_validation(uuid,uuid,uuid,text) to service_role;
-- Retired three-argument API must not bypass operator/slot enforcement.
revoke all on function public.claim_staging_analytics_validation(uuid,uuid,text) from public,anon,authenticated,service_role;
create or replace function public.claim_staging_analytics_validation(p_authorization uuid,p_artist uuid,p_event text,p_operator uuid)
returns setof public.analytics_outbox language plpgsql security definer set search_path = '' as $$
declare g public.staging_analytics_validation; eid uuid; lid uuid;
active_id uuid; flags record;
begin
  if current_setting('request.jwt.claims',true)::jsonb->>'ref' is distinct from 'oppijylbkcbiqfuvckgj'
    or current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'staging_validation_identity';
  end if;
  select authorization_id into active_id from public.staging_analytics_validation_slot where singleton for update;
  if active_id is distinct from p_authorization then return; end if;
  select * into g from public.staging_analytics_validation where id=p_authorization for update;
  if not found or g.revoked_at is not null or g.consumed_at is not null
    or g.expires_at <= clock_timestamp() + interval '5 seconds'
    or g.operator_id is distinct from p_operator or g.operator_id is null
    or g.artist_id is distinct from p_artist or g.event is distinct from p_event or p_event is distinct from 'submission_started' then return; end if;
  perform 1 from public.user_profiles where id=p_operator and role='admin' for share;
  if not found then return; end if;
  -- Canonical role, not JWT/user metadata. Shared row lock prevents role mutation during claim.
  perform 1 from public.user_profiles where id=g.artist_id and role='artist' for share;
  if not found then return; end if;
  select * into flags from commerce_private.capabilities where singleton for share;
  if not found or flags.foundation_enabled is distinct from false or flags.asset_preparation_enabled is distinct from false or flags.receipt_generation_enabled is distinct from false or flags.entitlement_activation_enabled is distinct from false or flags.transaction_projection_enabled is distinct from false or flags.payment_adapter_enabled is distinct from false then return; end if;
  if exists(select 1 from public.analytics_outbox where delivered_at is null or (lease_id is not null and lease_until>clock_timestamp())) then return; end if;
  if exists(select 1 from public.analytics_outbox where environment='preview' and dedupe_key='bounded-validation:'||g.id::text) then return; end if;
  if g.expires_at <= clock_timestamp() + interval '5 seconds' then return; end if;
  eid := public.enqueue_analytics_event('preview',g.event,g.artist_id,'artist',
    jsonb_build_object('submission_attempt_id',g.id,'surface','submission_create'),
    'bounded-validation:'||g.id::text,false,true);
  if eid is null then return; end if;
  if g.expires_at <= clock_timestamp() then raise exception 'staging_validation_expired'; end if;
  lid := gen_random_uuid();
  -- Remain held even during the one transport attempt: ordinary claims/workers
  -- cannot reclaim this event after a process crash or lease expiry.
  update public.analytics_outbox set delivery_status='held',attempt_count=1,
    last_attempt_at=clock_timestamp(),next_retry_at=null,lease_id=lid,
    lease_until=least(g.expires_at,clock_timestamp()+interval '30 seconds') where id=eid;
  update public.staging_analytics_validation set consumed_at=clock_timestamp(),event_id=eid,lease_id=lid where id=g.id;
  return query select * from public.analytics_outbox where id=eid;
end; $$;

revoke all on function public.claim_staging_analytics_validation(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_staging_analytics_validation(uuid,uuid,text,uuid) to service_role;
create or replace function public.finish_staging_analytics_validation(p_authorization uuid,p_lease uuid,p_accepted boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare g public.staging_analytics_validation; accepted boolean := false;
begin
  if current_setting('request.jwt.claims',true)::jsonb->>'ref' is distinct from 'oppijylbkcbiqfuvckgj'
    or current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'service_role' then raise exception 'staging_validation_identity'; end if;
  select * into g from public.staging_analytics_validation where id=p_authorization for update;
  if not found or g.event_id is null or g.lease_id is distinct from p_lease then return 'rejected'; end if;
  if g.finished_at is not null then return g.outcome; end if;
  if p_accepted and g.revoked_at is null and g.expires_at > clock_timestamp() then
    update public.analytics_outbox set delivery_status='processing'
      where id=g.event_id and delivery_status='held' and lease_id=p_lease and lease_until>clock_timestamp();
    if found then accepted := public.complete_analytics_event(g.event_id,p_lease); end if;
  end if;
  if not accepted then
    update public.analytics_outbox set delivery_status='held',lease_id=null,lease_until=null,
      next_retry_at=null,failure_category='unknown_error'
      where id=g.event_id and delivered_at is null and lease_id=p_lease;
  end if;
  update public.staging_analytics_validation set finished_at=clock_timestamp(),outcome=case when accepted then 'accepted' else 'held' end where id=g.id;
  return case when accepted then 'accepted' else 'held' end;
end; $$;
revoke all on function public.finish_staging_analytics_validation(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.finish_staging_analytics_validation(uuid,uuid,boolean) to service_role;

create or replace function public.get_staging_analytics_validation_readiness(p_authorization uuid,p_artist uuid,p_operator uuid)
returns table(authorization_matches boolean,artist_matches boolean,operator_matches boolean,grant_usable boolean)
language plpgsql security definer set search_path='' as $$
begin
 if current_setting('request.jwt.claims',true)::jsonb->>'ref' is distinct from 'oppijylbkcbiqfuvckgj'
  or current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'service_role' then raise exception 'staging_validation_identity'; end if;
 return query select s.authorization_id=g.id,g.artist_id=p_artist,g.operator_id=p_operator,
  g.operator_id=p_operator and g.artist_id=p_artist and g.event='submission_started'
  and g.consumed_at is null and g.revoked_at is null and g.expires_at>clock_timestamp()+interval '5 seconds'
  and exists(select 1 from public.user_profiles where id=p_operator and role='admin')
  and exists(select 1 from public.user_profiles where id=p_artist and role='artist')
 from public.staging_analytics_validation_slot s join public.staging_analytics_validation g on g.id=s.authorization_id
 where s.singleton and g.id=p_authorization;
end $$;
revoke all on function public.get_staging_analytics_validation_readiness(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_staging_analytics_validation_readiness(uuid,uuid,uuid) to service_role;
