-- Dedicated DO authority. Dormant installation: no credentials, admission,
-- capability flags, existing jobs, Google holds or accounting are changed.
begin;
do $$begin
 if current_user<>'postgres' then raise exception 'Verified installer required';end if;
 if exists(select 1 from pg_roles where rolname='media_broker_do_login') then raise exception 'Review existing DO role before installation';end if;
end$$;
create role media_broker_do_login nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 4;
grant usage on schema submission_media to media_broker_do_login;
create table submission_media.do_control (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 host_id text not null default '620470021' check(host_id='620470021'),
 root_uuid uuid not null default '59134bd0-a76f-4ea0-8e4a-770b2e1eafc2' check(root_uuid='59134bd0-a76f-4ea0-8e4a-770b2e1eafc2'),
 boot_id uuid,worker_digest text not null default 'sha256:c678ad81c316b0e8f56dd9a822e7da80ed7dbee09f8d667e2f5a64e6e64239b0' check(worker_digest='sha256:c678ad81c316b0e8f56dd9a822e7da80ed7dbee09f8d667e2f5a64e6e64239b0'),
 broker_digest text check(broker_digest~'^sha256:[a-f0-9]{64}$'),
 allowed_owner uuid references public.user_profiles(id),jobs_after timestamptz,
 expires_at timestamptz,month text not null default to_char(clock_timestamp() at time zone 'UTC','YYYY-MM'),
 monthly_ceiling_usd numeric not null default 15 check(monthly_ceiling_usd=15),
 fixed_reserve_usd numeric not null default 12 check(fixed_reserve_usd=12),
 carry_forward_usd numeric check(carry_forward_usd>=0),
 accounting_reconciled boolean not null default false,
 historical_google_liabilities text not null default 'UNKNOWN_PRESERVED_NOT_OFFSET' check(historical_google_liabilities='UNKNOWN_PRESERVED_NOT_OFFSET'),
 observed_at timestamptz,traffic_bytes bigint not null default 0 check(traffic_bytes>=0),log_bytes bigint not null default 0 check(log_bytes>=0),
 check(not enabled or (boot_id is not null and broker_digest is not null and allowed_owner is not null and jobs_after is not null and expires_at is not null and accounting_reconciled and carry_forward_usd is not null))
);
insert into submission_media.do_control(singleton) values(true);
create table submission_media.do_runs (
 id uuid primary key,permit_id uuid not null unique references submission_media.execution_permits(id),job_id uuid not null references submission_media.jobs(id),
 boot_id uuid not null,worker_digest text not null,month text not null,
 state text not null default 'issued' check(state in ('issued','completed','failed')),
 reserved_usd numeric not null default .03 check(reserved_usd=.03),spent_usd numeric not null default 0 check(spent_usd>=0 and spent_usd<=reserved_usd),
 input_reads integer not null default 0 check(input_reads between 0 and 3),output_reads integer not null default 0 check(output_reads between 0 and 6),output_writes integer not null default 0 check(output_writes between 0 and 3),
 created_at timestamptz not null default clock_timestamp(),settled_at timestamptz
);
create unique index do_runs_one_issued on submission_media.do_runs((true)) where state='issued';
create table submission_media.do_audit(id bigint generated always as identity primary key,run_id uuid references submission_media.do_runs(id),kind text not null,bytes bigint,cost_usd numeric,created_at timestamptz not null default clock_timestamp());
create function submission_media.do_audit_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Immutable DO accounting evidence' using errcode='42501';end$$;
create trigger do_audit_immutable before update or delete on submission_media.do_audit for each row execute function submission_media.do_audit_immutable();
create function submission_media.do_run_guard() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or old.state<>'issued' or (to_jsonb(new)-array['state','spent_usd','input_reads','output_reads','output_writes','settled_at']) is distinct from (to_jsonb(old)-array['state','spent_usd','input_reads','output_reads','output_writes','settled_at']) or new.spent_usd<old.spent_usd or new.input_reads<old.input_reads or new.output_reads<old.output_reads or new.output_writes<old.output_writes then raise exception 'Immutable DO run identity and liabilities' using errcode='42501';end if;return new;end$$;
create trigger do_run_guard before update or delete on submission_media.do_runs for each row execute function submission_media.do_run_guard();
do $$declare t text;begin foreach t in array array['do_control','do_runs','do_audit'] loop
 execute format('alter table submission_media.%I enable row level security',t);
 execute format('alter table submission_media.%I force row level security',t);
 execute format('create policy installer_only on submission_media.%I to postgres using(true) with check(true)',t);
 execute format('revoke all on submission_media.%I from public,anon,authenticated,service_role,submission_media_broker,media_broker_do_login',t);
 end loop;end$$;
