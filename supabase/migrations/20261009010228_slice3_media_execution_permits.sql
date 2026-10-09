-- SOURCE ONLY: dormant exact-job execution. No capabilities, hosted login or Storage DDL.
begin;
do $$ begin
 if current_user<>'postgres' or to_regprocedure('submission_media.resolve_worker_io(uuid,bigint,uuid)') is null then
  raise exception 'Reviewed foundation and fenced IO required' using errcode='55000';
 end if;
end $$;
create unique index if not exists jobs_execution_identity on submission_media.jobs(id,asset_id,job_type,profile_version);
create table if not exists submission_media.execution_permits (
 id uuid primary key default gen_random_uuid(),
 correlation_id uuid not null unique,
 job_id uuid not null references submission_media.jobs(id) on delete restrict,
 asset_id uuid not null references submission_media.assets(id) on delete restrict,
 job_type text not null check(job_type in ('source_validation','legacy_source_verification','artwork_validation','waveform_generation','preview_generation')),
 profile text not null check(profile in ('source-validator-v1','artwork-validator-v1','waveform-minmax-v1','preview-aac-lc-v1')),
 expected_state text not null check(expected_state in ('queued','retry_wait','running')),
 expected_attempt integer not null check(expected_attempt between 0 and 2),
 dispatcher_subject text not null check(dispatcher_subject ~ '^[0-9]{6,30}$'),
 state text not null default 'created' check(state in ('created','requested','claimed','completed','failed','expired')),
 created_at timestamptz not null default transaction_timestamp(),
 expires_at timestamptz not null default transaction_timestamp()+interval '15 minutes',
 requested_at timestamptz,
 execution_name text unique check(length(execution_name) between 1 and 512 and execution_name ~ '^projects/tse-security-staging-media/locations/us-east5/jobs/media-worker-staging/executions/[a-z0-9-]+$'),
 consumed_at timestamptz,
 lease_token uuid,
 lease_epoch bigint,
 completion_hash bytea check(completion_hash is null or octet_length(completion_hash)=32),
 outcome jsonb check(outcome is null or (jsonb_typeof(outcome)='object' and octet_length(outcome::text)<=4096)),
 foreign key(job_id,asset_id,job_type,profile) references submission_media.jobs(id,asset_id,job_type,profile_version) on delete restrict,
 check(expires_at>created_at and expires_at<=created_at+interval '15 minutes'),
 check((consumed_at is null and lease_token is null and lease_epoch is null) or (consumed_at is not null and lease_token is not null and lease_epoch>0 and execution_name is not null))
);
-- One staging execution globally, including across Cloud Run executions.
create unique index if not exists execution_permits_one_live on submission_media.execution_permits ((true)) where state in ('created','requested','claimed');
create index if not exists execution_permits_job on submission_media.execution_permits(job_id,created_at);
alter table submission_media.execution_permits enable row level security;
alter table submission_media.execution_permits force row level security;
drop policy if exists permits_owner_only on submission_media.execution_permits;
create policy permits_owner_only on submission_media.execution_permits to postgres using(true) with check(true);
revoke all on submission_media.execution_permits from public,anon,authenticated,service_role,submission_media_broker;

