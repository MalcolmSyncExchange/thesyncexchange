-- Preserve immutable history, roles, fencing and all existing resource ceilings.
begin;
CREATE OR REPLACE FUNCTION public.media_upload_reserve(p_submission uuid, p_role text, p_label text, p_filename text, p_bytes bigint, p_revision bigint, p_key uuid, p_replaces uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s submission_media.submissions; o submission_media.operations; aid uuid:=gen_random_uuid(); previous submission_media.upload_files; kind text; expires timestamptz:=clock_timestamp()+interval '24 hours'; begin
 perform submission_media.require_capability('reservations');perform pg_advisory_xact_lock(hashtextextended('media-quota:'||submission_media.require_actor('artist')::text,0));s:=submission_media.lock_owned(p_submission,null);
 if p_role is null or p_role not in ('master','instrumental','clean','alternate','stem','supporting','artwork') or p_bytes is null or p_bytes<=0 or p_bytes>(case when p_role='artwork' then 10000000 else 150000000 end) or p_label is null or p_label<>btrim(p_label) or length(p_label) not between 1 and 80 or p_label~'[[:cntrl:]]' or p_filename is null or length(p_filename) not between 1 and 255 or p_filename~'[[:cntrl:]/\\]' then raise exception 'Invalid upload reservation' using errcode='22023';end if;
 if (p_role='artwork' and p_filename !~* '[.](jpg|jpeg|png|webp)$') or (p_role<>'artwork' and p_filename !~* '[.](wav|aif|aiff|aifc|flac)$') then raise exception 'Unsupported upload format' using errcode='22023';end if;
 o:=submission_media.begin_operation(s.id,'reserve_upload',p_key,jsonb_build_object('role',p_role,'label',p_label,'filename',p_filename,'bytes',p_bytes,'revision',p_revision,'replaces',p_replaces));if o.state='complete' then return o.result;end if;
 if p_revision is null or s.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='40001';end if;
 if exists(select 1 from submission_media.master_reviews where submission_id=s.id and state='pending') then raise exception 'Review in progress' using errcode='55000';end if;
 if p_replaces is not null then select * into previous from submission_media.upload_files where asset_id=p_replaces and submission_id=s.id and retired_at is null and role=p_role and label=p_label for update;if not found then raise exception 'Invalid replacement' using errcode='42501';end if;
 elsif p_role in ('master','artwork') then select * into previous from submission_media.upload_files where submission_id=s.id and role=p_role and retired_at is null for update;
 elsif exists(select 1 from submission_media.upload_files where submission_id=s.id and role=p_role and label=p_label and retired_at is null) then raise exception 'Choose the exact file to replace' using errcode='22023';end if;
 if (select count(*) from submission_media.assets a join submission_media.submissions x on x.id=a.submission_id where x.owner_id=s.owner_id and a.technical_state in ('reserved','uploaded','verifying') and (a.technical_state<>'reserved' or a.reservation_expires_at>now()) and not exists(select 1 from submission_media.upload_files f where f.asset_id=a.id and f.retired_at is not null))>=4 or (select count(*) from submission_media.assets a join submission_media.submissions x on x.id=a.submission_id where x.owner_id=s.owner_id and a.created_at>now()-interval '24 hours' and a.origin='upload')>=20 then raise exception 'Upload limit reached' using errcode='54000';end if;
 kind:=case when p_role='artwork' then 'artwork' else 'source_master' end;
 if previous.asset_id is not null then update submission_media.upload_files set retired_at=clock_timestamp(),retired_reason='replaced' where asset_id=previous.asset_id;end if;
 insert into submission_media.assets(id,submission_id,operation_id,kind,origin,display_filename,declared_bytes,bucket,object_path,reservation_expires_at) values(aid,s.id,o.id,kind,'upload',p_filename,p_bytes,case when kind='artwork' then 'submission-artwork' else 'submission-source' end,s.owner_id::text||'/'||s.id::text||'/'||aid::text||'/original',expires);
 insert into submission_media.upload_files(asset_id,submission_id,role,label) values(aid,s.id,p_role,p_label);
 if p_role='master' then update submission_media.submissions set working_master_id=aid,accepted_preview_id=null,selection_master_id=null,selection_start_ms=null,selection_end_ms=null where id=s.id;end if;
 perform submission_media.append_event(s.id,'asset_reserved',aid,o.id,null,null,'artist',jsonb_build_object('previous_asset_id',previous.asset_id));
 return submission_media.finish_operation(o.id,jsonb_build_object('asset_id',aid,'revision',submission_media.bump(s.id),'expires_at',expires));end$function$
;
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
 where s.owner_id=c.allowed_owner and x.created_at>=c.jobs_after and x.state in ('queued','retry_wait') and x.available_at<=clock_timestamp() and x.attempt<least(x.max_attempts,3)
 and x.job_type in ('source_validation','waveform_generation','preview_generation','artwork_validation')
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
 select case when not enabled or allowed_owner is distinct from auth.uid() then 'operator_disabled'
 when expires_at<=clock_timestamp() then 'window_expired'
 when observed_at is null or observed_at<clock_timestamp()-interval '90 seconds' then 'accounting_stale' end into reason
 from submission_media.do_control where singleton;
 return result||jsonb_build_object('processing',jsonb_build_object('paused_reason',coalesce(reason,case when not exists(select 1 from submission_media.do_control where singleton) then 'operator_disabled' end)));
end$$;
-- Bucket privacy and object authorization are unchanged. Project global limit must also permit 150 MB.
update storage.buckets set file_size_limit=150000000 where id='submission-source' and not public and file_size_limit=50000000;
commit;