-- Preserve both existing execution namespaces. New names are limited to this
-- exact DO host and dispatcher. No old Google identity is impersonated.
alter table submission_media.execution_permits drop constraint execution_permits_execution_name_check;
alter table submission_media.execution_permits add constraint execution_permits_execution_name_check check(
 length(execution_name) between 1 and 512 and (
 execution_name~'^projects/tse-security-staging-media/locations/us-east5/jobs/media-worker-staging/executions/[a-z0-9-]+$' or
 execution_name~'^projects/eng-archery-512905-j0/zones/us-central1-a/instances/tse-media-worker-003/executions/[a-f0-9-]{36}$' or
 (dispatcher_subject='620470021' and execution_name~'^digitalocean/nyc3/droplets/620470021/boots/[a-f0-9-]{36}/executions/[a-f0-9-]{36}$')));
create function submission_media.do_require(p_boot uuid) returns submission_media.do_control language plpgsql security definer set search_path='' as $$declare c submission_media.do_control;begin
 select * into c from submission_media.do_control where singleton for share;
 if not c.enabled or c.boot_id is distinct from p_boot or c.month<>to_char(clock_timestamp() at time zone 'UTC','YYYY-MM') or c.expires_at<=clock_timestamp() or c.observed_at is null or c.observed_at<clock_timestamp()-interval '90 seconds' or not c.accounting_reconciled or c.carry_forward_usd is null or not exists(select 1 from public.user_profiles where id=c.allowed_owner and role='artist') then raise exception 'DO_ADMISSION_CLOSED' using errcode='42501';end if;
 perform submission_media.require_capability('worker');return c;end$$;
create function submission_media.do_observe(p_boot uuid,p_traffic bigint,p_logs bigint) returns jsonb language plpgsql security definer set search_path='' as $$declare c submission_media.do_control;projection numeric;begin
 select * into c from submission_media.do_control where singleton for update;
 if c.boot_id is distinct from p_boot or p_traffic is null or p_logs is null or p_traffic<c.traffic_bytes or p_logs<c.log_bytes or p_traffic<0 or p_logs<0 then raise exception 'DO_ACCOUNTING_AMBIGUOUS' using errcode='42501';end if;
 update submission_media.do_control set traffic_bytes=p_traffic,log_bytes=p_logs,observed_at=clock_timestamp() where singleton;
 -- Full reservations are carried after settlement; no optimistic refunds.
 projection:=c.fixed_reserve_usd+c.carry_forward_usd+coalesce((select sum(reserved_usd) from submission_media.do_runs where month=c.month),0)+p_traffic::numeric/1000000000*.09+p_logs::numeric/1073741824*.5;
 return jsonb_build_object('enabled',c.enabled,'paused',not c.accounting_reconciled or projection is null or projection>=c.monthly_ceiling_usd,'projected_usd',projection,'month',c.month);end$$;
create function submission_media.do_admit(p_operation uuid,p_boot uuid,p_digest text) returns jsonb language plpgsql security definer set search_path='' as $$declare c submission_media.do_control;r submission_media.do_runs;j submission_media.jobs;input submission_media.assets;permit jsonb;projection numeric;begin
 perform pg_advisory_xact_lock(731003,4);c:=submission_media.do_require(p_boot);
 if p_operation is null or p_digest is distinct from c.worker_digest then raise exception 'DO_IDENTITY_DENIED' using errcode='42501';end if;
 select * into r from submission_media.do_runs where state='issued' or id=p_operation order by created_at limit 1;
 if found then return jsonb_build_object('state',r.state,'run_id',r.id,'recovery',true);end if;
 projection:=c.fixed_reserve_usd+c.carry_forward_usd+coalesce((select sum(reserved_usd) from submission_media.do_runs where month=c.month),0)+c.traffic_bytes::numeric/1000000000*.09+c.log_bytes::numeric/1073741824*.5+.03;
 if projection>c.monthly_ceiling_usd then return jsonb_build_object('state','budget_limit');end if;
 -- Historical jobs are not eligible. Canonical owner and new-job cutoff
 -- are installer controlled, never taken from worker request bodies.
 select x.* into j from submission_media.jobs x join submission_media.submissions s on s.id=x.submission_id
 where s.owner_id=c.allowed_owner and x.created_at>=c.jobs_after and x.state in ('queued','retry_wait') and x.available_at<=clock_timestamp() and x.attempt<least(x.max_attempts,3)
 and x.job_type in ('source_validation','waveform_generation','preview_generation','artwork_validation')
 order by x.available_at,x.id for update of x skip locked limit 1;
 if not found then return jsonb_build_object('state','idle');end if;
 select * into input from submission_media.assets where id=coalesce((select source_asset_id from submission_media.assets where id=j.asset_id),j.asset_id);
 if input.storage_bytes is null or input.storage_bytes<1 or input.storage_bytes>50000000 then return jsonb_build_object('state','input_limit');end if;
 permit:=submission_media.create_execution_permit(j.id,j.asset_id,j.job_type,j.profile_version,j.state,j.attempt,p_operation,c.host_id);
 perform submission_media.request_execution((permit->>'permit_id')::uuid,c.host_id);
 perform submission_media.bind_execution((permit->>'permit_id')::uuid,c.host_id,'digitalocean/nyc3/droplets/'||c.host_id||'/boots/'||p_boot||'/executions/'||p_operation);
 insert into submission_media.do_runs(id,permit_id,job_id,boot_id,worker_digest,month) values(p_operation,(permit->>'permit_id')::uuid,j.id,p_boot,p_digest,c.month);
 insert into submission_media.do_audit(run_id,kind,cost_usd) values(p_operation,'reserved',.03);
 return jsonb_build_object('state','issued','run_id',p_operation,'job_id',j.id,'recovery',false);end$$;
