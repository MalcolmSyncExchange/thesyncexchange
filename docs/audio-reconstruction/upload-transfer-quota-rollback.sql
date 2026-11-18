-- Restore prior admission semantics only; never delete upload/history records.
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

commit;
