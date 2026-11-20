-- Selection is confirmed by final SEC submission, never by moving the region.
-- This confirms a private candidate only; it cannot activate a published asset.
begin;
create or replace function submission_media.confirm_selected_preview(p_submission uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions; p submission_media.assets; begin
 perform submission_media.require_capability('reservations');
 s:=submission_media.lock_owned(p_submission,null);
 if s.selection_master_id is distinct from s.working_master_id or s.working_master_id is null then
  raise exception 'PREVIEW_PREPARING' using errcode='55000';
 end if;
 select a.* into p from submission_media.assets a
 join submission_media.assets m on m.id=a.source_asset_id and m.submission_id=a.submission_id and m.technical_state='ready'
 join storage.objects x on x.id=a.storage_object_id and x.version=a.storage_version and x.bucket_id=a.bucket and x.name=a.object_path
 join storage.buckets b on b.id=a.bucket and not b.public
 where a.submission_id=s.id and a.source_asset_id=s.working_master_id and a.kind='buyer_preview' and a.technical_state='ready'
 and a.region_start_ms=s.selection_start_ms and a.region_end_ms=s.selection_end_ms
 and a.start_sample=floor(s.selection_start_ms::numeric*m.sample_rate/1000)::bigint
 and a.end_sample=case when m.duration_us<15000000 then m.measured_frames else floor(s.selection_end_ms::numeric*m.sample_rate/1000)::bigint end
 and a.generation_profile='preview-aac-lc-v1'
 order by a.created_at desc limit 1 for update of a;
 if not found then
  if exists(select 1 from submission_media.assets a where a.submission_id=s.id and a.source_asset_id=s.working_master_id and a.kind='buyer_preview' and a.region_start_ms=s.selection_start_ms and a.region_end_ms=s.selection_end_ms and a.technical_state='failed') then
   raise exception 'PREVIEW_FAILED' using errcode='55000';
  end if;
  raise exception 'PREVIEW_PREPARING' using errcode='55000';
 end if;
 if s.accepted_preview_id is distinct from p.id or p.accepted_at is null then
  update submission_media.assets set accepted_at=coalesce(accepted_at,clock_timestamp()),accepted_by=coalesce(accepted_by,s.owner_id) where id=p.id;
  update submission_media.submissions set accepted_preview_id=p.id where id=s.id;
  perform submission_media.append_event(s.id,'preview_accepted',p.id,null,null,null,'artist',jsonb_build_object('start_ms',s.selection_start_ms,'end_ms',s.selection_end_ms));
 end if;
end $$;
revoke all on function submission_media.confirm_selected_preview(uuid) from public,anon,authenticated,service_role;
-- Preserve authoritative installed routine bodies, owners, ACLs and all rights checks.
do $patch$
declare body text; target regprocedure; anchor text;
begin
 target:='public.media_submission_prepare(uuid,bigint,uuid)'::regprocedure;
 body:=pg_get_functiondef(target); anchor:=' d:=s.workspace_draft;';
 if position('submission_media.confirm_selected_preview' in body)=0 then
  if position(anchor in body)=0 or position('STALE_REVISION' in body)=0 then raise exception 'Unexpected prepare contract';end if;
  body:=replace(body,anchor,' perform submission_media.confirm_selected_preview(s.id); select * into s from submission_media.submissions where id=s.id;'||anchor);execute body;
 end if;
 target:='public.media_upload_submit(uuid,bigint,uuid)'::regprocedure;
 body:=pg_get_functiondef(target);anchor:=' if s.track_id is null or s.working_master_id is null';
 if position('submission_media.confirm_selected_preview' in body)=0 then
  if position(anchor in body)=0 or position('STALE_REVISION' in body)=0 then raise exception 'Unexpected submission contract';end if;
  body:=replace(body,anchor,' perform submission_media.confirm_selected_preview(s.id); select * into s from submission_media.submissions where id=s.id;'||anchor);execute body;
 end if;
 target:='public.media_request_master_review(uuid,uuid,uuid,bigint,uuid)'::regprocedure;
 body:=pg_get_functiondef(target);anchor:='  h:=submission_media.package_hash(p_master,p_preview);';
 if position('Public Preview must match the latest selection' in body)=0 then
  if position(anchor in body)=0 or position('submission_media.lock_owned' in body)=0 then raise exception 'Unexpected review contract';end if;
  body:=replace(body,anchor,'  if s.selection_master_id is distinct from p_master or not exists(select 1 from submission_media.assets a where a.id=p_preview and a.submission_id=s.id and a.source_asset_id=p_master and a.region_start_ms=s.selection_start_ms and a.region_end_ms=s.selection_end_ms) then raise exception ''Public Preview must match the latest selection'' using errcode=''22023'';end if;'||anchor);execute body;
 end if;
end $patch$;
commit;