create function submission_media.do_run(p_run uuid,p_boot uuid,p_live boolean default true) returns submission_media.do_runs language plpgsql security definer set search_path='' as $$declare r submission_media.do_runs;begin
 if p_live then perform submission_media.do_require(p_boot);end if;
 select * into r from submission_media.do_runs where id=p_run and boot_id=p_boot for update;
 if not found or r.state<>'issued' then raise exception 'DO_RUN_DENIED' using errcode='42501';end if;return r;end$$;
create function submission_media.do_scope_status(p_run uuid,p_boot uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare r submission_media.do_runs;authorized boolean:=false;begin
 select * into r from submission_media.do_runs where (id=p_run or p_run is null and state='issued') and boot_id=p_boot order by created_at limit 1;
 begin perform submission_media.do_require(p_boot);authorized:=r.state='issued';exception when others then authorized:=false;end;
 return jsonb_build_object('state',coalesce(r.state,'none'),'run_id',r.id,'authorized',coalesce(authorized,false));end$$;
create function submission_media.do_claim(p_run uuid,p_boot uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare r submission_media.do_runs;p submission_media.execution_permits;begin
 r:=submission_media.do_run(p_run,p_boot);select * into p from submission_media.execution_permits where id=r.permit_id;
 return submission_media.claim_targeted_job(p.id,p.execution_name);end$$;
create function submission_media.do_resolve(p_run uuid,p_boot uuid,p_job uuid,p_epoch bigint,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare r submission_media.do_runs;p submission_media.execution_permits;begin
 r:=submission_media.do_run(p_run,p_boot);select * into p from submission_media.execution_permits where id=r.permit_id;
 return submission_media.resolve_execution_lease(p.id,p.execution_name,p_job,p_epoch,p_token);end$$;
create function submission_media.do_heartbeat(p_run uuid,p_boot uuid,p_job uuid,p_epoch bigint,p_token uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform submission_media.do_resolve(p_run,p_boot,p_job,p_epoch,p_token);perform submission_media.heartbeat_job(p_job,p_epoch,p_token);end$$;
create function submission_media.do_inspect(p_run uuid,p_boot uuid,p_job uuid,p_epoch bigint,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform submission_media.do_resolve(p_run,p_boot,p_job,p_epoch,p_token);return submission_media.inspect_worker_output(p_job,p_epoch,p_token);end$$;
create function submission_media.do_record(p_run uuid,p_boot uuid,p_job uuid,p_epoch bigint,p_token uuid,p_object uuid,p_version text,p_sha text,p_bytes bigint) returns void language plpgsql security definer set search_path='' as $$begin
 perform submission_media.do_resolve(p_run,p_boot,p_job,p_epoch,p_token);perform submission_media.record_worker_output(p_job,p_epoch,p_token,p_object,p_version,p_sha,p_bytes);end$$;
create function submission_media.do_finish(p_run uuid,p_boot uuid,p_job uuid,p_epoch bigint,p_token uuid,p_result jsonb,p_error text default null) returns jsonb language plpgsql security definer set search_path='' as $$declare r submission_media.do_runs;p submission_media.execution_permits;begin
 r:=submission_media.do_run(p_run,p_boot);select * into p from submission_media.execution_permits where id=r.permit_id;
 if p_error is null and p_result->>'build_digest' is distinct from r.worker_digest then raise exception 'DO_BUILD_DENIED' using errcode='42501';end if;
 return submission_media.complete_execution(p.id,p.execution_name,p_job,p_epoch,p_token,p_result,p_error);end$$;
create function submission_media.do_charge(p_run uuid,p_boot uuid,p_kind text,p_bytes bigint) returns void language plpgsql security definer set search_path='' as $$declare r submission_media.do_runs;p submission_media.execution_permits;f jsonb;cost numeric;begin
 r:=submission_media.do_run(p_run,p_boot);select * into p from submission_media.execution_permits where id=r.permit_id;
 f:=submission_media.do_resolve(p_run,p_boot,p.job_id,p.lease_epoch,p.lease_token);
 if p_bytes is null or p_bytes<1 or p_kind is null or p_kind not in ('input','output_read','output_write') then raise exception 'DO_TRANSFER_DENIED';end if;
 if p_kind='input' then
 if r.input_reads>=3 or p_bytes is distinct from coalesce((f->'source'->>'bytes')::bigint,(f->>'bytes')::bigint) then raise exception 'DO_INPUT_EXHAUSTED';end if;
 elsif f->>'job_type' not in ('waveform_generation','preview_generation') or p_bytes>(f->>'max_bytes')::bigint or (p_kind='output_write' and r.output_writes>=3) or (p_kind='output_read' and r.output_reads>=6) then raise exception 'DO_OUTPUT_EXHAUSTED';end if;
 cost:=case when p_kind='output_write' then p_bytes::numeric/1073741824*.12 else p_bytes::numeric/1000000000*.09 end;
 if r.spent_usd+cost>r.reserved_usd then raise exception 'DO_RESERVATION_EXHAUSTED';end if;
 update submission_media.do_runs set spent_usd=spent_usd+cost,input_reads=input_reads+case when p_kind='input' then 1 else 0 end,output_reads=output_reads+case when p_kind='output_read' then 1 else 0 end,output_writes=output_writes+case when p_kind='output_write' then 1 else 0 end where id=r.id;
 insert into submission_media.do_audit(run_id,kind,bytes,cost_usd) values(r.id,p_kind,p_bytes,cost);end$$;
create function submission_media.do_settle(p_run uuid,p_boot uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare r submission_media.do_runs;p submission_media.execution_permits;j submission_media.jobs;begin
 perform pg_advisory_xact_lock(731003,4);select * into r from submission_media.do_runs where id=p_run and boot_id=p_boot for update;
 if not found then raise exception 'DO_RUN_DENIED';end if;if r.state<>'issued' then return jsonb_build_object('state',r.state);end if;
 select * into p from submission_media.execution_permits where id=r.permit_id for update;select * into j from submission_media.jobs where id=r.job_id for update;
 -- Called only after root launcher proves EXITED/NONE. Never restart an issued run.
 if p.state not in ('completed','failed') then
 update submission_media.execution_permits set state='expired' where id=p.id;
 if (j.lease_epoch,j.lease_token) is not distinct from (p.lease_epoch,p.lease_token) or p.state='requested' and j.state in ('queued','retry_wait') and j.attempt=p.expected_attempt then
 update submission_media.jobs set state=case when attempt>=least(max_attempts,3) then 'failed' else 'retry_wait' end,retryable=attempt<least(max_attempts,3),lease_token=null,lease_expires_at=null,error_code='temporary_system_error',available_at=clock_timestamp()+interval '60 seconds' where id=j.id;
 update submission_media.assets set technical_state='failed',safe_error_code='TEMPORARY_SYSTEM_ERROR' where id=j.asset_id and technical_state='verifying';
 end if;end if;
 update submission_media.do_runs set state=case when p.state='completed' then 'completed' else 'failed' end,settled_at=clock_timestamp() where id=r.id;
 insert into submission_media.do_audit(run_id,kind) values(r.id,'settled');return jsonb_build_object('state',case when p.state='completed' then 'completed' else 'failed' end);end$$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='submission_media' and p.proname like 'do\_%' escape '\' loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role,submission_media_broker,media_broker_do_login',f);
 end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='submission_media' and p.proname in ('do_observe','do_admit','do_scope_status','do_claim','do_resolve','do_heartbeat','do_inspect','do_record','do_finish','do_charge','do_settle') loop execute format('grant execute on function %s to media_broker_do_login',f);end loop;
end$$;

-- Application-held Storage authority. The DO host receives neither a service
-- role key nor a general Storage key. Each signed request is consumed durably.
create table submission_media.do_transfer_claims (
 nonce uuid primary key,run_id uuid not null references submission_media.do_runs(id),
 job_id uuid not null,epoch bigint not null,token uuid not null,kind text not null check(kind in ('input','output','verify')),bytes bigint,sha256 text,
 created_at timestamptz not null default clock_timestamp()
);
alter table submission_media.do_transfer_claims enable row level security;
alter table submission_media.do_transfer_claims force row level security;
create policy installer_only on submission_media.do_transfer_claims to postgres using(true) with check(true);
revoke all on submission_media.do_transfer_claims from public,anon,authenticated,service_role,submission_media_broker,media_broker_do_login;
create trigger do_transfer_claims_immutable before update or delete on submission_media.do_transfer_claims for each row execute function submission_media.do_audit_immutable();
create function public.media_do_transfer(p_run uuid,p_boot uuid,p_job uuid,p_epoch bigint,p_token uuid,p_nonce uuid,p_kind text,p_bytes bigint,p_sha text,p_check boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$declare f jsonb;t submission_media.do_transfer_claims;i jsonb;begin
 if p_nonce is null or p_kind is null or p_kind not in ('input','output','verify') or p_check is null then raise exception 'DO_TRANSFER_DENIED' using errcode='42501';end if;
 f:=submission_media.do_resolve(p_run,p_boot,p_job,p_epoch,p_token);
 if p_check then
 select * into t from submission_media.do_transfer_claims where nonce=p_nonce;
 if not found or (t.run_id,t.job_id,t.epoch,t.token,t.kind,t.bytes,t.sha256) is distinct from (p_run,p_job,p_epoch,p_token,p_kind,p_bytes,p_sha) then raise exception 'DO_TRANSFER_DENIED' using errcode='42501';end if;
 else
 insert into submission_media.do_transfer_claims(nonce,run_id,job_id,epoch,token,kind,bytes,sha256) values(p_nonce,p_run,p_job,p_epoch,p_token,p_kind,p_bytes,p_sha);
 if p_kind='input' then
 if p_bytes is not null or p_sha is not null then raise exception 'DO_TRANSFER_DENIED';end if;
 perform submission_media.do_charge(p_run,p_boot,'input',coalesce((f->'source'->>'bytes')::bigint,(f->>'bytes')::bigint));
 else
 if f->>'job_type' not in ('waveform_generation','preview_generation') or p_sha is null or p_sha!~'^[a-f0-9]{64}$' or p_bytes is null or p_bytes<1 or p_bytes>(f->>'max_bytes')::bigint then raise exception 'DO_TRANSFER_DENIED';end if;
 if p_kind='output' then perform submission_media.do_charge(p_run,p_boot,'output_write',p_bytes);end if;perform submission_media.do_charge(p_run,p_boot,'output_read',p_bytes);
 end if;end if;
 if p_kind='input' then i:=coalesce(nullif(f->'source','null'::jsonb),f);return jsonb_build_object('bucket',i->>'bucket','path',i->>'path','bytes',(i->>'bytes')::bigint,'sha256',i->>'sha256','object_id',i->>'object_id','version',i->>'version');end if;
 return jsonb_build_object('bucket',f->>'bucket','path',f->>'path','bytes',p_bytes,'sha256',p_sha,'job_type',f->>'job_type','output',submission_media.do_inspect(p_run,p_boot,p_job,p_epoch,p_token));end$$;
revoke all on function public.media_do_transfer(uuid,uuid,uuid,bigint,uuid,uuid,text,bigint,text,boolean) from public,anon,authenticated,submission_media_broker,media_broker_do_login;
grant execute on function public.media_do_transfer(uuid,uuid,uuid,bigint,uuid,uuid,text,bigint,text,boolean) to service_role;

-- Independent root launcher checks this application-mediated, read-only permit
-- view before Docker creation. The broker cannot fabricate the server result.
create function public.media_do_launch_status(p_run uuid,p_boot uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare r submission_media.do_runs;p submission_media.execution_permits;begin
 r:=submission_media.do_run(p_run,p_boot);select * into p from submission_media.execution_permits where id=r.permit_id;
 if p.state<>'requested' or p.expires_at<=clock_timestamp() or p.dispatcher_subject<>'620470021' or p.execution_name is distinct from ('digitalocean/nyc3/droplets/620470021/boots/'||p_boot||'/executions/'||p_run) then raise exception 'DO_LAUNCH_DENIED' using errcode='42501';end if;
 return jsonb_build_object('authorized',true,'run_id',p_run,'boot_id',p_boot,'host_id','620470021','worker_digest',r.worker_digest);end$$;
revoke all on function public.media_do_launch_status(uuid,uuid) from public,anon,authenticated,submission_media_broker,media_broker_do_login;
grant execute on function public.media_do_launch_status(uuid,uuid) to service_role;
commit;
