-- LOCAL reconstructed-baseline rollback, not a production restore script.
-- A future production rollback must use its own captured preflight definition.
-- Stop dispatch and roll back the application before this schema rollback.
begin;
drop trigger if exists queue_default_preview_after_waveform on submission_media.assets;
drop function if exists submission_media.queue_default_preview();
drop function if exists public.marketplace_waveform_locator(uuid,uuid,uuid);
create or replace function public.media_request_preview(p_submission uuid,p_revision bigint,p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s submission_media.submissions; m submission_media.assets; o submission_media.operations; a uuid; ss bigint; es bigint; begin
  perform submission_media.require_capability('reservations');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media-quota:'||submission_media.require_actor('artist')::text,0)); s:=submission_media.lock_owned(p_submission,null);
  o:=submission_media.begin_operation(s.id,'generate_preview',p_key,jsonb_build_object('revision',p_revision)); if o.state='complete' then return o.result; end if;
  if p_revision is null or s.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  perform submission_media.check_region(s.selection_master_id,s.selection_start_ms,s.selection_end_ms);
  select * into m from submission_media.assets where id=s.selection_master_id and submission_id=s.id and technical_state='ready';
  if not found then raise exception 'Invalid source' using errcode='22023'; end if;
  if not exists(select 1 from submission_media.assets where source_asset_id=m.id and kind='waveform' and technical_state='ready') then raise exception 'Waveform not ready' using errcode='55000'; end if;
  ss:=floor(s.selection_start_ms::numeric*m.sample_rate/1000)::bigint;
  es:=case when m.duration_us<15000000 then m.measured_frames else floor(s.selection_end_ms::numeric*m.sample_rate/1000)::bigint end;
  select id into a from submission_media.assets where source_asset_id=m.id and kind='buyer_preview' and start_sample=ss and end_sample=es and generation_profile='preview-aac-lc-v1';
  if a is null then
    if (select count(*) from submission_media.assets quota_asset join submission_media.submissions owned on owned.id=quota_asset.submission_id where owned.owner_id=s.owner_id and quota_asset.kind='buyer_preview' and quota_asset.created_at>now()-interval '1 hour')>=20 then raise exception 'Preview limit reached' using errcode='54000'; end if;
    a:=gen_random_uuid();
    insert into submission_media.assets(id,submission_id,operation_id,kind,origin,bucket,object_path,reservation_expires_at,source_asset_id,region_start_ms,region_end_ms,start_sample,end_sample,generation_profile)
    values(a,s.id,o.id,'buyer_preview','generated','submission-derived',s.owner_id::text||'/'||s.id::text||'/'||a::text||'/preview.m4a',clock_timestamp()+interval '24 hours',m.id,s.selection_start_ms,s.selection_end_ms,ss,es,'preview-aac-lc-v1');
    insert into submission_media.jobs(submission_id,asset_id,operation_id,job_type,profile_version) values(s.id,a,o.id,'preview_generation','preview-aac-lc-v1');
    perform submission_media.append_event(s.id,'preview_requested',a,o.id,null,null,'artist');
  end if;
  return submission_media.finish_operation(o.id,jsonb_build_object('asset_id',a,'revision',submission_media.bump(s.id)));
end $$;
commit;
-- Existing jobs, attempts, assets, holds and accounting remain untouched.
