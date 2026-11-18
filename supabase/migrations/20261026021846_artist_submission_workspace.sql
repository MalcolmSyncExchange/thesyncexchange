-- Live Fix003. LOCAL preparation only: no Storage DDL, capability activation or worker enablement.
begin;
alter table submission_media.submissions add column if not exists workspace_draft jsonb;
alter table submission_media.submissions add column if not exists workspace_revision bigint not null default 0 check(workspace_revision>=0);
alter table submission_media.operations drop constraint if exists operations_action_check;
alter table submission_media.operations add constraint operations_action_check check(action in ('create','reserve','select_region','generate_preview','accept_preview','accept_artwork','request_review','decide_review','bind_track','adopt_legacy','retry_job','reserve_upload','remove_upload','save_upload_metadata','submit_uploads','save_workspace_draft','prepare_workspace'));

create or replace function public.media_submission_status() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform submission_media.require_actor('artist');
 return (select jsonb_build_object('reads',c.foundation_reads_enabled,'drafts',c.reservations_enabled,'processing',c.worker_enabled,
 'uploads',c.reservations_enabled and exists(select 1 from pg_catalog.pg_trigger where tgrelid='storage.objects'::regclass and tgname='guard_submission_media_object' and tgenabled='O' and tgfoid='submission_media.guard_storage_object()'::regprocedure) and
 (select count(*)=3 from storage.buckets where not public and ((id='submission-source' and file_size_limit>=50000000) or (id='submission-artwork' and file_size_limit>=10000000) or (id='submission-derived' and file_size_limit>=4000000)))) from submission_media.capabilities c where singleton);
end $$;

