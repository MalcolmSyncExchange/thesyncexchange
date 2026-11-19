-- Recoverable removal from the Artist Desk. No Storage objects, catalog,
-- legal records, job attempts, permits or financial records are deleted.
begin;
alter table submission_media.submissions add column deleted_at timestamptz;
create table submission_media.draft_lifecycle_events (
 id bigint generated always as identity primary key,
 submission_id uuid not null references submission_media.submissions(id),
 actor_id uuid not null references public.user_profiles(id),
 action text not null check(action in ('deleted','restored')),
 created_at timestamptz not null default clock_timestamp()
);
alter table submission_media.draft_lifecycle_events enable row level security;
alter table submission_media.draft_lifecycle_events force row level security;
create policy installer_only on submission_media.draft_lifecycle_events to postgres using(true) with check(true);
revoke all on submission_media.draft_lifecycle_events from public,anon,authenticated,service_role,media_broker_do_login;
create trigger immutable_draft_lifecycle before update or delete on submission_media.draft_lifecycle_events for each row execute function submission_media.do_audit_immutable();
create index draft_lifecycle_actor_time on submission_media.draft_lifecycle_events(actor_id,created_at);
create function submission_media.draft_lifecycle_rate(p_actor uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if (select count(*) from submission_media.draft_lifecycle_events where actor_id=p_actor and created_at>clock_timestamp()-interval '1 minute')>=20
 or (select count(*) from submission_media.draft_lifecycle_events where actor_id=p_actor and created_at>clock_timestamp()-interval '24 hours')>=200 then raise exception 'Draft change quota reached' using errcode='54000';end if;
end$$;
revoke all on function submission_media.draft_lifecycle_rate(uuid) from public,anon,authenticated,service_role,media_broker_do_login;
create or replace function submission_media.lock_owned(p_id uuid,p_revision bigint) returns submission_media.submissions
language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions;u uuid:=submission_media.require_actor('artist');begin
 select * into s from submission_media.submissions where id=p_id and owner_id=u and deleted_at is null for update;
 if not found then raise exception 'Permission denied' using errcode='42501';end if;
 if p_revision is not null and s.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='40001';end if;
 return s;
end$$;
create function public.media_submission_delete(p_submission uuid,p_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions;u uuid:=submission_media.require_actor('artist');begin
 perform submission_media.require_capability('reservations');
 -- Same lock order as DO admission; no deletion can race a new claim.
 perform pg_catalog.pg_advisory_xact_lock(731003,4);
 select * into s from submission_media.submissions where id=p_submission and owner_id=u for update;
 if not found then raise exception 'Permission denied' using errcode='42501';end if;
 if s.deleted_at is not null then return jsonb_build_object('deleted',true);end if;
 if p_revision is null or s.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='40001';end if;
 if s.current_master_id is not null or s.current_review_id is not null
 or exists(select 1 from submission_media.master_reviews where submission_id=s.id)
 or (s.track_id is not null and not exists(select 1 from public.tracks where id=s.track_id and status='draft'))
 or exists(select 1 from licensing_private.source_asset_links l join submission_media.assets a on a.id=l.master_id where a.submission_id=s.id)
 then raise exception 'Submitted or referenced music cannot be deleted' using errcode='42501';end if;
 if exists(select 1 from submission_media.jobs where submission_id=s.id and state='running')
 or exists(select 1 from submission_media.do_runs r join submission_media.jobs j on j.id=r.job_id where j.submission_id=s.id and r.state='issued')
 then raise exception 'DRAFT_PROCESSING_ACTIVE' using errcode='55000';end if;
 perform submission_media.draft_lifecycle_rate(u);
 update submission_media.submissions set deleted_at=clock_timestamp(),revision=revision+1 where id=s.id;
 insert into submission_media.draft_lifecycle_events(submission_id,actor_id,action) values(s.id,u,'deleted');
 return jsonb_build_object('deleted',true);
end$$;
create function public.media_submission_restore(p_submission uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions;u uuid:=submission_media.require_actor('artist');begin
 perform submission_media.require_capability('reservations');perform pg_catalog.pg_advisory_xact_lock(731003,4);
 select * into s from submission_media.submissions where id=p_submission and owner_id=u for update;
 if not found then raise exception 'Permission denied' using errcode='42501';end if;
 if s.deleted_at is not null then
 perform submission_media.draft_lifecycle_rate(u);
 update submission_media.submissions set deleted_at=null,revision=revision+1 where id=s.id;
 insert into submission_media.draft_lifecycle_events(submission_id,actor_id,action) values(s.id,u,'restored');end if;
 return jsonb_build_object('restored',true);
end$$;
create function submission_media.draft_list(p_deleted boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=submission_media.require_actor('artist');begin
 perform submission_media.require_capability('reads');return coalesce((select jsonb_agg(jsonb_build_object(
 'id',s.id,'revision',s.revision,'track_id',s.track_id,'title',coalesce(nullif(s.workspace_draft->>'title',''),t.title,'Untitled music draft'),
 'saved_at',s.last_saved_at,'deleted',s.deleted_at is not null,
 'can_delete',s.current_master_id is null and s.current_review_id is null and not exists(select 1 from submission_media.master_reviews where submission_id=s.id) and (s.track_id is null or t.status='draft'),
 'file_count',(select count(*) from submission_media.upload_files where submission_id=s.id and retired_at is null),
 'review_state',(select state from submission_media.master_reviews where submission_id=s.id order by created_at desc limit 1)) order by s.last_saved_at desc)
 from (select * from submission_media.submissions where owner_id=u and (deleted_at is not null)=p_deleted order by last_saved_at desc limit 100) s left join public.tracks t on t.id=s.track_id),'[]');end$$;
create or replace function public.media_upload_list() returns jsonb language sql security definer set search_path='' as $$select submission_media.draft_list(false)$$;
create function public.media_deleted_draft_list() returns jsonb language sql security definer set search_path='' as $$select submission_media.draft_list(true)$$;
revoke all on function submission_media.draft_list(boolean),public.media_deleted_draft_list() from public,anon,authenticated,service_role,media_broker_do_login;
grant execute on function public.media_deleted_draft_list() to authenticated;
revoke all on function public.media_submission_delete(uuid,bigint),public.media_submission_restore(uuid) from public,anon,authenticated,service_role;
grant execute on function public.media_submission_delete(uuid,bigint),public.media_submission_restore(uuid) to authenticated;
CREATE OR REPLACE FUNCTION submission_media.do_admit(p_operation uuid, p_boot uuid, p_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare c submission_media.do_control;r submission_media.do_runs;j submission_media.jobs;input submission_media.assets;permit jsonb;projection numeric;begin
 perform pg_advisory_xact_lock(731003,4);c:=submission_media.do_require(p_boot);
 if p_operation is null or p_digest is distinct from c.worker_digest then raise exception 'DO_IDENTITY_DENIED' using errcode='42501';end if;
 select * into r from submission_media.do_runs where state='issued' or id=p_operation order by created_at limit 1;
 if found then return jsonb_build_object('state',r.state,'run_id',r.id,'recovery',true);end if;
 projection:=c.fixed_reserve_usd+c.carry_forward_usd+coalesce((select sum(reserved_usd) from submission_media.do_runs where month=c.month),0)+c.traffic_bytes::numeric/1000000000*.09+c.log_bytes::numeric/1073741824*.5+.10;
 if projection>c.monthly_ceiling_usd then return jsonb_build_object('state','budget_limit');end if;
 -- Historical jobs are not eligible. Canonical owner and new-job cutoff
 -- are installer controlled, never taken from worker request bodies.
 select x.* into j from submission_media.jobs x join submission_media.submissions s on s.id=x.submission_id
 where s.deleted_at is null and s.owner_id=c.allowed_owner and x.created_at>=c.jobs_after and x.state in ('queued','retry_wait') and x.available_at<=clock_timestamp() and x.attempt<least(x.max_attempts,3)
 and x.job_type in ('source_validation','waveform_generation','preview_generation','artwork_validation')
 and exists(select 1 from submission_media.assets a join submission_media.upload_files f on f.asset_id=coalesce(a.source_asset_id,a.id) where a.id=x.asset_id and f.submission_id=s.id and f.retired_at is null)
 order by x.available_at,x.id for update of x skip locked limit 1;
 if not found then return jsonb_build_object('state','idle');end if;
 select * into input from submission_media.assets where id=coalesce((select source_asset_id from submission_media.assets where id=j.asset_id),j.asset_id);
 if input.storage_bytes is null or input.storage_bytes<1 or input.storage_bytes>150000000 then return jsonb_build_object('state','input_limit');end if;
 permit:=submission_media.create_execution_permit(j.id,j.asset_id,j.job_type,j.profile_version,j.state,j.attempt,p_operation,c.host_id);
 perform submission_media.request_execution((permit->>'permit_id')::uuid,c.host_id);
 perform submission_media.bind_execution((permit->>'permit_id')::uuid,c.host_id,'digitalocean/nyc3/droplets/'||c.host_id||'/boots/'||p_boot||'/executions/'||p_operation);
 insert into submission_media.do_runs(id,permit_id,job_id,boot_id,worker_digest,month) values(p_operation,(permit->>'permit_id')::uuid,j.id,p_boot,p_digest,c.month);
 insert into submission_media.do_audit(run_id,kind,cost_usd) values(p_operation,'reserved',.10);
 return jsonb_build_object('state','issued','run_id',p_operation,'job_id',j.id,'recovery',false);end$function$
;

CREATE OR REPLACE FUNCTION public.media_upload_read(p_submission uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
declare result jsonb; reason text;
begin
 result:=submission_media.upload_state(p_submission,false);
 select case when not c.enabled or c.allowed_owner is distinct from auth.uid() then 'operator_disabled'
 when c.expires_at<=clock_timestamp() then 'window_expired'
 when not c.accounting_reconciled or c.carry_forward_usd is null then 'accounting_closed'
 when c.observed_at is null or c.observed_at<clock_timestamp()-interval '90 seconds' then 'accounting_stale'
 when c.fixed_reserve_usd+c.carry_forward_usd+coalesce((select sum(reserved_usd) from submission_media.do_runs where month=c.month),0)+c.traffic_bytes::numeric/1000000000*.09+c.log_bytes::numeric/1073741824*.5+.10>c.monthly_ceiling_usd then 'budget_reserved' end into reason
 from submission_media.do_control c where singleton;
 return result||jsonb_build_object('processing',jsonb_build_object('paused_reason',coalesce(reason,case when not exists(select 1 from submission_media.do_control where singleton) then 'operator_disabled' end)));
end$$;

commit;
