-- Slice 3 B. Private helpers + purpose-specific RPCs. No generic state setter.
begin;
-- Function ownership is a NOLOGIN, NOBYPASSRLS executor, not a service key.
grant create on schema submission_media,public to submission_media_executor;

create or replace function submission_media.require_actor(p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); begin
  if u is null or not exists(select 1 from public.user_profiles where id=u and role::text=p_role) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  return u;
end $$;

create or replace function submission_media.require_capability(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare enabled boolean; begin
  select case p_name when 'reservations' then reservations_enabled when 'worker' then worker_enabled
    when 'activation' then activation_enabled when 'reads' then foundation_reads_enabled else false end
  into enabled from submission_media.capabilities where singleton;
  if enabled is distinct from true then raise exception 'Media foundation disabled' using errcode='55000'; end if;
end $$;

create or replace function submission_media.lock_owned(p_id uuid,p_revision bigint) returns submission_media.submissions
language plpgsql security definer set search_path = '' as $$
declare s submission_media.submissions; u uuid := submission_media.require_actor('artist'); begin
  select * into s from submission_media.submissions where id=p_id and owner_id=u for update;
  if not found then raise exception 'Permission denied' using errcode='42501'; end if;
  if p_revision is not null and s.revision <> p_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  return s;
end $$;

create or replace function submission_media.begin_operation(p_submission uuid,p_action text,p_key uuid,p_request jsonb) returns submission_media.operations
language plpgsql security definer set search_path = '' as $$
declare o submission_media.operations; h bytea := public.digest(p_request::text,'sha256'); begin
  if p_key is null or auth.uid() is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  insert into submission_media.operations(submission_id,actor_id,action,idempotency_key,request_hash)
  values(p_submission,auth.uid(),p_action,p_key,h) on conflict(actor_id,action,idempotency_key) do nothing;
  select * into o from submission_media.operations where actor_id=auth.uid() and action=p_action and idempotency_key=p_key for update;
  if o.request_hash <> h or (p_action<>'create' and o.submission_id is distinct from p_submission) then raise exception 'Idempotency conflict' using errcode='22023'; end if;
  return o;
end $$;

create or replace function submission_media.finish_operation(p_id uuid,p_result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$ begin
  update submission_media.operations set state='complete',result=p_result,completed_at=clock_timestamp() where id=p_id and state='accepted';
  return p_result;
end $$;

create or replace function submission_media.append_event(p_submission uuid,p_type text,p_asset uuid,p_operation uuid,p_job uuid,p_review uuid,p_actor text,p_details jsonb default '{}') returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Never persist arbitrary errors, URLs or caller JSON. Values are typed/allowlisted below.
  if jsonb_typeof(p_details) <> 'object' or octet_length(p_details::text)>2048 or exists
    (select 1 from jsonb_each(p_details) e where e.key not in ('revision','previous_asset_id','error_code','lease_epoch','attempt','start_ms','end_ms') or jsonb_typeof(e.value) not in ('number','string','null')) or
    p_details::text ~* '(https?://|token|secret|credential|bucket|storage|password)' then
    raise exception 'Unsafe audit payload' using errcode='22023';
  end if;
  insert into submission_media.events(submission_id,event_type,asset_id,operation_id,job_id,review_id,actor_kind,actor_id,details)
  values(p_submission,p_type,p_asset,p_operation,p_job,p_review,p_actor,case when p_actor='worker' then null else auth.uid() end,p_details);
end $$;

create or replace function submission_media.bump(p_id uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare r bigint; begin
  update submission_media.submissions set revision=revision+1,updated_at=clock_timestamp(),last_saved_at=clock_timestamp() where id=p_id returning revision into r;
  return r;
end $$;

create or replace function submission_media.check_region(p_master uuid,p_start bigint,p_end bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare m submission_media.assets; begin
  select * into m from submission_media.assets where id=p_master and kind='source_master' and technical_state='ready';
  if not found or p_start is null or p_end is null or p_start<0 or p_end<=p_start or p_end*1000>m.duration_us then
    raise exception 'Invalid Preview region' using errcode='22023';
  end if;
  if m.duration_us < 15000000 then
    -- Short cues use the entire measured source; terminal duration may not be a 100ms multiple.
    if p_start<>0 or p_end<>m.duration_us/1000 then raise exception 'Short track Preview must use entire source' using errcode='22023'; end if;
  elsif p_start%100<>0 or p_end%100<>0 or p_end-p_start not between 15000 and 60000 then
    raise exception 'Preview must be 15–60 seconds at 100 ms precision' using errcode='22023';
  end if;
end $$;

create or replace function submission_media.package_hash(p_master uuid,p_preview uuid) returns bytea
language sql stable security definer set search_path = '' as $$
 select public.digest(jsonb_build_array(m.id,encode(m.sha256,'hex'),m.storage_object_id,m.storage_version,m.validator_version,
   p.id,encode(p.sha256,'hex'),p.storage_object_id,p.storage_version,p.source_asset_id,p.start_sample,p.end_sample,p.generation_profile,p.accepted_by,p.accepted_at)::text,'sha256')
 from submission_media.assets m join submission_media.assets p on p.source_asset_id=m.id and p.submission_id=m.submission_id
 where m.id=p_master and p.id=p_preview and m.kind='source_master' and p.kind='buyer_preview' and
   m.technical_state='ready' and p.technical_state='ready' and p.accepted_at is not null
$$;

create or replace function submission_media.guard_asset() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m submission_media.assets; begin
  if tg_op='DELETE' then raise exception 'Media evidence is retained' using errcode='42501'; end if;
  if tg_op='UPDATE' then
    if (new.id,new.submission_id,new.operation_id,new.kind,new.origin,new.bucket,new.object_path,new.source_asset_id,new.generation_profile,new.region_start_ms,new.region_end_ms,new.start_sample,new.end_sample)
       is distinct from (old.id,old.submission_id,old.operation_id,old.kind,old.origin,old.bucket,old.object_path,old.source_asset_id,old.generation_profile,old.region_start_ms,old.region_end_ms,old.start_sample,old.end_sample) then
      raise exception 'Immutable asset identity/provenance' using errcode='42501';
    end if;
    if old.storage_object_id is not null and (new.storage_object_id,new.storage_version,new.storage_bytes,new.storage_mime) is distinct from
      (old.storage_object_id,old.storage_version,old.storage_bytes,old.storage_mime) then raise exception 'Immutable Storage identity' using errcode='42501'; end if;
    if old.technical_state='ready' and (to_jsonb(new)-array['accepted_at','accepted_by','superseded_at','orphan_candidate_at','updated_at','source_kind']) is distinct from
      (to_jsonb(old)-array['accepted_at','accepted_by','superseded_at','orphan_candidate_at','updated_at','source_kind']) then raise exception 'Immutable validated evidence' using errcode='42501'; end if;
    if old.accepted_at is not null and (new.accepted_at,new.accepted_by) is distinct from (old.accepted_at,old.accepted_by) then raise exception 'Immutable acceptance' using errcode='42501'; end if;
    if new.technical_state <> old.technical_state and not (
      (old.technical_state='reserved' and new.technical_state in ('uploaded','verifying','expired')) or
      (old.technical_state='uploaded' and new.technical_state='verifying') or
      (old.technical_state='verifying' and new.technical_state in ('ready','failed')) or
      (old.technical_state='failed' and new.technical_state='verifying')) then raise exception 'Invalid asset transition' using errcode='22023'; end if;
  end if;
  if new.kind in ('buyer_preview','waveform') then
    select * into m from submission_media.assets where id=new.source_asset_id and submission_id=new.submission_id and kind='source_master' and technical_state='ready';
    if not found then raise exception 'Validated source provenance required' using errcode='22023'; end if;
    if new.kind='buyer_preview' then
      perform submission_media.check_region(m.id,new.region_start_ms,new.region_end_ms);
      if new.start_sample<>floor(new.region_start_ms::numeric*m.sample_rate/1000)::bigint or
        new.end_sample<>(case when m.duration_us<15000000 then m.measured_frames else floor(new.region_end_ms::numeric*m.sample_rate/1000)::bigint end) or new.end_sample>m.measured_frames then
        raise exception 'Sample provenance mismatch' using errcode='22023';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists media_asset_guard on submission_media.assets;
create trigger media_asset_guard before insert or update or delete on submission_media.assets for each row execute function submission_media.guard_asset();

create or replace function submission_media.guard_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='DELETE' then raise exception 'Review evidence retained' using errcode='42501'; end if;
  if tg_op='UPDATE' and (to_jsonb(new)-array['state','decided_by','decided_at','reason']) is distinct from (to_jsonb(old)-array['state','decided_by','decided_at','reason']) then
    raise exception 'Frozen review package' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (old.state<>'pending' or new.state not in ('approved','rejected')) then raise exception 'Terminal review decision' using errcode='22023'; end if;
  if new.package_hash is distinct from submission_media.package_hash(new.candidate_master_id,new.candidate_preview_id) then
    raise exception 'Review package provenance mismatch' using errcode='22023';
  end if;
  return new;
end $$;
drop trigger if exists media_review_guard on submission_media.master_reviews;
create trigger media_review_guard before insert or update or delete on submission_media.master_reviews for each row execute function submission_media.guard_review();

create or replace function submission_media.guard_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.id,new.owner_id,new.created_at) is distinct from (old.id,old.owner_id,old.created_at) or
    (old.track_id is not null and new.track_id is distinct from old.track_id) or new.revision<old.revision or new.selection_revision<old.selection_revision then
    raise exception 'Immutable checkpoint identity' using errcode='42501';
  end if;
  if new.current_master_id is not null and not exists(select 1 from submission_media.master_reviews r
    where r.submission_id=new.id and r.id=new.current_review_id and r.state='approved' and r.candidate_master_id=new.current_master_id) then
    raise exception 'Current Master requires approved exact package' using errcode='22023'; end if;
  if new.current_preview_id is not null and not exists(select 1 from submission_media.assets p where p.id=new.current_preview_id and p.submission_id=new.id and
    p.kind='buyer_preview' and p.technical_state='ready' and p.accepted_at is not null and p.source_asset_id=new.current_master_id) then
    raise exception 'Current Preview provenance mismatch' using errcode='22023'; end if;
  if new.current_artwork_id is not null and not exists(select 1 from submission_media.assets a where a.id=new.current_artwork_id and a.submission_id=new.id and
    a.kind='artwork' and a.technical_state='ready' and a.accepted_at is not null) then raise exception 'Current Artwork requires accepted validation' using errcode='22023'; end if;
  return new;
end $$;
drop trigger if exists media_submission_guard on submission_media.submissions;
create trigger media_submission_guard before update on submission_media.submissions for each row execute function submission_media.guard_submission();

create or replace function submission_media.guard_event() returns trigger
language plpgsql security definer set search_path = '' as $$ begin
  if tg_op<>'INSERT' then raise exception 'Append-only media audit' using errcode='42501'; end if;
  if exists(select 1 from jsonb_object_keys(new.details) k where k not in ('revision','previous_asset_id','error_code','lease_epoch','attempt','start_ms','end_ms')) or
    new.details::text ~* '(https?://|token|secret|credential|bucket|storage|password)' then raise exception 'Unsafe audit payload' using errcode='22023'; end if;
  return new;
end $$;
drop trigger if exists media_events_immutable on submission_media.events;
create trigger media_events_immutable before insert or update or delete on submission_media.events for each row execute function submission_media.guard_event();

create or replace function public.media_create_submission(p_key uuid,p_track uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid:=submission_media.require_actor('artist'); o submission_media.operations; s submission_media.submissions; begin
  perform submission_media.require_capability('reservations');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media-quota:'||submission_media.require_actor('artist')::text,0));
  if p_track is not null then
    perform 1 from public.tracks where id=p_track and artist_user_id=u for update;
    if not found then raise exception 'Permission denied' using errcode='42501'; end if;
    select * into s from submission_media.submissions where track_id=p_track and owner_id=u;
    if found then return jsonb_build_object('submission_id',s.id,'revision',s.revision); end if;
  end if;
  o:=submission_media.begin_operation(null,'create',p_key,jsonb_build_object('track_id',p_track));
  if o.state='complete' then return o.result; end if;
  if (select count(*) from submission_media.submissions where owner_id=u and created_at>now()-interval '24 hours')>=50 then raise exception 'Submission limit reached' using errcode='54000'; end if;
  insert into submission_media.submissions(owner_id,track_id) values(u,p_track) returning * into s;
  update submission_media.operations set submission_id=s.id where id=o.id;
  perform submission_media.append_event(s.id,'checkpoint_created',null,o.id,null,null,'artist');
  return submission_media.finish_operation(o.id,jsonb_build_object('submission_id',s.id,'revision',0));
end $$;

create or replace function public.media_bind_track(p_submission uuid,p_track uuid,p_revision bigint,p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s submission_media.submissions; o submission_media.operations; begin
  perform submission_media.require_capability('reservations'); s:=submission_media.lock_owned(p_submission,null);
  o:=submission_media.begin_operation(s.id,'bind_track',p_key,jsonb_build_object('track',p_track,'revision',p_revision)); if o.state='complete' then return o.result; end if;
  if p_revision is null or s.revision<>p_revision or s.track_id is not null then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  perform 1 from public.tracks where id=p_track and artist_user_id=s.owner_id and status in ('draft','pending_review') for update;
  if not found then raise exception 'Permission denied' using errcode='42501'; end if;
  update submission_media.submissions set track_id=p_track where id=s.id;
  perform submission_media.append_event(s.id,'track_bound',null,o.id,null,null,'artist');
  return submission_media.finish_operation(o.id,jsonb_build_object('submission_id',s.id,'revision',submission_media.bump(s.id)));
end $$;

create or replace function public.media_reserve_asset(p_submission uuid,p_kind text,p_filename text,p_bytes bigint,p_revision bigint,p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s submission_media.submissions; o submission_media.operations; a submission_media.assets; aid uuid:=gen_random_uuid(); b text; begin
  perform submission_media.require_capability('reservations');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media-quota:'||submission_media.require_actor('artist')::text,0)); s:=submission_media.lock_owned(p_submission,null);
  if p_kind not in ('source_master','artwork') or p_kind is null or p_bytes is null or p_bytes<=0 or p_bytes>(case p_kind when 'source_master' then 250000000 else 10000000 end) then raise exception 'Invalid asset reservation' using errcode='22023'; end if;
  o:=submission_media.begin_operation(s.id,'reserve',p_key,jsonb_build_object('kind',p_kind,'filename',p_filename,'bytes',p_bytes,'revision',p_revision));
  if o.state='complete' then return o.result; end if;
  if p_revision is null or s.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  if p_kind='source_master' and exists(select 1 from submission_media.master_reviews where submission_id=s.id and state='pending') then raise exception 'Master review in progress' using errcode='55000'; end if;
  if (select count(*) from submission_media.assets quota_asset join submission_media.submissions owned on owned.id=quota_asset.submission_id where owned.owner_id=s.owner_id and quota_asset.technical_state in ('reserved','uploaded','verifying') and (quota_asset.technical_state<>'reserved' or quota_asset.reservation_expires_at>now()))>=4 or
    (select count(*) from submission_media.assets quota_asset join submission_media.submissions owned on owned.id=quota_asset.submission_id where owned.owner_id=s.owner_id and quota_asset.created_at>now()-interval '24 hours' and quota_asset.origin='upload')>=20 then raise exception 'Upload limit reached' using errcode='54000'; end if;
  b:=case p_kind when 'source_master' then 'submission-source' else 'submission-artwork' end;
  insert into submission_media.assets(id,submission_id,operation_id,kind,origin,display_filename,declared_bytes,bucket,object_path,reservation_expires_at)
  values(aid,s.id,o.id,p_kind,'upload',p_filename,p_bytes,b,s.owner_id::text||'/'||s.id::text||'/'||aid::text||'/original',clock_timestamp()+interval '24 hours') returning * into a;
  if p_kind='source_master' then update submission_media.submissions set working_master_id=a.id,accepted_preview_id=null,selection_master_id=null,selection_start_ms=null,selection_end_ms=null where id=s.id; end if;
  perform submission_media.append_event(s.id,'asset_reserved',a.id,o.id,null,null,'artist');
  return submission_media.finish_operation(o.id,jsonb_build_object('asset_id',a.id,'operation_id',o.id,'expires_at',a.reservation_expires_at,'revision',submission_media.bump(s.id)));
end $$;

-- Broker-only capability material: never put this in SubmissionAudioState.
create or replace function submission_media.upload_destination(p_asset uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a submission_media.assets; begin
  perform submission_media.require_capability('reservations');
  select * into a from submission_media.assets where id=p_asset and origin='upload' and technical_state='reserved' and reservation_expires_at>clock_timestamp();
  if not found then raise exception 'Invalid reservation' using errcode='22023'; end if;
  return jsonb_build_object('asset_id',a.id,'bucket',a.bucket,'path',a.object_path,'expires_at',a.reservation_expires_at,'maximum_bytes',a.declared_bytes,'upsert',false);
end $$;

create or replace function submission_media.observe_upload(p_asset uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a submission_media.assets; obj storage.objects; s submission_media.submissions; jt text; begin
  perform submission_media.require_capability('reservations');
  select submission_id into s.id from submission_media.assets where id=p_asset;
  select * into s from submission_media.submissions where id=s.id for update;
  select * into a from submission_media.assets where id=p_asset for update;
  if not found or a.origin not in ('upload','legacy_adoption') then raise exception 'Invalid reservation' using errcode='22023'; end if;
  if a.storage_object_id is not null then return jsonb_build_object('asset_id',a.id,'state',a.technical_state); end if;
  if a.reservation_expires_at<=clock_timestamp() then raise exception 'Expired reservation' using errcode='22023'; end if;
  select * into obj from storage.objects where bucket_id=a.bucket and name=a.object_path;
  if not found or obj.version is null or obj.metadata->>'size' is null or (obj.metadata->>'size')::bigint<>a.declared_bytes or
    (a.origin='upload' and coalesce(obj.owner_id,obj.owner::text) is distinct from s.owner_id::text) then raise exception 'Exact object verification failed' using errcode='22023'; end if;
  update submission_media.assets set storage_object_id=obj.id,storage_version=obj.version,storage_bytes=(obj.metadata->>'size')::bigint,
    storage_mime=coalesce(obj.metadata->>'mimetype','application/octet-stream'),technical_state='uploaded',upload_observed_at=clock_timestamp() where id=a.id;
  jt:=case when a.origin='legacy_adoption' then 'legacy_source_verification' when a.kind='source_master' then 'source_validation' else 'artwork_validation' end;
  insert into submission_media.jobs(submission_id,asset_id,operation_id,job_type,profile_version)
  values(a.submission_id,a.id,a.operation_id,jt,case when a.kind='source_master' then 'source-validator-v1' else 'artwork-validator-v1' end) on conflict do nothing;
  perform submission_media.append_event(a.submission_id,'upload_observed',a.id,a.operation_id,null,null,'worker');
  perform submission_media.bump(s.id);
  return jsonb_build_object('asset_id',a.id,'state','uploaded');
end $$;

-- Explicit lazy source adoption, not backfill. Strict relative legacy reference only.
-- Existing catalog stays legacy until a complete generated/accepted package is reviewed.
create or replace function public.media_request_legacy_adoption(p_submission uuid,p_revision bigint,p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s submission_media.submissions; o submission_media.operations; path text; obj storage.objects; a uuid; begin
  perform submission_media.require_capability('reservations'); s:=submission_media.lock_owned(p_submission,null);
  o:=submission_media.begin_operation(s.id,'adopt_legacy',p_key,jsonb_build_object('revision',p_revision)); if o.state='complete' then return o.result; end if;
  if p_revision is null or s.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  if s.track_id is null or s.managed_master or s.working_master_id is not null then raise exception 'Legacy adoption unavailable' using errcode='55000'; end if;
  select audio_file_path into path from public.tracks where id=s.track_id and artist_user_id=s.owner_id for update;
  if path is null or path !~ ('^'||s.owner_id::text||'/') or path ~ '(://|%|\.\.|[?#!\\])' then raise exception 'Legacy source remains read-only; replace Master' using errcode='22023'; end if;
  select * into obj from storage.objects where bucket_id='track-audio' and name=path;
  if not found or obj.version is null or obj.metadata->>'size' is null then raise exception 'Legacy source remains read-only; replace Master' using errcode='22023'; end if;
  insert into submission_media.assets(submission_id,operation_id,kind,origin,declared_bytes,bucket,object_path,reservation_expires_at)
  values(s.id,o.id,'source_master','legacy_adoption',(obj.metadata->>'size')::bigint,'track-audio',path,clock_timestamp()+interval '24 hours') returning id into a;
  update submission_media.submissions set working_master_id=a where id=s.id;
  perform submission_media.append_event(s.id,'legacy_adoption_requested',a,o.id,null,null,'artist');
  return submission_media.finish_operation(o.id,jsonb_build_object('asset_id',a,'revision',submission_media.bump(s.id)));
end $$;

create or replace function public.media_select_preview_region(p_submission uuid,p_master uuid,p_start_ms bigint,p_end_ms bigint,p_revision bigint,p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s submission_media.submissions; o submission_media.operations; begin
  perform submission_media.require_capability('reservations'); s:=submission_media.lock_owned(p_submission,null);
  o:=submission_media.begin_operation(s.id,'select_region',p_key,jsonb_build_object('master',p_master,'start',p_start_ms,'end',p_end_ms,'revision',p_revision)); if o.state='complete' then return o.result; end if;
  if p_revision is null or s.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  if p_master is null or not exists(select 1 from submission_media.assets where id=p_master and submission_id=s.id and kind='source_master' and technical_state='ready') then
    raise exception 'Invalid Master' using errcode='42501'; end if;
  if p_master is distinct from s.working_master_id and p_master is distinct from s.current_master_id then raise exception 'Invalid Master' using errcode='42501'; end if;
  perform submission_media.check_region(p_master,p_start_ms,p_end_ms);
  update submission_media.submissions set selection_master_id=p_master,selection_start_ms=p_start_ms,selection_end_ms=p_end_ms,selection_revision=selection_revision+1 where id=s.id;
  perform submission_media.append_event(s.id,'region_changed',p_master,o.id,null,null,'artist',jsonb_build_object('start_ms',p_start_ms,'end_ms',p_end_ms));
  return submission_media.finish_operation(o.id,jsonb_build_object('revision',submission_media.bump(s.id)));
end $$;

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

create or replace function submission_media.supersede(p_submission uuid,p_old uuid,p_operation uuid) returns void
language plpgsql security definer set search_path = '' as $$ begin
  if p_old is not null then
    update submission_media.assets set superseded_at=clock_timestamp() where id=p_old and submission_id=p_submission;
    perform submission_media.append_event(p_submission,'asset_superseded',p_old,p_operation,null,null,'artist');
  end if;
end $$;

create or replace function public.media_accept_asset(p_submission uuid,p_asset uuid,p_revision bigint,p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s submission_media.submissions; a submission_media.assets; o submission_media.operations; old_id uuid; approved boolean; activate boolean:=false; begin
  perform submission_media.require_capability('reservations'); s:=submission_media.lock_owned(p_submission,null);
  select * into a from submission_media.assets where id=p_asset and submission_id=s.id and kind in ('buyer_preview','artwork') and technical_state='ready' for update;
  if not found then raise exception 'Invalid ready asset' using errcode='42501'; end if;
  o:=submission_media.begin_operation(s.id,case a.kind when 'buyer_preview' then 'accept_preview' else 'accept_artwork' end,p_key,jsonb_build_object('asset',p_asset,'revision',p_revision)); if o.state='complete' then return o.result; end if;
  if p_revision is null or s.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  if a.kind='buyer_preview' and a.source_asset_id is distinct from s.current_master_id and a.source_asset_id is distinct from s.working_master_id then raise exception 'Stale Preview source' using errcode='22023'; end if;
  if s.track_id is not null then select status='approved' into approved from public.tracks where id=s.track_id and artist_user_id=s.owner_id for update; end if;
  activate:=coalesce(approved,false) and (a.kind='artwork' or (s.managed_master and a.source_asset_id=s.current_master_id));
  if activate then perform submission_media.require_capability('activation'); end if;
  update submission_media.assets set accepted_at=coalesce(accepted_at,clock_timestamp()),accepted_by=coalesce(accepted_by,s.owner_id) where id=a.id;
  if a.kind='buyer_preview' then
    update submission_media.submissions set accepted_preview_id=a.id where id=s.id;
    if activate then old_id:=s.current_preview_id; update submission_media.submissions set current_preview_id=a.id,managed_preview=true where id=s.id; end if;
  else
    update submission_media.submissions set accepted_artwork_id=a.id where id=s.id;
    if activate then old_id:=s.current_artwork_id; update submission_media.submissions set current_artwork_id=a.id,managed_artwork=true where id=s.id; end if;
  end if;
  perform submission_media.append_event(s.id,case a.kind when 'buyer_preview' then 'preview_accepted' else 'artwork_accepted' end,a.id,o.id,null,null,'artist');
  if activate then
    if old_id is distinct from a.id then perform submission_media.supersede(s.id,old_id,o.id); end if;
    perform submission_media.append_event(s.id,'asset_activated',a.id,o.id,null,null,'artist',jsonb_build_object('previous_asset_id',old_id));
  end if;
  return submission_media.finish_operation(o.id,jsonb_build_object('asset_id',a.id,'buyer_active',activate,'revision',submission_media.bump(s.id)));
end $$;

create or replace function public.media_request_master_review(p_submission uuid,p_master uuid,p_preview uuid,p_revision bigint,p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s submission_media.submissions; o submission_media.operations; h bytea; rid uuid; begin
  perform submission_media.require_capability('reservations'); s:=submission_media.lock_owned(p_submission,null);
  o:=submission_media.begin_operation(s.id,'request_review',p_key,jsonb_build_object('master',p_master,'preview',p_preview,'revision',p_revision)); if o.state='complete' then return o.result; end if;
  if p_revision is null or s.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  if s.track_id is null or p_master is distinct from s.working_master_id or p_master is not distinct from s.current_master_id or p_preview is distinct from s.accepted_preview_id then raise exception 'Invalid replacement package' using errcode='22023'; end if;
  perform 1 from public.tracks where id=s.track_id and artist_user_id=s.owner_id and status in ('pending_review','approved') for update;
  if not found then raise exception 'Track must enter canonical review workflow first' using errcode='55000'; end if;
  h:=submission_media.package_hash(p_master,p_preview);
  if h is null or not exists(select 1 from submission_media.assets where id=p_master and submission_id=s.id) or not exists(select 1 from submission_media.assets where kind='waveform' and source_asset_id=p_master and submission_id=s.id and technical_state='ready') then raise exception 'New validated Master, waveform and accepted derived Preview required' using errcode='22023'; end if;
  insert into submission_media.master_reviews(submission_id,operation_id,expected_current_master_id,candidate_master_id,candidate_preview_id,package_hash,requested_revision,requested_by)
  values(s.id,o.id,s.current_master_id,p_master,p_preview,h,s.revision+1,s.owner_id) returning id into rid;
  perform submission_media.append_event(s.id,'master_review_requested',p_master,o.id,null,rid,'artist');
  return submission_media.finish_operation(o.id,jsonb_build_object('review_id',rid,'revision',submission_media.bump(s.id)));
end $$;

create or replace function public.media_decide_master_review(p_review uuid,p_approve boolean,p_package_hash text,p_revision bigint,p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid:=submission_media.require_actor('admin'); r submission_media.master_reviews; s submission_media.submissions; o submission_media.operations; h bytea; begin
  perform submission_media.require_capability('activation');
  select * into r from submission_media.master_reviews where id=p_review;
  if not found then raise exception 'Invalid review' using errcode='42501'; end if;
  select * into s from submission_media.submissions where id=r.submission_id for update;
  perform 1 from public.tracks where id=s.track_id and artist_user_id=s.owner_id and status in ('pending_review','approved') for update;
  if not found then raise exception 'Invalid review track' using errcode='22023'; end if;
  select * into r from submission_media.master_reviews where id=p_review for update;
  o:=submission_media.begin_operation(s.id,'decide_review',p_key,jsonb_build_object('review',p_review,'approve',p_approve,'hash',p_package_hash,'revision',p_revision)); if o.state='complete' then return o.result; end if;
  h:=submission_media.package_hash(r.candidate_master_id,r.candidate_preview_id);
  if p_approve is null or r.state<>'pending' or p_revision is null or s.revision<>p_revision or s.current_master_id is distinct from r.expected_current_master_id or
    p_package_hash is distinct from encode(r.package_hash,'hex') or r.package_hash is distinct from h then raise exception 'Stale review package' using errcode='40001'; end if;
  update submission_media.master_reviews set state=case when p_approve then 'approved' else 'rejected' end,decided_by=u,decided_at=clock_timestamp() where id=r.id;
  if p_approve then
    update submission_media.submissions set current_master_id=r.candidate_master_id,current_preview_id=r.candidate_preview_id,current_review_id=r.id,managed_master=true,managed_preview=true where id=s.id;
    -- Existing moderation guard still enforces rights totals. No rights/certification bypass.
    update public.tracks set status='approved' where id=s.track_id;
    perform submission_media.supersede(s.id,s.current_master_id,o.id);
    perform submission_media.supersede(s.id,s.current_preview_id,o.id);
  end if;
  perform submission_media.append_event(s.id,case when p_approve then 'master_review_approved' else 'master_review_rejected' end,r.candidate_master_id,o.id,null,r.id,'admin');
  return submission_media.finish_operation(o.id,jsonb_build_object('review_id',r.id,'approved',p_approve,'revision',submission_media.bump(s.id)));
end $$;

-- Worker RPCs are only granted to the NOLOGIN broker, never authenticated/service_role.
create or replace function submission_media.claim_job() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j submission_media.jobs; a submission_media.assets; m submission_media.assets; exhausted submission_media.jobs; begin
  perform submission_media.require_capability('worker');
  -- Serialize the short claim transaction; processing remains concurrent across owners.
  perform pg_catalog.pg_advisory_xact_lock(731003,1);
  -- Exhausted abandoned leases become visible failures instead of silently stuck jobs.
  for exhausted in update submission_media.jobs set state='failed',lease_token=null,lease_expires_at=null,error_code='worker_lease_expired',retryable=false,completed_at=clock_timestamp()
    where state='running' and lease_expires_at<clock_timestamp() and attempt>=max_attempts returning * loop
    update submission_media.assets set technical_state='failed',safe_error_code='TEMPORARY_SYSTEM_ERROR' where id=exhausted.asset_id and technical_state='verifying';
    perform submission_media.append_event(exhausted.submission_id,'validation_failed',exhausted.asset_id,exhausted.operation_id,exhausted.id,null,'worker',jsonb_build_object('error_code','TEMPORARY_SYSTEM_ERROR'));
  end loop;
  select * into j from submission_media.jobs where attempt<max_attempts and
    ((state in ('queued','retry_wait') and available_at<=clock_timestamp()) or (state='running' and lease_expires_at<clock_timestamp()))
    and not exists(select 1 from submission_media.jobs running join submission_media.submissions rs on rs.id=running.submission_id join submission_media.submissions cs on cs.id=jobs.submission_id where rs.owner_id=cs.owner_id and running.id<>jobs.id and running.state='running')
    order by available_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update submission_media.jobs set state='running',attempt=attempt+1,lease_epoch=lease_epoch+1,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '5 minutes',
    started_at=coalesce(started_at,clock_timestamp()),heartbeat_at=clock_timestamp() where id=j.id returning * into j;
  select * into a from submission_media.assets where id=j.asset_id;
  if a.technical_state<>'ready' then update submission_media.assets set technical_state='verifying',safe_error_code=null,reservation_expires_at=case when origin='generated' then clock_timestamp()+interval '24 hours' else reservation_expires_at end where id=a.id; end if;
  if a.source_asset_id is not null then select * into m from submission_media.assets where id=a.source_asset_id; end if;
  perform submission_media.append_event(j.submission_id,'validation_started',a.id,j.operation_id,j.id,null,'worker',jsonb_build_object('lease_epoch',j.lease_epoch,'attempt',j.attempt));
  return jsonb_build_object('job_id',j.id,'lease_epoch',j.lease_epoch,'lease_token',j.lease_token,'job_type',j.job_type,'profile',j.profile_version,
    'asset_id',a.id,'bucket',a.bucket,'path',a.object_path,'object_id',a.storage_object_id,'version',a.storage_version,
    'source',case when m.id is null then null else jsonb_build_object('asset_id',m.id,'bucket',m.bucket,'path',m.object_path,'object_id',m.storage_object_id,'version',m.storage_version,'sha256',encode(m.sha256,'hex'),'sample_rate',m.sample_rate,'frames',m.measured_frames) end,
    'start_sample',a.start_sample,'end_sample',a.end_sample);
end $$;

create or replace function submission_media.heartbeat_job(p_job uuid,p_epoch bigint,p_token uuid) returns void
language plpgsql security definer set search_path = '' as $$ begin
  perform submission_media.require_capability('worker');
  update submission_media.jobs set heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '5 minutes'
    where id=p_job and state='running' and lease_epoch=p_epoch and lease_token=p_token and lease_expires_at>clock_timestamp();
  if not found then raise exception 'Stale worker lease' using errcode='40001'; end if;
end $$;

create or replace function submission_media.complete_job(p_job uuid,p_epoch bigint,p_token uuid,p_result jsonb,p_error text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j submission_media.jobs; a submission_media.assets; obj storage.objects; s submission_media.submissions; w uuid; code text; begin
  perform submission_media.require_capability('worker');
  select * into j from submission_media.jobs where id=p_job;
  if not found then raise exception 'Invalid job' using errcode='42501'; end if;
  select * into s from submission_media.submissions where id=j.submission_id for update;
  select * into j from submission_media.jobs where id=p_job for update;
  if j.state<>'running' or p_epoch is null or p_token is null or j.lease_epoch<>p_epoch or j.lease_token<>p_token or j.lease_expires_at<=clock_timestamp() then raise exception 'Stale worker lease' using errcode='40001'; end if;
  select * into a from submission_media.assets where id=j.asset_id for update;
  if p_error is not null then
    code:=case p_error when 'unsupported_format' then 'UNSUPPORTED_FORMAT' when 'file_too_large' then 'FILE_TOO_LARGE' when 'audio_unreadable' then 'AUDIO_UNREADABLE'
      when 'no_audio_frames' then 'NO_AUDIO_FRAMES' when 'unsupported_audio_configuration' then 'UNSUPPORTED_AUDIO_CONFIGURATION' when 'waveform_generation_failed' then 'WAVEFORM_GENERATION_FAILED'
      when 'preview_generation_failed' then 'PREVIEW_GENERATION_FAILED' when 'artwork_invalid' then 'ARTWORK_INVALID' else 'TEMPORARY_SYSTEM_ERROR' end;
    update submission_media.jobs set state=case when p_error in ('validator_timeout','temporary_system_error') and attempt<max_attempts then 'retry_wait' else 'failed' end,
      retryable=p_error in ('validator_timeout','temporary_system_error'),error_code=p_error,lease_token=null,lease_expires_at=null,available_at=clock_timestamp()+interval '30 seconds',completed_at=clock_timestamp() where id=j.id;
    update submission_media.assets set technical_state='failed',safe_error_code=code where id=a.id;
    perform submission_media.append_event(s.id,'validation_failed',a.id,j.operation_id,j.id,null,'worker',jsonb_build_object('error_code',code));
    perform submission_media.bump(s.id);
    return jsonb_build_object('state','failed','error_code',code);
  end if;
  if jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text)>4096 or exists(select 1 from jsonb_object_keys(p_result) k where k not in
    ('sha256','actual_bytes','container','codec','frames','duration_us','sample_rate','channels','bit_depth','width','height','animated','waveform_points','build_digest','source_sha256')) or
    (p_result->>'sha256') !~ '^[a-f0-9]{64}$' or (p_result->>'build_digest') !~ '^sha256:[a-f0-9]{64}$' then raise exception 'Invalid bounded validator result' using errcode='22023'; end if;
  select * into obj from storage.objects where bucket_id=a.bucket and name=a.object_path;
  if not found or obj.version is null or (a.storage_object_id is not null and (obj.id,obj.version) is distinct from (a.storage_object_id,a.storage_version)) or
    obj.metadata->>'size' is null or (obj.metadata->>'size')::bigint is distinct from (p_result->>'actual_bytes')::bigint then raise exception 'Storage identity mismatch' using errcode='22023'; end if;
  if a.source_asset_id is not null and not exists(select 1 from submission_media.assets m where m.id=a.source_asset_id and m.technical_state='ready' and encode(m.sha256,'hex')=p_result->>'source_sha256') then raise exception 'Source checksum mismatch' using errcode='22023'; end if;
  if a.kind='artwork' and (p_result->>'animated')::boolean is distinct from false then raise exception 'Artwork invalid' using errcode='22023'; end if;
  if a.kind='buyer_preview' and abs((p_result->>'duration_us')::bigint-(a.region_end_ms-a.region_start_ms)*1000)>100000 then raise exception 'Preview duration mismatch' using errcode='22023'; end if;
  if a.kind='waveform' and (p_result->>'waveform_points')::integer is distinct from (select ceil(duration_us::numeric/10000)::integer from submission_media.assets where id=a.source_asset_id) then raise exception 'Waveform resolution mismatch' using errcode='22023'; end if;
  update submission_media.assets set technical_state='ready',storage_object_id=obj.id,storage_version=obj.version,storage_bytes=(p_result->>'actual_bytes')::bigint,storage_mime=coalesce(obj.metadata->>'mimetype','application/octet-stream'),
    sha256=decode(p_result->>'sha256','hex'),container=p_result->>'container',codec=p_result->>'codec',measured_frames=(p_result->>'frames')::bigint,duration_us=(p_result->>'duration_us')::bigint,
    sample_rate=(p_result->>'sample_rate')::integer,channels=(p_result->>'channels')::integer,bit_depth=(p_result->>'bit_depth')::integer,image_width=(p_result->>'width')::integer,image_height=(p_result->>'height')::integer,
    waveform_points=(p_result->>'waveform_points')::integer,worker_build_digest=p_result->>'build_digest',validator_version=j.profile_version,verified_at=clock_timestamp(),safe_error_code=null where id=a.id;
  update submission_media.jobs set state='succeeded',lease_token=null,lease_expires_at=null,completed_at=clock_timestamp(),retryable=false,error_code=null where id=j.id;
  perform submission_media.append_event(s.id,case a.kind when 'waveform' then 'waveform_generated' when 'buyer_preview' then 'preview_generated' else 'validation_passed' end,a.id,j.operation_id,j.id,null,'worker');
  if a.kind='source_master' then
    w:=gen_random_uuid();
    insert into submission_media.assets(id,submission_id,operation_id,kind,origin,bucket,object_path,reservation_expires_at,source_asset_id,generation_profile)
      values(w,s.id,j.operation_id,'waveform','generated','submission-derived',s.owner_id::text||'/'||s.id::text||'/'||w::text||'/waveform.bin',clock_timestamp()+interval '24 hours',a.id,'waveform-minmax-v1');
    insert into submission_media.jobs(submission_id,asset_id,operation_id,job_type,profile_version) values(s.id,w,j.operation_id,'waveform_generation','waveform-minmax-v1');
  end if;
  return jsonb_build_object('asset_id',a.id,'state','ready','revision',submission_media.bump(s.id));
end $$;

create or replace function public.media_retry_job(p_submission uuid,p_job uuid,p_revision bigint,p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s submission_media.submissions; o submission_media.operations; j submission_media.jobs; begin
  perform submission_media.require_capability('reservations'); s:=submission_media.lock_owned(p_submission,null);
  o:=submission_media.begin_operation(s.id,'retry_job',p_key,jsonb_build_object('job',p_job,'revision',p_revision)); if o.state='complete' then return o.result; end if;
  if p_revision is null or s.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  select * into j from submission_media.jobs where id=p_job and submission_id=s.id and state='failed' and retryable and attempt<max_attempts for update;
  if not found then raise exception 'Job cannot retry' using errcode='22023'; end if;
  update submission_media.jobs set state='queued',available_at=clock_timestamp() where id=j.id;
  perform submission_media.append_event(s.id,'job_retried',j.asset_id,o.id,j.id,null,'artist');
  return submission_media.finish_operation(o.id,jsonb_build_object('revision',submission_media.bump(s.id)));
end $$;

create or replace function submission_media.asset_dto(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_strip_nulls(jsonb_build_object('id',a.id,'kind',a.kind,'state',a.technical_state,'filename',a.display_filename,'bytes',a.storage_bytes,'duration_us',a.duration_us,
   'format',a.container,'sample_rate',a.sample_rate,'bit_depth',a.bit_depth,'channels',a.channels,'width',a.image_width,'height',a.image_height,'source_id',a.source_asset_id,
   'start_ms',a.region_start_ms,'end_ms',a.region_end_ms,'profile',a.generation_profile,'points',a.waveform_points,'accepted',a.accepted_at is not null,'error_code',a.safe_error_code))
 from submission_media.assets a where a.id=p_id
$$;

create or replace function public.media_read_submission(p_submission uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s submission_media.submissions; begin
  perform submission_media.require_capability('reads'); s:=submission_media.lock_owned(p_submission,null);
  return jsonb_build_object('submission_id',s.id,'track_id',s.track_id,'revision',s.revision,'source',submission_media.asset_dto(s.working_master_id),
    'current_source',submission_media.asset_dto(s.current_master_id),'accepted_preview',submission_media.asset_dto(s.accepted_preview_id),'active_preview',submission_media.asset_dto(s.current_preview_id),
    'accepted_artwork',submission_media.asset_dto(s.accepted_artwork_id),'active_artwork',submission_media.asset_dto(s.current_artwork_id),
    'selection',jsonb_build_object('master_id',s.selection_master_id,'start_ms',s.selection_start_ms,'end_ms',s.selection_end_ms,'revision',s.selection_revision),
    'waveform',(select submission_media.asset_dto(id) from submission_media.assets where source_asset_id=s.working_master_id and kind='waveform'),
    'assets',(select coalesce(jsonb_agg(submission_media.asset_dto(recent.id) order by recent.created_at),'[]') from (select id,created_at from submission_media.assets where submission_id=s.id order by created_at desc limit 100) recent),
    'review',(select jsonb_build_object('id',id,'state',state) from submission_media.master_reviews where submission_id=s.id order by created_at desc limit 1),'last_saved_at',s.last_saved_at);
end $$;

create or replace function public.media_read_operation(p_operation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid:=submission_media.require_actor('artist'); o submission_media.operations; begin
  perform submission_media.require_capability('reads');
  select * into o from submission_media.operations where id=p_operation and actor_id=u;
  if not found then raise exception 'Permission denied' using errcode='42501'; end if;
  return jsonb_build_object('id',o.id,'state',o.state,'result',o.result);
end $$;

-- Canonical opaque descriptor; trusted delivery service resolves only active Preview/Artwork.
-- No source URL, path, waveform, reservation or worker state is serialized.
create or replace function submission_media.buyer_media(p_track uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('preview_id',case when s.managed_preview and p.technical_state='ready' and p.accepted_at is not null and p.source_asset_id=m.id and
   m.technical_state='ready' and r.state='approved' and r.candidate_master_id=m.id and p.storage_object_id is not null and p.storage_version is not null then p.id else null end,
   'artwork_id',case when s.managed_artwork and a.technical_state='ready' and a.accepted_at is not null and a.storage_object_id is not null and a.storage_version is not null then a.id else null end,
   'managed_preview',s.managed_preview,'managed_artwork',s.managed_artwork)
 from submission_media.submissions s join public.tracks t on t.id=s.track_id and t.artist_user_id=s.owner_id and t.status='approved'
 left join submission_media.assets m on m.id=s.current_master_id and m.submission_id=s.id and m.kind='source_master'
 left join submission_media.assets p on p.id=s.current_preview_id and p.submission_id=s.id and p.kind='buyer_preview'
 left join submission_media.assets a on a.id=s.current_artwork_id and a.submission_id=s.id and a.kind='artwork'
 left join submission_media.master_reviews r on r.id=s.current_review_id and r.submission_id=s.id
 where t.id=p_track and exists(select 1 from submission_media.capabilities where singleton and foundation_reads_enabled and activation_enabled)
$$;

create or replace function public.media_admin_review_state(p_review uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r submission_media.master_reviews; s submission_media.submissions; begin
  perform submission_media.require_actor('admin'); perform submission_media.require_capability('reads');
  select * into r from submission_media.master_reviews where id=p_review;
  if not found then raise exception 'Invalid review' using errcode='42501'; end if;
  select * into s from submission_media.submissions where id=r.submission_id;
  return jsonb_build_object('review_id',r.id,'submission_id',s.id,'track_id',s.track_id,'revision',s.revision,'state',r.state,'package_hash',encode(r.package_hash,'hex'),
    'current_master',submission_media.asset_dto(s.current_master_id),'candidate_master',submission_media.asset_dto(r.candidate_master_id),'candidate_preview',submission_media.asset_dto(r.candidate_preview_id),
    'artwork',submission_media.asset_dto(s.current_artwork_id));
end $$;

-- An unmanaged legacy row is a no-op, even when the foundation is installed.
-- Managed media is never written into legacy path columns by these RPCs.
create or replace function submission_media.guard_managed_track() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s submission_media.submissions; begin
  select * into s from submission_media.submissions where track_id=old.id;
  if not found or not (s.managed_master or s.managed_preview or s.managed_artwork) then return new; end if;
  if new.artist_user_id is distinct from old.artist_user_id or
    (s.managed_master and new.audio_file_path is distinct from old.audio_file_path) or
    (s.managed_preview and (new.preview_file_path,new.waveform_path) is distinct from (old.preview_file_path,old.waveform_path)) or
    (s.managed_artwork and new.cover_art_path is distinct from old.cover_art_path) then
    raise exception 'Managed media must use foundation operations' using errcode='42501';
  end if;
  if new.status='approved' and old.status<>'approved' and s.managed_master and not exists(select 1 from submission_media.master_reviews where id=s.current_review_id and state='approved') then
    raise exception 'Managed Master requires review' using errcode='42501'; end if;
  return new;
end $$;
drop trigger if exists guard_managed_track_media on public.tracks;
create trigger guard_managed_track_media before update on public.tracks for each row execute function submission_media.guard_managed_track();

-- Own all implementation routines with a constrained, non-login executor.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='submission_media' or (n.nspname='public' and p.proname like 'media\_%' escape '\') loop
    execute format('alter function %s owner to submission_media_executor',f.signature);
    execute format('revoke all on function %s from public,anon,authenticated,service_role,submission_media_broker',f.signature);
  end loop;
end $$;
grant usage on schema submission_media to authenticated;
-- Public Artist RPCs contain canonical role checks; Admin RPCs re-check canonical Admin.
grant execute on function public.media_create_submission(uuid,uuid),public.media_bind_track(uuid,uuid,bigint,uuid),
 public.media_reserve_asset(uuid,text,text,bigint,bigint,uuid),public.media_request_legacy_adoption(uuid,bigint,uuid),
 public.media_select_preview_region(uuid,uuid,bigint,bigint,bigint,uuid),public.media_request_preview(uuid,bigint,uuid),
 public.media_accept_asset(uuid,uuid,bigint,uuid),public.media_request_master_review(uuid,uuid,uuid,bigint,uuid),
 public.media_decide_master_review(uuid,boolean,text,bigint,uuid),public.media_retry_job(uuid,uuid,bigint,uuid),
 public.media_read_submission(uuid),public.media_read_operation(uuid),public.media_admin_review_state(uuid) to authenticated;
grant execute on function submission_media.upload_destination(uuid),submission_media.observe_upload(uuid),submission_media.claim_job(),
 submission_media.heartbeat_job(uuid,bigint,uuid),submission_media.complete_job(uuid,bigint,uuid,jsonb,text),submission_media.buyer_media(uuid) to submission_media_broker;
revoke create on schema submission_media,public from submission_media_executor;
commit;