create or replace function public.media_submission_recover(p_submission uuid,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions;o submission_media.operations;begin
 perform submission_media.require_capability('reads');s:=submission_media.lock_owned(p_submission,null);
 select * into o from submission_media.operations where submission_id=s.id and actor_id=auth.uid() and idempotency_key=p_key and action in ('save_workspace_draft','save_upload_metadata','prepare_workspace');
 return jsonb_build_object('committed',coalesce(o.state='complete',false));
end $$;
create or replace function public.media_submission_save_draft(p_submission uuid,p_data jsonb,p_revision bigint,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions; o submission_media.operations; f record;begin
 perform submission_media.require_capability('reservations');s:=submission_media.lock_owned(p_submission,null);
 o:=submission_media.begin_operation(s.id,'save_workspace_draft',p_key,jsonb_build_object('data',p_data,'revision',p_revision));if o.state='complete' then return o.result;end if;
 if p_revision is null or p_revision<>s.workspace_revision then raise exception 'STALE_REVISION' using errcode='40001';end if;
 if exists(select 1 from submission_media.master_reviews where submission_id=s.id and state='pending') or (s.track_id is not null and not exists(select 1 from public.tracks where id=s.track_id and status='draft')) then raise exception 'Submitted workspace is read only' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>40000 or (p_data-array['title','primaryArtist','featuredArtists','description','genre','subgenre','bpm','key','moods','language','releaseTitle','releaseDate','releaseYear','masterOwnership','publishingOwnership','licensingAuthority','rightsNotes','permittedUses','restrictions','territories','licenseDuration','explicit','vocal','releaseStatus','contributors','rightsDeclared','licenseCategories'])<>'{}'::jsonb then raise exception 'Invalid draft' using errcode='22023';end if;
 for f in select * from (values ('title',160),('primaryArtist',200),('featuredArtists',1000),('description',3000),('genre',80),('subgenre',80),('bpm',3),('key',40),('moods',500),('language',35),('releaseTitle',200),('releaseDate',10),('releaseYear',4),('masterOwnership',2000),('publishingOwnership',2000),('licensingAuthority',2000),('rightsNotes',2000),('permittedUses',1000),('restrictions',2000),('territories',500),('licenseDuration',200)) fields(name,maximum) loop
  if jsonb_typeof(p_data->f.name) is distinct from 'string' or length(p_data->>f.name)>f.maximum or (p_data->>f.name)~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'Invalid draft field' using errcode='22023';end if;
 end loop;
 if coalesce(p_data->>'explicit','') not in ('unknown','clean','explicit') or coalesce(p_data->>'vocal','') not in ('unknown','instrumental','vocal','mixed') or coalesce(p_data->>'releaseStatus','') not in ('unreleased','released') or jsonb_typeof(p_data->'rightsDeclared') is distinct from 'boolean' or jsonb_typeof(p_data->'contributors') is distinct from 'array' or jsonb_typeof(p_data->'licenseCategories') is distinct from 'array' then raise exception 'Invalid draft classification' using errcode='22023';end if;
 if jsonb_array_length(p_data->'contributors')>30 or jsonb_array_length(p_data->'licenseCategories')>3 then raise exception 'Draft limit' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'licenseCategories') c where jsonb_typeof(c) is distinct from 'string' or c#>>'{}' not in ('digital','broadcast','exclusive')) or exists(select 1 from jsonb_array_elements(p_data->'contributors') c where jsonb_typeof(c) is distinct from 'object' or c-array['name','role']<>'{}'::jsonb or jsonb_typeof(c->'name') is distinct from 'string' or length(c->>'name')>200 or coalesce(c->>'role','') not in ('writer','composer','producer','publisher','performer','other')) then raise exception 'Invalid contributors or preferences' using errcode='22023';end if;
 update submission_media.submissions set workspace_draft=p_data,workspace_revision=workspace_revision+1 where id=s.id;
 perform submission_media.append_event(s.id,'upload_metadata_saved',null,o.id,null,null,'artist');
 return submission_media.finish_operation(o.id,jsonb_build_object('draft_revision',s.workspace_revision+1,'revision',submission_media.bump(s.id)));
end $$;
create or replace function submission_media.upload_state(p_submission uuid,p_admin boolean) returns jsonb language plpgsql security definer set search_path='' as $$declare s submission_media.submissions;u uuid;begin
 perform submission_media.require_capability('reads');if p_admin then u:=submission_media.require_actor('admin');select * into s from submission_media.submissions where id=p_submission;else s:=submission_media.lock_owned(p_submission,null);end if;if s.id is null then raise exception 'Upload unavailable' using errcode='42501';end if;
 return jsonb_build_object('submission_id',s.id,'track_id',s.track_id,'track_slug',(select slug from public.tracks where id=s.track_id),'revision',s.revision,'source',submission_media.asset_dto(s.working_master_id),'current_source',submission_media.asset_dto(s.current_master_id),'preview',submission_media.asset_dto(s.accepted_preview_id),'artwork',submission_media.asset_dto(s.accepted_artwork_id),'selection',jsonb_build_object('start_ms',s.selection_start_ms,'end_ms',s.selection_end_ms),
 'waveform',(select submission_media.asset_dto(id) from submission_media.assets where source_asset_id=s.working_master_id and kind='waveform'),
 'files',coalesce((select jsonb_agg(jsonb_build_object('asset',submission_media.asset_dto(f.asset_id),'role',f.role,'label',f.label,'retired',f.retired_at is not null,'reason',f.retired_reason,'expires_at',a.reservation_expires_at) order by f.created_at) from submission_media.upload_files f join submission_media.assets a on a.id=f.asset_id where f.submission_id=s.id),'[]'),
 'derivatives',coalesce((select jsonb_agg(submission_media.asset_dto(a.id)) from submission_media.assets a where a.submission_id=s.id and a.source_asset_id=s.working_master_id),'[]'),
 'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'asset_id',j.asset_id,'state',j.state,'attempt',j.attempt,'max_attempts',j.max_attempts,'retryable',j.retryable,'available_at',j.available_at,'error_code',a.safe_error_code) order by j.created_at) from submission_media.jobs j join submission_media.assets a on a.id=j.asset_id where j.submission_id=s.id),'[]'),
 'integrity',case when p_admin then coalesce((select jsonb_agg(jsonb_build_object('asset_id',id,'sha256',encode(sha256,'hex'),'version',storage_version,'verified_at',verified_at)) from submission_media.assets where submission_id=s.id),'[]') else '[]'::jsonb end,
 'draft_data',s.workspace_draft,'draft_revision',s.workspace_revision,'metadata',(select jsonb_build_object('title',title,'description',description,'genre',genre,'subgenre',subgenre,'moods',array_to_string(moods,', '),'bpm',bpm,'key',musical_key,'releaseYear',release_year,'instrumental',instrumental,'vocals',vocals,'explicit',explicit) from public.tracks where id=s.track_id),
 'review',(select jsonb_build_object('id',id,'state',state) from submission_media.master_reviews where submission_id=s.id order by created_at desc limit 1),'last_saved_at',s.last_saved_at);end$$;

create or replace function public.media_upload_list() returns jsonb language plpgsql security definer set search_path='' as $$declare u uuid:=submission_media.require_actor('artist');begin
 perform submission_media.require_capability('reads');return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'track_id',s.track_id,'title',coalesce(nullif(s.workspace_draft->>'title',''),t.title,'Untitled music draft'),'saved_at',s.last_saved_at,'file_count',(select count(*) from submission_media.upload_files where submission_id=s.id and retired_at is null),'review_state',(select state from submission_media.master_reviews where submission_id=s.id order by created_at desc limit 1)) order by s.last_saved_at desc) from (select * from submission_media.submissions where owner_id=u order by last_saved_at desc limit 50) s left join public.tracks t on t.id=s.track_id),'[]');end$$;