create or replace function submission_media.create_execution_permit(p_job uuid,p_asset uuid,p_type text,p_profile text,p_state text,p_attempt integer,p_correlation uuid,p_dispatcher text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j submission_media.jobs; p submission_media.execution_permits; begin
 perform pg_catalog.pg_advisory_xact_lock(731003,2);
 select * into p from submission_media.execution_permits where correlation_id=p_correlation;
 if found then
  if (p.job_id,p.asset_id,p.job_type,p.profile,p.expected_state,p.expected_attempt,p.dispatcher_subject) is distinct from (p_job,p_asset,p_type,p_profile,p_state,p_attempt,p_dispatcher) then raise exception 'PERMIT_INVALID' using errcode='22023'; end if;
  return jsonb_build_object('permit_id',p.id,'state',p.state);
 end if;
 update submission_media.execution_permits set state='expired' where state in ('created','requested','claimed') and expires_at<=clock_timestamp();
 select * into j from submission_media.jobs where id=p_job for update;
 if not found or (j.asset_id,j.job_type,j.profile_version,j.state,j.attempt) is distinct from (p_asset,p_type,p_profile,p_state,p_attempt) or j.attempt>=j.max_attempts or
 not ((j.state in ('queued','retry_wait') and j.available_at<=clock_timestamp()) or (j.state='running' and j.lease_expires_at<=clock_timestamp())) then
 raise exception 'JOB_NOT_ELIGIBLE' using errcode='40001'; end if;
 insert into submission_media.execution_permits(correlation_id,job_id,asset_id,job_type,profile,expected_state,expected_attempt,dispatcher_subject)
 values(p_correlation,p_job,p_asset,p_type,p_profile,p_state,p_attempt,p_dispatcher) returning * into p;
 return jsonb_build_object('permit_id',p.id,'state',p.state);
end $$;

create or replace function submission_media.request_execution(p_permit uuid,p_dispatcher text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p submission_media.execution_permits; fresh boolean; begin
 select * into p from submission_media.execution_permits where id=p_permit for update;
 if not found or p.dispatcher_subject<>p_dispatcher or p.expires_at<=clock_timestamp() or p.state not in ('created','requested','claimed','completed','failed') then raise exception 'PERMIT_INVALID' using errcode='42501'; end if;
 fresh:=p.state='created';
 if fresh then update submission_media.execution_permits set state='requested',requested_at=clock_timestamp() where id=p.id; end if;
 return jsonb_build_object('invoke',fresh,'state',case when fresh then 'requested' else p.state end,'execution_name',p.execution_name);
end $$;

create or replace function submission_media.bind_execution(p_permit uuid,p_dispatcher text,p_execution text) returns void
language plpgsql security definer set search_path='' as $$
declare p submission_media.execution_permits; begin
 select * into p from submission_media.execution_permits where id=p_permit for update;
 if not found or p.dispatcher_subject<>p_dispatcher or p.state<>'requested' or p.expires_at<=clock_timestamp() or (p.execution_name is not null and p.execution_name<>p_execution) then raise exception 'PERMIT_INVALID' using errcode='42501'; end if;
 update submission_media.execution_permits set execution_name=p_execution where id=p.id;
end $$;

create or replace function submission_media.claim_targeted_job(p_permit uuid,p_execution text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p submission_media.execution_permits; j submission_media.jobs; s submission_media.submissions; begin
 perform submission_media.require_capability('worker');
 perform pg_catalog.pg_advisory_xact_lock(731003,1);
 select * into p from submission_media.execution_permits where id=p_permit for update;
 if not found or p.expires_at<=clock_timestamp() or p.execution_name is distinct from p_execution then raise exception 'PERMIT_INVALID' using errcode='42501'; end if;
 if p.state='claimed' then return submission_media.resolve_worker_io(p.job_id,p.lease_epoch,p.lease_token); end if;
 if p.state<>'requested' then raise exception 'PERMIT_INVALID' using errcode='42501'; end if;
 select * into j from submission_media.jobs where id=p.job_id for update;
 select * into s from submission_media.submissions where id=j.submission_id;
 if not found or (j.asset_id,j.job_type,j.profile_version,j.state,j.attempt) is distinct from (p.asset_id,p.job_type,p.profile,p.expected_state,p.expected_attempt) or j.attempt>=j.max_attempts or
 not ((j.state in ('queued','retry_wait') and j.available_at<=clock_timestamp()) or (j.state='running' and j.lease_expires_at<=clock_timestamp())) or
 exists(select 1 from submission_media.jobs r join submission_media.submissions rs on rs.id=r.submission_id where rs.owner_id=s.owner_id and r.id<>j.id and r.state='running') then raise exception 'JOB_NOT_ELIGIBLE' using errcode='40001'; end if;
 update submission_media.jobs set state='running',attempt=attempt+1,lease_epoch=lease_epoch+1,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '5 minutes',started_at=coalesce(started_at,clock_timestamp()),heartbeat_at=clock_timestamp() where id=j.id returning * into j;
 update submission_media.assets set technical_state='verifying',safe_error_code=null,reservation_expires_at=case when origin='generated' then clock_timestamp()+interval '24 hours' else reservation_expires_at end where id=j.asset_id;
 update submission_media.execution_permits set state='claimed',consumed_at=clock_timestamp(),lease_epoch=j.lease_epoch,lease_token=j.lease_token where id=p.id;
 perform submission_media.append_event(j.submission_id,'validation_started',j.asset_id,j.operation_id,j.id,null,'worker',jsonb_build_object('lease_epoch',j.lease_epoch,'attempt',j.attempt));
 return submission_media.resolve_worker_io(j.id,j.lease_epoch,j.lease_token);
end $$;

create or replace function submission_media.resolve_execution_lease(p_permit uuid,p_execution text,p_job uuid,p_epoch bigint,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p submission_media.execution_permits; begin
 select * into p from submission_media.execution_permits where id=p_permit for update;
 if not found or p.state<>'claimed' or p.expires_at<=clock_timestamp() or (p.execution_name,p.job_id,p.lease_epoch,p.lease_token) is distinct from (p_execution,p_job,p_epoch,p_token) then raise exception 'LEASE_STALE' using errcode='40001'; end if;
 return submission_media.resolve_worker_io(p_job,p_epoch,p_token);
end $$;

create or replace function submission_media.complete_execution(p_permit uuid,p_execution text,p_job uuid,p_epoch bigint,p_token uuid,p_result jsonb,p_error text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; p submission_media.execution_permits; begin
 select * into p from submission_media.execution_permits where id=p_permit for update;
 if p.state in ('completed','failed') and (p.execution_name,p.job_id,p.lease_epoch,p.lease_token) is not distinct from (p_execution,p_job,p_epoch,p_token) then
 if p.completion_hash is distinct from extensions.digest(coalesce(p_result::text,'')||coalesce(p_error,''),'sha256') then raise exception 'PERMIT_INVALID' using errcode='22023'; end if;
 return p.outcome; end if;
 perform submission_media.resolve_execution_lease(p_permit,p_execution,p_job,p_epoch,p_token);
 result:=submission_media.complete_job(p_job,p_epoch,p_token,p_result,p_error);
 update submission_media.execution_permits set state=case when p_error is null then 'completed' else 'failed' end,outcome=result,completion_hash=extensions.digest(coalesce(p_result::text,'')||coalesce(p_error,''),'sha256') where id=p_permit;
 return result;
end $$;

create or replace function submission_media.read_execution(p_permit uuid) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('permit_id',p.id,'job_id',p.job_id,'asset_id',p.asset_id,'job_type',p.job_type,'profile',p.profile,'state',p.state,'dispatcher_subject',p.dispatcher_subject,'execution_name',p.execution_name,'expires_at',p.expires_at,'outcome',p.outcome) from submission_media.execution_permits p where id=p_permit
$$;

create or replace function submission_media.inspect_worker_output(p_job uuid,p_epoch bigint,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare facts jsonb; o storage.objects; begin
 facts:=submission_media.resolve_worker_io(p_job,p_epoch,p_token);
 if facts->>'job_type' not in ('waveform_generation','preview_generation') then raise exception 'OUTPUT_PROVENANCE_MISMATCH' using errcode='42501'; end if;
 select * into o from storage.objects where bucket_id=facts->>'bucket' and name=facts->>'path';
 if not found then return null; end if;
 return jsonb_build_object('object_id',o.id,'version',o.version,'bytes',(o.metadata->>'size')::bigint,'bucket',o.bucket_id,'path',o.name);
end $$;
-- New functions are broker-only. Never granted through the Data API.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='submission_media' and p.proname in
 ('create_execution_permit','request_execution','bind_execution','claim_targeted_job','resolve_execution_lease','complete_execution','read_execution','inspect_worker_output') loop
 execute format('alter function %s owner to postgres',f.signature);
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 execute format('grant execute on function %s to submission_media_broker',f.signature);
 end loop;
end $$;
commit;
