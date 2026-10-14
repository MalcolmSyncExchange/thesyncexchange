-- Follow-on only. No grants are armed and no existing outbox row is modified.
create table if not exists public.staging_analytics_validation (
  id uuid primary key,
  singleton boolean not null default true unique check (singleton),
  artist_id uuid not null references public.user_profiles(id),
  event text not null check (event = 'submission_started'),
  event_limit integer not null default 1 check (event_limit = 1),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  consumed_at timestamptz,
  event_id uuid unique references public.analytics_outbox(id),
  lease_id uuid,
  finished_at timestamptz,
  outcome text check (outcome in ('accepted','held')),
  check (expires_at > created_at and expires_at <= created_at + interval '15 minutes'),
  check ((consumed_at is null) = (event_id is null))
);
-- Grant identity/deadline and consumed audit data can never be reset or extended.
create or replace function public.protect_staging_analytics_validation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.id,new.singleton,new.artist_id,new.event,new.event_limit,new.created_at,new.expires_at)
    is distinct from (old.id,old.singleton,old.artist_id,old.event,old.event_limit,old.created_at,old.expires_at)
    or (old.consumed_at is not null and (new.consumed_at,new.event_id,new.lease_id) is distinct from (old.consumed_at,old.event_id,old.lease_id))
    or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
    or (old.finished_at is not null and (new.finished_at,new.outcome) is distinct from (old.finished_at,old.outcome)) then
    raise exception 'staging_validation_immutable';
  end if;
  return new;
end; $$;
revoke all on function public.protect_staging_analytics_validation() from public,anon,authenticated;
drop trigger if exists staging_analytics_validation_immutable on public.staging_analytics_validation;
create trigger staging_analytics_validation_immutable before update on public.staging_analytics_validation
  for each row execute function public.protect_staging_analytics_validation();
alter table public.staging_analytics_validation enable row level security;
revoke all on public.staging_analytics_validation from public,anon,authenticated,service_role;
grant select,insert,update on public.staging_analytics_validation to service_role;

create or replace function public.claim_staging_analytics_validation(p_authorization uuid,p_artist uuid,p_event text)
returns setof public.analytics_outbox language plpgsql security invoker set search_path = '' as $$
declare g public.staging_analytics_validation; eid uuid; lid uuid;
begin
  if current_setting('request.jwt.claims',true)::jsonb->>'ref' is distinct from 'oppijylbkcbiqfuvckgj'
    or current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'staging_validation_identity';
  end if;
  select * into g from public.staging_analytics_validation where id=p_authorization for update;
  if not found or g.revoked_at is not null or g.consumed_at is not null
    or g.expires_at <= clock_timestamp() + interval '5 seconds'
    or g.artist_id <> p_artist or g.event <> p_event or p_event <> 'submission_started' then return; end if;
  -- Canonical role, not JWT/user metadata. Shared row lock prevents role mutation during claim.
  perform 1 from public.user_profiles where id=g.artist_id and role='artist' for share;
  if not found then return; end if;
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
revoke all on function public.claim_staging_analytics_validation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_staging_analytics_validation(uuid,uuid,text) to service_role;

create or replace function public.finish_staging_analytics_validation(p_authorization uuid,p_lease uuid,p_accepted boolean)
returns text language plpgsql security invoker set search_path = '' as $$
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