create or replace function public.media_submission_prepare(p_submission uuid,p_revision bigint,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions;o submission_media.operations;d jsonb;m jsonb;c jsonb;r jsonb;t uuid;begin
 perform submission_media.require_capability('reservations');s:=submission_media.lock_owned(p_submission,null);
 o:=submission_media.begin_operation(s.id,'prepare_workspace',p_key,jsonb_build_object('revision',p_revision));if o.state='complete' then return o.result;end if;
 if p_revision is null or p_revision<>s.revision then raise exception 'STALE_REVISION' using errcode='40001';end if;
 d:=s.workspace_draft;if d is null then raise exception 'Save track details first' using errcode='22023';end if;
 m:=jsonb_build_object('title',btrim(d->>'title'),'description',btrim(d->>'description'),'genre',btrim(d->>'genre'),'subgenre',btrim(d->>'subgenre'),'moods',btrim(d->>'moods'),'bpm',(d->>'bpm')::integer,'key',btrim(d->>'key'),'releaseYear',(d->>'releaseYear')::integer,'instrumental',d->>'vocal'='instrumental','vocals',d->>'vocal' in ('vocal','mixed'),'explicit',d->>'explicit'='explicit');
 r:=public.media_upload_save_metadata(s.id,m,s.revision,gen_random_uuid());t:=(r->>'track_id')::uuid;
 -- Preserve independently edited canonical catalog records. This bridge only seeds a new case.
 if not exists(select 1 from catalog_private.cases where track_id=t) then
  c:=catalog_private.initial_metadata(t)||jsonb_build_object('moods',coalesce((select jsonb_agg(tag order by tag) from (select min(btrim(value)) tag from regexp_split_to_table(d->>'moods',',') value where btrim(value)<>'' group by lower(btrim(value))) tags),'[]'::jsonb),'artist',btrim(d->>'primaryArtist'),'releaseTitle',btrim(d->>'releaseTitle'),'releaseStatus',d->>'releaseStatus','releaseDate',d->>'releaseDate','language',d->>'language','explicit',d->>'explicit','vocal',d->>'vocal','credits',
   jsonb_build_array(jsonb_build_object('name',btrim(d->>'primaryArtist'),'role','primary_artist')) ||
   coalesce((select jsonb_agg(jsonb_build_object('name',btrim(name),'role','featured_artist')) from regexp_split_to_table(d->>'featuredArtists',',') name where btrim(name)<>''),'[]'::jsonb) || (d->'contributors'));
  perform public.catalog_save(t,0,gen_random_uuid(),c);
 end if;
 return submission_media.finish_operation(o.id,jsonb_build_object('track_id',t,'revision',(select revision from submission_media.submissions where id=s.id)));
end $$;

-- Founder-approved initial 50 MB limit preserves the production spend cap.
create or replace function public.media_upload_reserve(p_submission uuid,p_role text,p_label text,p_filename text,p_bytes bigint,p_revision bigint,p_key uuid,p_replaces uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions; o submission_media.operations; aid uuid:=gen_random_uuid(); previous submission_media.upload_files; kind text; expires timestamptz:=clock_timestamp()+interval '24 hours'; begin
 perform submission_media.require_capability('reservations');perform pg_advisory_xact_lock(hashtextextended('media-quota:'||submission_media.require_actor('artist')::text,0));s:=submission_media.lock_owned(p_submission,null);
 if p_role is null or p_role not in ('master','instrumental','clean','alternate','stem','supporting','artwork') or p_bytes is null or p_bytes<=0 or p_bytes>(case when p_role='artwork' then 10000000 else 50000000 end) or p_label is null or p_label<>btrim(p_label) or length(p_label) not between 1 and 80 or p_label~'[[:cntrl:]]' or p_filename is null or length(p_filename) not between 1 and 255 or p_filename~'[[:cntrl:]/\\]' then raise exception 'Invalid upload reservation' using errcode='22023';end if;
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
 return submission_media.finish_operation(o.id,jsonb_build_object('asset_id',aid,'revision',submission_media.bump(s.id),'expires_at',expires));end$$;


revoke all on function public.media_submission_prepare(uuid,bigint,uuid),public.media_submission_recover(uuid,uuid),public.media_submission_status(),public.media_submission_save_draft(uuid,jsonb,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.media_submission_prepare(uuid,bigint,uuid),public.media_submission_recover(uuid,uuid),public.media_submission_status(),public.media_submission_save_draft(uuid,jsonb,bigint,uuid) to authenticated;
commit;
