-- Additive reconstruction change. Do not replay historical migrations in production.
begin;
do $$ begin if current_user <> 'postgres' then raise exception 'Verified postgres installer required'; end if; end $$;

-- Preview creation uses its own quota key. Upload reservations keep their
-- existing owner key, so completing a job cannot invert the upload lock order.
-- Both preview paths lock submission before this preview-only quota lock.
create or replace function public.media_request_preview(p_submission uuid,p_revision bigint,p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s submission_media.submissions; m submission_media.assets; o submission_media.operations; a uuid; ss bigint; es bigint; begin
  perform submission_media.require_capability('reservations');
  s:=submission_media.lock_owned(p_submission,null);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media-preview-quota:'||s.owner_id::text,0));
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

create or replace function submission_media.queue_default_preview() returns trigger
language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions; m submission_media.assets; a uuid;
  start_ms bigint; end_ms bigint; ss bigint; es bigint;
begin
  if new.kind <> 'waveform' or new.technical_state <> 'ready' or old.technical_state = 'ready' then return new; end if;
  if not exists(select 1 from submission_media.capabilities where singleton and reservations_enabled and worker_enabled) then return new; end if;
  select * into s from submission_media.submissions where id=new.submission_id for update;
  if s.working_master_id is distinct from new.source_asset_id then return new; end if;
  select * into m from submission_media.assets where id=new.source_asset_id and submission_id=s.id and kind='source_master' and technical_state='ready';
  if not found then raise exception 'Validated source required' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media-preview-quota:'||s.owner_id::text,0));
  -- Same owner quota lock/order as the existing preview request. Only one default
  -- per source/profile/sample range, including re-delivered completion callbacks.
  -- The caller already holds the submission lock through complete_job.
  start_ms:=0;
  end_ms:=case when m.duration_us<15000000 then floor(m.duration_us/1000.0)::bigint
               else least(30000,floor(m.duration_us/100000.0)::bigint*100) end;
  if s.selection_master_id=m.id and s.selection_start_ms is not null and s.selection_end_ms is not null then
    start_ms:=s.selection_start_ms; end_ms:=s.selection_end_ms;
  end if;
  perform submission_media.check_region(m.id,start_ms,end_ms);
  ss:=floor(start_ms::numeric*m.sample_rate/1000)::bigint;
  es:=case when m.duration_us<15000000 then m.measured_frames else floor(end_ms::numeric*m.sample_rate/1000)::bigint end;
  if exists(select 1 from submission_media.assets where source_asset_id=m.id and kind='buyer_preview' and start_sample=ss and end_sample=es and generation_profile='preview-aac-lc-v1') then return new; end if;
  -- Existing owner limit still applies; no automatic retry or quota bypass.
  if (select count(*) from submission_media.assets a0 join submission_media.submissions s0 on s0.id=a0.submission_id
      where s0.owner_id=s.owner_id and a0.kind='buyer_preview' and a0.created_at>now()-interval '1 hour')>=20 then return new; end if;
  a:=gen_random_uuid();
  insert into submission_media.assets(id,submission_id,operation_id,kind,origin,bucket,object_path,reservation_expires_at,source_asset_id,
    region_start_ms,region_end_ms,start_sample,end_sample,generation_profile)
  values(a,s.id,new.operation_id,'buyer_preview','generated','submission-derived',s.owner_id::text||'/'||s.id::text||'/'||a::text||'/preview.m4a',
    clock_timestamp()+interval '24 hours',m.id,start_ms,end_ms,ss,es,'preview-aac-lc-v1');
  insert into submission_media.jobs(submission_id,asset_id,operation_id,job_type,profile_version)
    values(s.id,a,new.operation_id,'preview_generation','preview-aac-lc-v1');
  if s.selection_master_id is distinct from m.id or s.selection_start_ms is null or s.selection_end_ms is null then
    update submission_media.submissions set selection_master_id=m.id,selection_start_ms=start_ms,selection_end_ms=end_ms,
      selection_revision=selection_revision+1 where id=s.id;
  end if;
  perform submission_media.append_event(s.id,'preview_requested',a,new.operation_id,null,null,'worker',jsonb_build_object('start_ms',start_ms,'end_ms',end_ms));
  -- No acceptance, publication, permit creation or capability enablement here.
  return new;
end $$;
revoke all on function submission_media.queue_default_preview() from public,anon,authenticated,service_role,submission_media_broker;
drop trigger if exists queue_default_preview_after_waveform on submission_media.assets;
create trigger queue_default_preview_after_waveform after update of technical_state on submission_media.assets
for each row execute function submission_media.queue_default_preview();

-- A separate service-only locator leaves the existing preview/artwork RPC intact.
create or replace function public.marketplace_waveform_locator(p_actor uuid,p_session uuid,p_track uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from auth.sessions where id=p_session and user_id=p_actor)
    or not exists(select 1 from public.user_profiles where id=p_actor and role='buyer') or not catalog_private.visible(p_track) then
    raise exception 'Preview unavailable' using errcode='42501';
  end if;
  select jsonb_build_object('asset_id',w.id,'bucket',w.bucket,'path',w.object_path,'sha256',encode(w.sha256,'hex'),'bytes',w.storage_bytes,
    'version',w.storage_version,'source_sha256',encode(m.sha256,'hex'),'start_sample',p.start_sample,'end_sample',p.end_sample,
    'sample_rate',m.sample_rate,'duration_us',p.duration_us,'preview_asset_id',p.id) into result
  from submission_media.submissions s
  join submission_media.assets m on m.id=s.current_master_id and m.submission_id=s.id and m.kind='source_master' and m.technical_state='ready'
  join submission_media.assets p on p.id=s.current_preview_id and p.submission_id=s.id and p.kind='buyer_preview'
    and p.source_asset_id=m.id and p.technical_state='ready' and p.accepted_at is not null
  join storage.objects px on px.id=p.storage_object_id and px.version=p.storage_version and px.bucket_id=p.bucket and px.name=p.object_path
  join storage.buckets pb on pb.id=p.bucket and not pb.public
  join storage.objects mx on mx.id=m.storage_object_id and mx.version=m.storage_version and mx.bucket_id=m.bucket and mx.name=m.object_path
  join storage.buckets mb on mb.id=m.bucket and not mb.public
  join submission_media.master_reviews r on r.id=s.current_review_id and r.submission_id=s.id and r.state='approved'
    and r.candidate_master_id=m.id and r.candidate_preview_id=p.id
  join submission_media.assets w on w.source_asset_id=m.id and w.submission_id=s.id and w.kind='waveform' and w.technical_state='ready'
  join storage.objects x on x.id=w.storage_object_id and x.version=w.storage_version and x.bucket_id=w.bucket and x.name=w.object_path
  join storage.buckets b on b.id=w.bucket and not b.public
  where s.track_id=p_track and s.managed_preview and w.bucket='submission-derived' and w.storage_bytes between 516 and 360512;
  if result is null then raise exception 'Preview unavailable' using errcode='42501'; end if;
  return result;
end $$;
revoke all on function public.marketplace_waveform_locator(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_waveform_locator(uuid,uuid,uuid) to service_role;
commit;
