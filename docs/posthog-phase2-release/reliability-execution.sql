-- REVIEW ONLY. NOT EXECUTED. Separate founder approval required.
-- Connect directly/session-mode to oppijylbkcbiqfuvckgj as the approved migration role.
-- For psql use -v ON_ERROR_STOP=1; abort and ROLLBACK on any error.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
lock table public.analytics_outbox in access exclusive mode;
do $preflight$
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 34 then
    raise exception 'Unexpected hosted migration history; stop and review';
  end if;
  if exists (
    select 1 from (values
('20261010055251','0001_initial_schema','49f6193a9f853e4b9f8a50dbd2dc8b38dcfce95854ec2acc0a04324d2829571e'),
('20261010055323','0002_submission_policies','19dc09093a2a24412559c79946eebacd70e16fc472f5067762c649c5ed7ec26e'),
('20261010055327','0003_storage_bucket','acfb6edb0e79263c4553433c022b3d9385d4123a30f38785ec71a491b4c78917'),
('20261010055331','0004_admin_moderation','7bfb71a0079e5d0df2693a92bfc145ac2f6351ff61bd4da62fa74b846f2b266f'),
('20261010055336','0005_admin_flag_severity','41c577e0276719b6610fde1d4e1f0831bd276650196decc5313233548962fa1f'),
('20261010055341','0006_agreements_bucket','3598724c2428f31e0ad422cbfff9c543c1345bc23c582479acc3752e2f92b531'),
('20261010055345','0006_onboarding_status','c2b2394987a866107ad1aa08d5f83ca1855f0f9a7860d8ea6cbd19dc37f1dc8e'),
('20261010055350','0007_users_role_nullable','e3420b4fc2d3eda2ee65af4ea1ff7f9a5b8bf826af62cf356d8a5f35c34c142b'),
('20261010055419','0008_database_foundation','628c0f4781b2fe48e85ba46305edc09b06f5c94958614ac758a6f5e8a95de8ae'),
('20261010055424','0009_order_lifecycle','920822b8cbab00fe32f9f89bc0adb5dbabbacf24b9780341eca24f59c89220f3'),
('20261010055428','0010_order_fulfillment_hardening','8265e4394d0902b12e76f524bf198e6a8c80759f893cc687e3d7d4aefc716a7c'),
('20261010062908','0011_storage_object_policies','88d3e3c6f17d2105f6f27a44ee339e490502048631094e62903805dc089a9c85'),
('20261010063000','0012_avatar_storage_path','01d79714a1b99a6fb79dd0a95fc746d0c3a63c6ef3374bd5ecb5e9602a885c0f'),
('20261010063006','0013_generated_licenses','8041582dfe8fcaef8c8cb67538f375177322708e6fa257ed5ee4e3bc7c2ff7c0'),
('20261010063012','0014_buyer_workspace_settings','41ff2ead2a0ad9dbaad611c47f3a0ff99a18c764c445843e3378c1321a253fe0'),
('20261010063019','0016_rls_recursion_fix','80372268976a58e4887ee6a1bcbd7889eb6b70a053f743a40e37184db82635c1'),
('20261010063024','0017_lock_down_order_writes','17742ec643e3894a37b5f704fcdcc09723f1c288d9d570eb6e2325614d3f4e3b'),
('20261010063041','0018_lock_down_track_moderation_fields','7beb9add69d12e1499317dcfc4855d63cefad813e8ecc81f72d6336b5e7fd31f'),
('20261010063045','0019_lock_down_user_profile_roles','3b689d63492166cf73017019ca29897191e55709578679b9df3ae3ce9dea2e83'),
('20261010063050','0020_remove_auth_profile_role_triggers','1775ed51134eeae13d2564a53e3731b17d3c2ac9d605689826626d76071e5766'),
('20261010063056','0021_rate_limit_foundation','756f51f0a06308b0acff1a6ee2cc0a615e21e981df536630e94c183af6391ec9'),
('20261010063101','20260915224738_reconcile_reviewed_rights_and_storage','f946132c756190c6d3b033db6c2c62ddf3080456e1596996eb918145f769056c'),
('20261010063119','20260915224822_separate_profile_finance_and_buyer_access','4897972b1c27d70e7cdff58a8eabb560ce400177558f8db6d6f95a6f14c99d21'),
('20261010063124','20260915225349_atomic_artist_track_writes','066f8f0bf524c5cba9ae6666400c00c427aadfa0fcc68f99c449b3e30d7c59b2'),
('20261010063128','20260924052925_nonretryable_artist_track_stale_conflict','12c3bdda46969bdca3743ca4e1449b308c330d7b6c37e172a5a16471f2aedb87'),
('20261010063134','20260924171123_preserve_atomic_rights_holder_identity','373b3fb8461101e171fb43fd6a7dd278a880f0d50072782410db52feb22baa28'),
('20261010063139','20261001042359_secure_buyer_catalog_views','c1bd8a145198d44d4e3c6f4afab652c87e1afe974cc81722854d9c4152e844ea'),
('20261010063157','20261002045900_purchase_completion_foundation','dab672f34592462acc119ed3e85ecaf9f595a621e44d6ee41c1a98bd95b347f1'),
('20261010063202','20261002201230_purchase_completion_fulfillment_adapters','94a7551f9dd61dc0c4344399f17a779ac2de8b70f2daec95cbac93a2ef637d1c'),
('20261010063209','20261004023232_gate_d_acceptance_schema','4f4517421e83b1a02f6227753b7e4f7c70118042b696a1b6adbe157310a2ac81'),
('20261010063215','20261004023241_gate_d_acceptance_functions','b3dfbde1e6f2fd90ab9a084fd7e3e37713ccb28a00e36ec6009c75c47875c4cd'),
('20261010152959','20260915072720_analytics_purchase_outbox','3ead2fac00430b5bfa79603fc5b721fdb0dd8f23e9ab7d1ab172ebb0de584e12'),
('20261010153057','20261010060000_analytics_verified_purchase_evidence','3b86b6e7cae163e92857e052fef685b3b84985a3665d7763008db6992760efc3'),
('20261011023627','20261011004710_sec_payment_readiness','6fc3d2714e585f4566068dd371120aeb1323145b23da0b00ca6acb4ab15bcc50')
) expected(version,name,sha256)
    left join supabase_migrations.schema_migrations m on m.version=expected.version
    where m.version is null or m.name is distinct from expected.name
      or encode(extensions.digest(array_to_string(m.statements,E'\n'),'sha256'),'hex') is distinct from expected.sha256
  ) then raise exception 'Hosted migration version/name/checksum divergence'; end if;
end; $preflight$;
do $queue$
begin
  if (select count(*) from public.analytics_outbox) <> 4
     or exists (select 1 from public.analytics_outbox where delivered_at is null or lease_until > now()) then
    raise exception 'Outbox baseline changed; stop without deleting or replaying rows';
  end if;
end; $queue$;
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

-- Record the exact original file bytes, preserving the reviewed source checksum.
-- Existing timestamp mappings remain unchanged. New canonical version is unused.
insert into supabase_migrations.schema_migrations(version,name,statements)
values ('20261011191427','20261011191427_analytics_delivery_reliability',array[$original_sql$-- Phase 2 delivery reliability. No historical event is enqueued or replayed.
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
$original_sql$]);
commit;
