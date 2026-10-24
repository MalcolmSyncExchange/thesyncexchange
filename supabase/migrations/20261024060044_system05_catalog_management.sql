-- System 05. Explicit publication and immutable metadata review, no hosted activation.
begin;
do $$begin
 if current_user<>'postgres' or to_regprocedure('rights_private.assert_current(uuid,jsonb)') is null then raise exception 'Verified postgres installer and System04 required' using errcode='55000';end if;
end$$;
create schema catalog_private;
revoke all on schema catalog_private from public,anon,authenticated,service_role;
create table catalog_private.cases(
 track_id uuid primary key references public.tracks(id) on delete restrict,
 owner_id uuid not null references public.user_profiles(id),revision bigint not null default 0,context_epoch bigint not null default 0,
 state text not null default 'draft' check(state in('draft','submitted','changes_requested','approved','published','rejected','suspended','unpublished','archived')),
 draft jsonb not null,submitted_version uuid,approved_decision uuid,note text not null default '',updated_at timestamptz not null default clock_timestamp()
);
create table catalog_private.versions(
 id uuid primary key default gen_random_uuid(),track_id uuid not null references catalog_private.cases(track_id),
 metadata jsonb not null,metadata_hash text not null,context_hash text not null,submitted_by uuid not null,submitted_at timestamptz not null default clock_timestamp()
);
create table catalog_private.decisions(
 id uuid primary key default gen_random_uuid(),track_id uuid not null references catalog_private.cases(track_id),version_id uuid not null references catalog_private.versions(id),
 state text not null check(state in('approved','changes_requested','rejected')),metadata jsonb not null,context_hash text not null,note text not null,
 reviewer_id uuid not null references public.user_profiles(id),created_at timestamptz not null default clock_timestamp(),
 search_document tsvector generated always as (jsonb_to_tsvector('simple'::regconfig,metadata,'["string"]'::jsonb)) stored
);
create table catalog_private.events(id bigint generated always as identity primary key,track_id uuid not null references catalog_private.cases(track_id),actor_id uuid not null,action text not null,revision bigint not null,note text not null,recorded_at timestamptz not null default clock_timestamp());
create table catalog_private.operations(track_id uuid not null references catalog_private.cases(track_id),key uuid not null,actor_id uuid not null,request_hash text not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(track_id,key));
alter table catalog_private.cases add foreign key(submitted_version) references catalog_private.versions(id),add foreign key(approved_decision) references catalog_private.decisions(id);
create index catalog_cases_queue on catalog_private.cases(state,updated_at,track_id);
create index catalog_cases_owner on catalog_private.cases(owner_id,updated_at,track_id);
create index catalog_versions_track on catalog_private.versions(track_id,submitted_at,id);
create index catalog_decisions_track on catalog_private.decisions(track_id,created_at,id);
create index catalog_search_gin on catalog_private.decisions using gin(search_document);
create index catalog_events_track on catalog_private.events(track_id,id);
create index catalog_operations_actor on catalog_private.operations(actor_id,created_at);

create function catalog_private.initial_metadata(p_track uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('title',t.title,'artist',p.artist_name,'credits','[]'::jsonb,'description',coalesce(t.description,''),'releaseTitle','','releaseStatus','unreleased','releaseDate','','releaseYear',t.release_year,'genre',coalesce(t.genre,''),'subgenre',coalesce(t.subgenre,''),'moods',coalesce(to_jsonb(t.moods),'[]'),'bpm',nullif(t.bpm,0),'musicalKey',coalesce(t.musical_key,''),'durationSeconds',t.duration_seconds,'explicit',case when t.explicit then 'explicit' else 'clean' end,'vocal',case when t.instrumental and t.vocals then 'mixed' when t.instrumental then 'instrumental' when t.vocals then 'vocal' else 'unknown' end,'language','','isrc','','iswc','','recordingIdentifier',coalesce(r.draft->>'recordingIdentifier',''),'workIdentifier',coalesce(r.draft->>'workIdentifier',''),'keywords','[]'::jsonb)
 from public.tracks t join public.artist_profiles p on p.user_id=t.artist_user_id left join rights_private.cases r on r.track_id=t.id where t.id=p_track
$$;
create function catalog_private.validate(p jsonb,p_complete boolean) returns void language plpgsql set search_path='' as $$
declare k text;v jsonb;allowed text[]:=array['title','artist','credits','description','releaseTitle','releaseStatus','releaseDate','releaseYear','genre','subgenre','moods','bpm','musicalKey','durationSeconds','explicit','vocal','language','isrc','iswc','recordingIdentifier','workIdentifier','keywords'];begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>40000 or p-allowed<>'{}' or not(p ?& allowed) then raise exception 'Structured bounded catalog metadata required' using errcode='22023';end if;
 foreach k in array array['title','artist','description','releaseTitle','releaseStatus','releaseDate','genre','subgenre','musicalKey','explicit','vocal','language','isrc','iswc','recordingIdentifier','workIdentifier'] loop
  if jsonb_typeof(p->k) is distinct from 'string' or p->>k<>btrim(p->>k) or (case when k='description' then translate(p->>k,chr(9)||chr(10)||chr(13),'') else p->>k end)~'[[:cntrl:]]' or length(p->>k)>(case when k='description' then 3000 else 200 end) then raise exception 'Invalid catalog text: %',k using errcode='22023';end if;
 end loop;
 if p->>'releaseStatus' not in('unreleased','released') or p->>'explicit' not in('unknown','clean','explicit') or p->>'vocal' not in('unknown','instrumental','vocal','mixed') or length(p->>'language')>35 or (p->>'language'<>'' and p->>'language'!~'^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$' and p->>'language'<>'zxx') or (p->>'isrc'<>'' and p->>'isrc'!~'^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$') or (p->>'iswc'<>'' and p->>'iswc'!~'^T[0-9]{10}$') then raise exception 'Invalid classification, language or identifier' using errcode='22023';end if;
 if p->>'musicalKey'<>'' and p->>'musicalKey'!~'^([A-G](#|b)?(m| (major|minor))?|atonal|unknown)$' then raise exception 'Invalid musical key' using errcode='22023';end if;
 if p->>'releaseDate'<>'' then if p->>'releaseDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char((p->>'releaseDate')::date,'YYYY-MM-DD')<>p->>'releaseDate' then raise exception 'Invalid release date' using errcode='22023';end if;end if;
 foreach k in array array['releaseYear','bpm','durationSeconds'] loop
  if p->k<>'null'::jsonb and (jsonb_typeof(p->k)<>'number' or p->>k!~'^[0-9]{1,5}$') then raise exception 'Invalid numeric metadata' using errcode='22023';end if;
 end loop;
 if p->'durationSeconds'='null' or (p->>'durationSeconds')::int not between 0 and 36000 or p->'bpm'<>'null' and (p->>'bpm')::int not between 1 and 400 or p->'releaseYear'<>'null' and (p->>'releaseYear')::int not between 1900 and 2200 then raise exception 'Catalog value out of range' using errcode='22023';end if;
 foreach k in array array['moods','keywords','credits'] loop
  if jsonb_typeof(p->k) is distinct from 'array' or jsonb_array_length(p->k)>50 then raise exception 'Bounded catalog lists required' using errcode='22023';end if;
  for v in select value from jsonb_array_elements(p->k) loop
   if k='credits' then
    if jsonb_typeof(v) is distinct from 'object' or v-array['name','role']<>'{}' or jsonb_typeof(v->'name') is distinct from 'string' or jsonb_typeof(v->'role') is distinct from 'string' or length(v->>'name') not between 0 and 200 or v->>'name'<>btrim(v->>'name') or v->>'name'~'[[:cntrl:]]' or v->>'role' not in('primary_artist','featured_artist','composer','writer','producer','performer','publisher','other') then raise exception 'Invalid public credit' using errcode='22023';end if;
   elsif jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 80 or v#>>'{}'<>btrim(v#>>'{}') or v#>>'{}'~'[[:cntrl:]]' then raise exception 'Invalid catalog tag' using errcode='22023';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p->k) e group by lower(e.value::text) having count(*)>1) then raise exception 'Duplicate metadata item' using errcode='22023';end if;
 end loop;
 if p->>'releaseDate'<>'' and (p->>'releaseYear')::int is distinct from extract(year from (p->>'releaseDate')::date)::int then raise exception 'Release year and date disagree' using errcode='22023';end if;
 if p_complete and (length(p->>'title')<2 or length(p->>'artist')<2 or length(p->>'genre')<2 or length(p->>'recordingIdentifier')<2 or length(p->>'workIdentifier')<2 or p->>'explicit'='unknown' or p->>'vocal'='unknown' or p->>'language'='' or (jsonb_array_length(p->'credits')=0 or exists(select 1 from jsonb_array_elements(p->'credits') credit where length(credit->>'name')=0)) or (p->>'durationSeconds')::int=0 or p->>'releaseStatus'='released' and p->>'releaseDate'='') then raise exception 'Complete identity, credits, classification and release metadata required' using errcode='22023';end if;
end$$;
create function catalog_private.context_hash(p_track uuid) returns text language sql stable security definer set search_path='' as $$
 select licensing_private.hash_json(jsonb_build_object('epoch',c.context_epoch,'track',to_jsonb(t)-array['updated_at','created_at','featured','approved_at','approved_by'],'rightsRevision',r.revision,'rightsHash',rights_private.source_hash(t.id),'master',s.current_master_id,'preview',s.current_preview_id,'mediaReview',s.current_review_id,'workingMaster',s.working_master_id)) from public.tracks t join catalog_private.cases c on c.track_id=t.id left join rights_private.cases r on r.track_id=t.id left join submission_media.submissions s on s.track_id=t.id where t.id=p_track
$$;
create function catalog_private.actor(p_admin boolean default false) returns uuid language plpgsql security definer set search_path='' as $$begin
 if p_admin is null then raise exception 'Explicit catalog scope required' using errcode='22023';end if;return rights_private.actor(p_admin);end$$;
create function catalog_private.lock_case(p_track uuid,p_admin boolean default false) returns catalog_private.cases language plpgsql security definer set search_path='' as $$declare c catalog_private.cases;u uuid:=catalog_private.actor(p_admin);begin
 perform 1 from public.tracks where id=p_track and (p_admin or artist_user_id=u) for update;if not found then raise exception 'Catalog unavailable' using errcode='42501';end if;
 select * into c from catalog_private.cases where track_id=p_track and (p_admin or owner_id=u) for update;return c;end$$;
create function catalog_private.replay(p_track uuid,p_key uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare o catalog_private.operations;begin
 if p_key is null then raise exception 'Operation key required' using errcode='22023';end if;
 select * into o from catalog_private.operations where track_id=p_track and key=p_key;if found then if o.actor_id<>auth.uid() or o.request_hash<>licensing_private.hash_json(p_request) then raise exception 'Conflicting operation key' using errcode='40001';end if;return o.result;end if;
 if (select count(*) from catalog_private.operations where actor_id=auth.uid() and created_at>clock_timestamp()-interval '1 day')>=1000 then raise exception 'Catalog operation limit' using errcode='54000';end if;return null;end$$;
create function catalog_private.finish(p_track uuid,p_key uuid,p_request jsonb,p_action text,p_note text default '') returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;v bigint;begin
 update catalog_private.cases set revision=revision+1,updated_at=clock_timestamp() where track_id=p_track returning revision into v;
 r:=jsonb_build_object('revision',v,'track_id',p_track,'state',(select state from catalog_private.cases where track_id=p_track));
 insert into catalog_private.operations(track_id,key,actor_id,request_hash,result) values(p_track,p_key,auth.uid(),licensing_private.hash_json(p_request),r);
 insert into catalog_private.events(track_id,actor_id,action,revision,note) values(p_track,auth.uid(),p_action,v,p_note);return r;end$$;
create function catalog_private.check_assets(p_track uuid,p_metadata jsonb) returns void language plpgsql security definer set search_path='' as $$declare s submission_media.submissions;a submission_media.assets;p submission_media.assets;begin
 select * into s from submission_media.submissions where track_id=p_track;select * into a from submission_media.assets where id=s.current_master_id;select * into p from submission_media.assets where id=s.current_preview_id;
 if s.id is null or not s.managed_master or not s.managed_preview or s.working_master_id is distinct from s.current_master_id or p.id is null or p.technical_state<>'ready' or p.source_asset_id<>a.id or p.accepted_at is null or p.sha256 is null or p_metadata->>'durationSeconds' is distinct from ceil(a.duration_us/1000000.0)::int::text then raise exception 'Current approved master, measured duration and accepted preview required' using errcode='42501';end if;
 perform licensing_private.check_source_package(s.id,a.id,s.current_review_id);
 if not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id and not b.public where o.id=p.storage_object_id and o.bucket_id=p.bucket and o.name=p.object_path and o.version=p.storage_version and (o.metadata->>'size')::bigint=p.storage_bytes) then raise exception 'Private preview version unavailable' using errcode='42501';end if;
end$$;
create function catalog_private.check_rights(p_track uuid,p_metadata jsonb) returns void language plpgsql security definer set search_path='' as $$declare p jsonb;o licensing_private.offers;h record;begin
 select d.licensing_rights into p from rights_private.cases c join rights_private.decisions d on d.id=c.approved_decision where c.track_id=p_track;
 -- Existing PK03 reviews already verify independent pools and private evidence.
 -- Do not invent a System04 approval for those legally reviewed legacy offers.
 if p is null and not exists(select 1 from rights_private.cases where track_id=p_track) then
  for h in select offer_id from licensing_private.offer_heads where track_id=p_track loop
   begin o:=licensing_private.check_offer(h.offer_id,clock_timestamp());p:=o.rights;exit;exception when others then null;end;
  end loop;
 end if;
 if p is null or p->>'recordingIdentifier' is distinct from p_metadata->>'recordingIdentifier' or p->>'workIdentifier' is distinct from p_metadata->>'workIdentifier' then raise exception 'Verified recording and composition identity required' using errcode='42501';end if;perform rights_private.assert_current(p_track,p);
end$$;
create function catalog_private.available_licenses(p_track uuid) returns uuid[] language plpgsql security definer set search_path='' as $$declare h record;o licensing_private.offers;r licensing_private.source_reviews;result uuid[]:='{}';begin
 for h in select head.offer_id,head.license_type_id from licensing_private.offer_heads head where head.track_id=p_track loop
  begin
   o:=licensing_private.check_offer(h.offer_id,clock_timestamp());
   if (o.terms->>'acceptUntil')::timestamptz<=clock_timestamp() or not exists(select 1 from public.track_license_options x join public.license_types l on l.id=x.license_type_id where x.track_id=p_track and x.license_type_id=o.license_type_id and coalesce(x.price_cents,l.default_price_cents)>0) then continue;end if;
   select * into r from licensing_private.source_reviews where offer_id=o.id;
   if r.id is null or not exists(select 1 from commerce_private.license_delivery_sets where offer_id=o.id) then continue;end if;
   perform licensing_private.assert_source(jsonb_build_object('offerId',o.id,'track',jsonb_build_object('id',p_track),'rights',o.rights,'rightsSourceHash',o.source_hash,'deliveryManifest',(select manifest from commerce_private.license_delivery_sets where offer_id=o.id),'sourceEvidence',jsonb_build_object('id',r.id,'hash',r.snapshot_hash,'snapshot',r.snapshot,'reviewedBy',r.reviewed_by,'reviewedAt',r.reviewed_at,'reviewReference',r.review_reference)),false);
   result:=array_append(result,h.license_type_id);
  exception when others then null;end;
 end loop;return result;end$$;
create function catalog_private.blockers(p_track uuid,p_approval boolean default true,p_licenses boolean default true) returns text[] language plpgsql security definer set search_path='' as $$declare c catalog_private.cases;d catalog_private.decisions;result text[]:='{}';begin
 select * into c from catalog_private.cases where track_id=p_track;select * into d from catalog_private.decisions where id=c.approved_decision;
 if c.track_id is null then return array['catalog_review_required'];end if;
 if p_approval and (d.id is null or d.state<>'approved' or d.context_hash is distinct from catalog_private.context_hash(p_track)) then result:=array_append(result,'current_catalog_approval_required');end if;
 begin perform catalog_private.check_rights(p_track,coalesce(d.metadata,c.draft));exception when others then result:=array_append(result,'current_verified_rights_required');end;
 begin perform catalog_private.check_assets(p_track,coalesce(d.metadata,c.draft));exception when others then result:=array_append(result,'current_approved_assets_required');end;
 if p_licenses and cardinality(catalog_private.available_licenses(p_track))=0 then result:=array_append(result,'reviewed_license_and_source_required');end if;return result;end$$;
create function catalog_private.visible(p_track uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from catalog_private.cases c join public.tracks t on t.id=c.track_id and t.artist_user_id=c.owner_id and t.status='approved' where c.track_id=p_track and c.state='published') then return false;end if;
 return cardinality(catalog_private.blockers(p_track))=0;end$$;
create function catalog_private.assert_current(p_track uuid,p_evidence jsonb default null) returns void language plpgsql security definer set search_path='' as $$declare c catalog_private.cases;d catalog_private.decisions;begin
 perform 1 from public.tracks where id=p_track for share;
 select * into c from catalog_private.cases where track_id=p_track for share;
 if c.track_id is null then raise exception 'Explicit catalog publication required' using errcode='42501';end if;
 select * into d from catalog_private.decisions where id=c.approved_decision;
 if (p_evidence is null and not catalog_private.visible(p_track)) or (p_evidence is not null and (c.state<>'published' or cardinality(catalog_private.blockers(p_track,true,false))>0)) or (p_evidence is not null and p_evidence is distinct from jsonb_build_object('versionId',d.version_id,'decisionId',d.id,'metadata',d.metadata,'metadataHash',licensing_private.hash_json(d.metadata),'contextHash',d.context_hash)) then raise exception 'Catalog source changed incompatibly; published original evidence required' using errcode='42501';end if;
end$$;

create function public.catalog_save(p_track uuid,p_revision bigint,p_key uuid,p_metadata jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare c catalog_private.cases;r jsonb;req jsonb:=jsonb_build_object('action','save','revision',p_revision,'metadata',p_metadata);begin
 c:=catalog_private.lock_case(p_track);if c.track_id is null then insert into catalog_private.cases(track_id,owner_id,draft) values(p_track,auth.uid(),catalog_private.initial_metadata(p_track)) returning * into c;end if;
 r:=catalog_private.replay(p_track,p_key,req);if r is not null then return r;end if;
 if p_revision is null or p_revision<>c.revision then raise exception 'Stale catalog revision' using errcode='40001';end if;
 if c.state in('submitted','suspended','archived') then raise exception 'Catalog state cannot be edited' using errcode='42501';end if;
 perform catalog_private.validate(p_metadata,false);
 update catalog_private.cases set draft=p_metadata,state='draft',approved_decision=null,note='Saved draft. Publication requires a new review.' where track_id=p_track;
 return catalog_private.finish(p_track,p_key,req,'metadata_saved');end$$;
create function catalog_private.check_duplicates(p_track uuid,p_metadata jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 perform pg_advisory_xact_lock(hashtextextended('catalog-recording-registry',0));
 if exists(
  select 1 from catalog_private.cases x where x.track_id<>p_track and x.state<>'archived' and (
   (p_metadata->>'isrc'<>'' and x.draft->>'isrc'=p_metadata->>'isrc')
   or (x.owner_id=(select artist_user_id from public.tracks where id=p_track) and x.draft->>'recordingIdentifier'=p_metadata->>'recordingIdentifier')
   or exists(select 1 from submission_media.submissions a join submission_media.assets av on av.id=a.current_master_id join submission_media.submissions b on b.track_id=p_track join submission_media.assets bv on bv.id=b.current_master_id where a.track_id=x.track_id and av.sha256=bv.sha256)
  )
 ) then raise exception 'Recording already has a catalog record' using errcode='23505';end if;
end$$;
create function public.catalog_submit(p_track uuid,p_revision bigint,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare c catalog_private.cases;v uuid;r jsonb;req jsonb:=jsonb_build_object('action','submit','revision',p_revision);begin
 c:=catalog_private.lock_case(p_track);r:=catalog_private.replay(p_track,p_key,req);if r is not null then return r;end if;
 if c.track_id is null or p_revision is null or p_revision<>c.revision then raise exception 'Stale catalog revision' using errcode='40001';end if;
 if c.state not in('draft','changes_requested','rejected','unpublished','approved') then raise exception 'New draft required' using errcode='42501';end if;
 perform catalog_private.validate(c.draft,true);
 perform catalog_private.check_duplicates(p_track,c.draft);
 insert into catalog_private.versions(track_id,metadata,metadata_hash,context_hash,submitted_by) values(p_track,c.draft,licensing_private.hash_json(c.draft),catalog_private.context_hash(p_track),auth.uid()) returning id into v;
 update catalog_private.cases set state='submitted',submitted_version=v,approved_decision=null,note='Awaiting independent catalog review.' where track_id=p_track;
 return catalog_private.finish(p_track,p_key,req,'catalog_submitted');end$$;
create function public.catalog_review(p_track uuid,p_revision bigint,p_key uuid,p_version uuid,p_state text,p_metadata jsonb,p_note text) returns jsonb language plpgsql security definer set search_path='' as $$declare c catalog_private.cases;v catalog_private.versions;d uuid;r jsonb;req jsonb:=jsonb_build_object('action','review','revision',p_revision,'version',p_version,'state',p_state,'metadata',p_metadata,'note',p_note);begin
 c:=catalog_private.lock_case(p_track,true);r:=catalog_private.replay(p_track,p_key,req);if r is not null then return r;end if;
 if c.track_id is null or p_revision is null or p_revision<>c.revision or c.submitted_version is distinct from p_version then raise exception 'Stale catalog review' using errcode='40001';end if;
 if c.state<>'submitted' or p_state is null or p_state not in('approved','changes_requested','rejected') or length(coalesce(p_note,'')) not between 5 and 2000 then raise exception 'Pending version and review explanation required' using errcode='22023';end if;
 select * into strict v from catalog_private.versions where id=p_version and track_id=p_track;
 perform catalog_private.validate(p_metadata,p_state='approved');
 if p_state='approved' then
  if v.context_hash<>catalog_private.context_hash(p_track) then raise exception 'Source changed during catalog review; resubmit' using errcode='40001';end if;
  perform catalog_private.check_duplicates(p_track,p_metadata);
  perform catalog_private.check_rights(p_track,p_metadata);perform catalog_private.check_assets(p_track,p_metadata);
  if (p_metadata->>'isrc',p_metadata->>'iswc',p_metadata->>'recordingIdentifier',p_metadata->>'workIdentifier',p_metadata->>'durationSeconds') is distinct from(v.metadata->>'isrc',v.metadata->>'iswc',v.metadata->>'recordingIdentifier',v.metadata->>'workIdentifier',v.metadata->>'durationSeconds') then raise exception 'Recording identity corrections require artist resubmission' using errcode='22023';end if;
  update public.tracks set title=p_metadata->>'title',description=p_metadata->>'description',genre=p_metadata->>'genre',subgenre=p_metadata->>'subgenre',moods=array(select jsonb_array_elements_text(p_metadata->'moods')),bpm=coalesce((p_metadata->>'bpm')::int,0),musical_key=p_metadata->>'musicalKey',instrumental=p_metadata->>'vocal' in('instrumental','mixed'),vocals=p_metadata->>'vocal' in('vocal','mixed'),explicit=p_metadata->>'explicit'='explicit',release_year=coalesce((p_metadata->>'releaseYear')::int,release_year) where id=p_track;
 end if;
 insert into catalog_private.decisions(track_id,version_id,state,metadata,context_hash,note,reviewer_id) values(p_track,p_version,p_state,p_metadata,catalog_private.context_hash(p_track),p_note,auth.uid()) returning id into d;
 update catalog_private.cases set state=p_state,approved_decision=case when p_state='approved' then d else null end,note=p_note where track_id=p_track;
 return catalog_private.finish(p_track,p_key,req,'catalog_'||p_state,p_note);end$$;
create function public.catalog_transition(p_track uuid,p_revision bigint,p_key uuid,p_state text,p_note text) returns jsonb language plpgsql security definer set search_path='' as $$declare c catalog_private.cases;r jsonb;req jsonb:=jsonb_build_object('action','transition','revision',p_revision,'state',p_state,'note',p_note);begin
 c:=catalog_private.lock_case(p_track,true);r:=catalog_private.replay(p_track,p_key,req);if r is not null then return r;end if;
 if c.track_id is null or p_revision is null or p_revision<>c.revision then raise exception 'Stale publication revision' using errcode='40001';end if;
 if p_state is null or p_state not in('published','suspended','unpublished','archived') or length(coalesce(p_note,'')) not between 5 and 2000 then raise exception 'Publication decision and explanation required' using errcode='22023';end if;
 if p_state='published' then
  if c.state not in('approved','unpublished') or cardinality(catalog_private.blockers(p_track))>0 then raise exception 'Current rights, assets, approval and reviewed license required' using errcode='42501';end if;
 elsif p_state='unpublished' and c.state<>'published' or p_state='suspended' and c.state not in('published','approved','unpublished') or c.state='archived' then raise exception 'Invalid publication transition' using errcode='22023';end if;
 update catalog_private.cases set state=p_state,note=p_note,approved_decision=case when p_state in('suspended','archived') then null else approved_decision end where track_id=p_track;
 return catalog_private.finish(p_track,p_key,req,'catalog_'||p_state,p_note);end$$;
-- Suspensions require a new submitted version and human review; no direct republish.
create function public.catalog_reopen(p_track uuid,p_revision bigint,p_key uuid,p_note text) returns jsonb language plpgsql security definer set search_path='' as $$declare c catalog_private.cases;r jsonb;req jsonb:=jsonb_build_object('action','reopen','revision',p_revision,'note',p_note);begin
 c:=catalog_private.lock_case(p_track,true);r:=catalog_private.replay(p_track,p_key,req);if r is not null then return r;end if;
 if c.track_id is null or p_revision is null or p_revision<>c.revision then raise exception 'Stale revision' using errcode='40001';end if;
 if c.state not in('suspended','archived') or length(coalesce(p_note,'')) not between 5 and 2000 then raise exception 'Restriction review explanation required' using errcode='22023';end if;
 update catalog_private.cases set state='changes_requested',approved_decision=null,note=p_note where track_id=p_track;
 return catalog_private.finish(p_track,p_key,req,'catalog_reopened',p_note);end$$;
create function catalog_private.invalidate_context() returns trigger language plpgsql security definer set search_path='' as $$begin
 if to_jsonb(new)-array['updated_at','featured','approved_at','approved_by'] is distinct from to_jsonb(old)-array['updated_at','featured','approved_at','approved_by'] then
 update catalog_private.cases set context_epoch=context_epoch+1,revision=revision+1,updated_at=clock_timestamp() where track_id=new.id;end if;return new;end$$;
create trigger system05_catalog_context after update on public.tracks for each row execute function catalog_private.invalidate_context();
create function catalog_private.invalidate_media() returns trigger language plpgsql security definer set search_path='' as $$begin
 if (new.owner_id,new.track_id,new.working_master_id,new.current_master_id,new.current_preview_id,new.current_review_id,new.managed_master,new.managed_preview) is distinct from (old.owner_id,old.track_id,old.working_master_id,old.current_master_id,old.current_preview_id,old.current_review_id,old.managed_master,old.managed_preview) then
 update catalog_private.cases set context_epoch=context_epoch+1,revision=revision+1,updated_at=clock_timestamp() where track_id=any(array[old.track_id,new.track_id]);end if;return new;end$$;
create trigger system05_catalog_media after update on submission_media.submissions for each row execute function catalog_private.invalidate_media();
-- Approved original versions remain immutable. Readability does not imply publication.
create function public.catalog_read(p_track uuid,p_admin boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$declare u uuid:=catalog_private.actor(p_admin);c catalog_private.cases;d catalog_private.decisions;begin
 perform 1 from public.tracks where id=p_track and (p_admin or artist_user_id=u);if not found then raise exception 'Catalog unavailable' using errcode='42501';end if;
 select * into c from catalog_private.cases where track_id=p_track;if c.track_id is not null and not p_admin and c.owner_id<>u then raise exception 'Catalog owner review required' using errcode='42501';end if;select * into d from catalog_private.decisions where id=c.approved_decision;
 return jsonb_build_object('track_id',p_track,'title',(select title from public.tracks where id=p_track),'slug',(select slug from public.tracks where id=p_track),'revision',coalesce(c.revision,0),'state',coalesce(c.state,'not_started'),'note',coalesce(c.note,''),'draft',coalesce(c.draft,catalog_private.initial_metadata(p_track)),'submitted_version',c.submitted_version,'approved_metadata',d.metadata,'blockers',to_jsonb(catalog_private.blockers(p_track)),'visible',catalog_private.visible(p_track),'available_licenses',to_jsonb(catalog_private.available_licenses(p_track)),
 'media_submission',(select id from submission_media.submissions where track_id=p_track),
 'assets',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'role',f.role,'label',f.label,'state',a.technical_state,'sha256',encode(a.sha256,'hex'),'version',a.storage_version,'current',a.id in(s.current_master_id,s.current_preview_id,s.current_artwork_id)) order by a.created_at desc) from submission_media.submissions s join submission_media.assets a on a.submission_id=s.id left join submission_media.upload_files f on f.asset_id=a.id where s.track_id=p_track and (f.retired_at is null) and (f.asset_id is not null or a.id in(s.current_master_id,s.current_preview_id,s.current_artwork_id))),'[]'),
 'versions',coalesce((select jsonb_agg(to_jsonb(v) order by submitted_at desc,id desc) from (select * from catalog_private.versions where track_id=p_track order by submitted_at desc,id desc limit 20)v),'[]'),
 'decisions',coalesce((select jsonb_agg(to_jsonb(x)-'search_document' order by created_at desc,id desc) from (select * from catalog_private.decisions where track_id=p_track order by created_at desc,id desc limit 20)x),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by id desc) from (select * from catalog_private.events where track_id=p_track order by id desc limit 50)e),'[]'));
end$$;
create function public.catalog_list(p_admin boolean default false,p_state text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$declare u uuid:=catalog_private.actor(p_admin);n int;items jsonb;begin
 if p_page is null or p_page not between 1 and 10000 or p_state is null or p_state not in('','not_started','draft','submitted','changes_requested','approved','published','rejected','suspended','unpublished','archived') then raise exception 'Invalid catalog queue filter' using errcode='22023';end if;
 select count(*) into n from public.tracks t left join catalog_private.cases c on c.track_id=t.id where (p_admin or t.artist_user_id=u) and (p_state='' or coalesce(c.state,'not_started')=p_state);
 select coalesce(jsonb_agg(to_jsonb(x) order by updated_at desc,id desc),'[]') into items from (select t.id,t.title,t.slug,coalesce(c.updated_at,t.updated_at) as updated_at,coalesce(c.state,'not_started') as state,catalog_private.visible(t.id) as visible,catalog_private.blockers(t.id) as blockers from public.tracks t left join catalog_private.cases c on c.track_id=t.id where (p_admin or t.artist_user_id=u) and (p_state='' or coalesce(c.state,'not_started')=p_state) order by coalesce(c.updated_at,t.updated_at) desc,t.id desc limit 20 offset (p_page-1)*20)x;
 return jsonb_build_object('items',items,'total',n,'page',p_page,'page_size',20,'page_count',ceil(n/20.0));end$$;
create function public.catalog_history(p_track uuid,p_kind text,p_before text,p_admin boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$declare u uuid:=catalog_private.actor(p_admin);items jsonb;begin
 perform 1 from public.tracks where id=p_track and (p_admin or artist_user_id=u) and (p_admin or not exists(select 1 from catalog_private.cases c where c.track_id=p_track and c.owner_id<>u));if not found then raise exception 'Catalog history denied' using errcode='42501';end if;
 if p_kind in('versions','decisions') and coalesce(p_before,'')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid history cursor' using errcode='22023';end if;
 if p_kind='versions' then select coalesce(jsonb_agg(to_jsonb(v) order by submitted_at desc,id desc),'[]') into items from (select * from catalog_private.versions where track_id=p_track and (submitted_at,id)<(select submitted_at,id from catalog_private.versions where track_id=p_track and id=p_before::uuid) order by submitted_at desc,id desc limit 20)v;
 elsif p_kind='decisions' then select coalesce(jsonb_agg(to_jsonb(d)-'search_document' order by created_at desc,id desc),'[]') into items from (select * from catalog_private.decisions where track_id=p_track and (created_at,id)<(select created_at,id from catalog_private.decisions where track_id=p_track and id=p_before::uuid) order by created_at desc,id desc limit 20)d;
 elsif p_kind='events' then if coalesce(p_before,'')!~'^[0-9]{1,18}$' then raise exception 'Invalid audit cursor' using errcode='22023';end if;select coalesce(jsonb_agg(to_jsonb(e) order by id desc),'[]') into items from (select * from catalog_private.events where track_id=p_track and id<p_before::bigint order by id desc limit 50)e;
 else raise exception 'Invalid history kind' using errcode='22023';end if;return jsonb_build_object('items',items);end$$;
create function public.catalog_recover(p_track uuid,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare c catalog_private.cases;r jsonb;begin
 c:=catalog_private.lock_case(p_track,public.is_admin());select result into r from catalog_private.operations where track_id=p_track and key=p_key and actor_id=auth.uid();return jsonb_build_object('committed',r is not null,'result',r);end$$;

create function public.catalog_search(p_filters jsonb default '{}',p_page integer default 1,p_size integer default 20,p_sort text default 'title') returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;n int;k text;f jsonb;begin
 if auth.role() is distinct from 'authenticated' or not public.auth_session_is_active() or not exists(select 1 from public.user_profiles where id=auth.uid() and (role='buyer' or role='admin' and public.is_admin())) then raise exception 'Catalog search denied' using errcode='42501';end if;
 if jsonb_typeof(p_filters) is distinct from 'object' or p_filters-array['query','artist','title','genre','subgenre','mood','bpmMin','bpmMax','key','durationMin','durationMax','vocal','explicit','language','keyword','license']<>'{}' or octet_length(p_filters::text)>3000 or p_page is null or p_page not between 1 and 10000 or p_size is null or p_size not between 1 and 50 or p_sort is null or p_sort not in('title','newest','bpm','duration','relevance') then raise exception 'Invalid catalog search' using errcode='22023';end if;
 for k,f in select key,value from jsonb_each(p_filters) loop
  if k in('bpmMin','bpmMax','durationMin','durationMax') then if jsonb_typeof(f)<>'number' or f#>>'{}'!~'^[0-9]{1,5}$' or (f#>>'{}')::int>36000 then raise exception 'Invalid search range' using errcode='22023';end if;
  elsif jsonb_typeof(f)<>'string' or length(f#>>'{}') not between 1 and 200 or f#>>'{}'~'[[:cntrl:]]' then raise exception 'Invalid search text' using errcode='22023';end if;
 end loop;
 if coalesce((p_filters->>'bpmMin')::int,0)>coalesce((p_filters->>'bpmMax')::int,36000) or coalesce((p_filters->>'durationMin')::int,0)>coalesce((p_filters->>'durationMax')::int,36000) or p_filters ? 'license' and p_filters->>'license'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or p_filters ? 'vocal' and p_filters->>'vocal' not in('instrumental','vocal','mixed') or p_filters ? 'explicit' and p_filters->>'explicit' not in('clean','explicit') then raise exception 'Invalid search filter value' using errcode='22023';end if;
 with eligible as materialized (
  select t.id,t.slug,d.metadata,d.created_at,d.search_document,catalog_private.available_licenses(t.id) as licenses from catalog_private.cases c join public.tracks t on t.id=c.track_id join catalog_private.decisions d on d.id=c.approved_decision
  where c.state='published' and catalog_private.visible(t.id)
  and (not p_filters ? 'query' or d.search_document@@plainto_tsquery('simple',p_filters->>'query'))
  and (not p_filters ? 'artist' or position(lower(p_filters->>'artist') in lower(d.metadata->>'artist'))>0 or exists(select 1 from jsonb_array_elements(d.metadata->'credits') credit where credit->>'role' in('primary_artist','featured_artist') and position(lower(p_filters->>'artist') in lower(credit->>'name'))>0))
  and (not p_filters ? 'title' or position(lower(p_filters->>'title') in lower(d.metadata->>'title'))>0)
  and (not p_filters ? 'genre' or lower(d.metadata->>'genre')=lower(p_filters->>'genre'))
  and (not p_filters ? 'subgenre' or lower(d.metadata->>'subgenre')=lower(p_filters->>'subgenre'))
  and (not p_filters ? 'mood' or exists(select 1 from jsonb_array_elements_text(d.metadata->'moods') v where lower(v)=lower(p_filters->>'mood')))
  and (not p_filters ? 'keyword' or exists(select 1 from jsonb_array_elements_text(d.metadata->'keywords') v where lower(v)=lower(p_filters->>'keyword')))
  and (not p_filters ? 'bpmMin' or (d.metadata->>'bpm')::int>=(p_filters->>'bpmMin')::int) and (not p_filters ? 'bpmMax' or (d.metadata->>'bpm')::int<=(p_filters->>'bpmMax')::int)
  and (not p_filters ? 'durationMin' or (d.metadata->>'durationSeconds')::int>=(p_filters->>'durationMin')::int) and (not p_filters ? 'durationMax' or (d.metadata->>'durationSeconds')::int<=(p_filters->>'durationMax')::int)
  and (not p_filters ? 'key' or lower(d.metadata->>'musicalKey')=lower(p_filters->>'key')) and (not p_filters ? 'vocal' or d.metadata->>'vocal'=p_filters->>'vocal')
  and (not p_filters ? 'explicit' or d.metadata->>'explicit'=p_filters->>'explicit') and (not p_filters ? 'language' or lower(d.metadata->>'language')=lower(p_filters->>'language'))
 ),filtered as materialized(select * from eligible where not p_filters ? 'license' or (p_filters->>'license')::uuid=any(licenses)),page as (
  select *,row_number() over(order by case when p_sort='relevance' and p_filters ? 'query' then ts_rank(search_document,plainto_tsquery('simple',p_filters->>'query')) end desc,
  case when p_sort='newest' then created_at end desc,case when p_sort='bpm' then (metadata->>'bpm')::int end asc nulls last,case when p_sort='duration' then (metadata->>'durationSeconds')::int end asc,
  lower(metadata->>'title'),id) as ordinal from filtered order by case when p_sort='relevance' and p_filters ? 'query' then ts_rank(search_document,plainto_tsquery('simple',p_filters->>'query')) end desc,
  case when p_sort='newest' then created_at end desc,case when p_sort='bpm' then (metadata->>'bpm')::int end asc nulls last,case when p_sort='duration' then (metadata->>'durationSeconds')::int end asc,
  lower(metadata->>'title'),id limit p_size offset (p_page-1)*p_size
 )select (select count(*) from filtered),coalesce(jsonb_agg(jsonb_build_object('id',id,'slug',slug,'metadata',metadata,'licenseTypes',to_jsonb(licenses)) order by ordinal),'[]') into n,items from page;
 return jsonb_build_object('items',items,'total',n,'page',p_page,'page_size',p_size,'page_count',ceil(n::numeric/p_size));end$$;

create function public.catalog_publication_status(p_tracks uuid[],p_admin boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$declare u uuid:=catalog_private.actor(p_admin);begin
 if p_tracks is null or cardinality(p_tracks)>1000 then raise exception 'Bounded catalog ids required' using errcode='22023';end if;
 return coalesce((select jsonb_object_agg(t.id::text,jsonb_build_object('state',coalesce(c.state,'not_started'),'visible',catalog_private.visible(t.id),'blockers',to_jsonb(catalog_private.blockers(t.id)),'licenseCount',cardinality(catalog_private.available_licenses(t.id)))) from public.tracks t left join catalog_private.cases c on c.track_id=t.id where t.id=any(p_tracks) and (p_admin or t.artist_user_id=u and (c.owner_id=u or c.track_id is null))),'{}');end$$;
create function public.catalog_available_licenses(p_tracks uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'authenticated' or not public.auth_session_is_active() or not exists(select 1 from public.user_profiles where id=auth.uid() and (role='buyer' or role='admin' and public.is_admin())) then raise exception 'Catalog availability denied' using errcode='42501';end if;
 if p_tracks is null or cardinality(p_tracks)>1000 then raise exception 'Bounded catalog ids required' using errcode='22023';end if;
 return coalesce((select jsonb_object_agg(id::text,to_jsonb(catalog_private.available_licenses(id))) from (select distinct id from unnest(p_tracks) id where catalog_private.visible(id))x),'{}');end$$;
-- Reuse the narrow security-invoker views. No private legal evidence or contacts.
-- Existing unreviewed records are retained but not implicitly published.
do $$declare definition text;begin
 select pg_get_functiondef('security_private.buyer_catalog_public_rows()'::regprocedure) into definition;
 definition:=replace(definition,'where t.status = ''approved''::public.track_status','where t.status = ''approved''::public.track_status and catalog_private.visible(t.id) and public.auth_session_is_active()');
 if definition like '%p.artist_name%' then
  definition:=replace(definition,'p.artist_name,','(select d.metadata->>''artist'' from catalog_private.cases c join catalog_private.decisions d on d.id=c.approved_decision where c.track_id=t.id) as artist_name,');
 end if;
 execute definition;
 select pg_get_functiondef('security_private.track_rights_holders_public_rows()'::regprocedure) into definition;
 definition:=replace(definition,'where t.status = ''approved''::public.track_status','where t.status = ''approved''::public.track_status and catalog_private.visible(t.id) and public.auth_session_is_active()');
 if definition like '%p.artist_name%' then
  definition:=replace(definition,'p.artist_name,','(select d.metadata->>''artist'' from catalog_private.cases c join catalog_private.decisions d on d.id=c.approved_decision where c.track_id=t.id) as artist_name,');
 end if;
 execute definition;
end$$;
create or replace function public.read_licensing_choices(p_track uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare h record;o licensing_private.offers;result jsonb:='[]';available uuid[];begin
 perform licensing_private.buyer();
 if not catalog_private.visible(p_track) then return result;end if;
 available:=catalog_private.available_licenses(p_track);
 for h in select offer_id from licensing_private.offer_heads where track_id=p_track and license_type_id=any(available) loop
  o:=licensing_private.check_offer(h.offer_id,clock_timestamp());result:=result||jsonb_build_array(jsonb_build_object('licenseId',o.license_type_id,'uses',o.rights#>'{scope,uses}','territories',o.rights#>'{scope,territories}'));
 end loop;return result;end$$;
-- Raw Data API option reads obey the same availability as the search projection.
create function security_private.catalog_license_available(p_track uuid,p_license uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'authenticated' or not public.auth_session_is_active() or not exists(select 1 from public.user_profiles where id=auth.uid() and role='buyer') then return false;end if;
 return catalog_private.visible(p_track) and p_license=any(catalog_private.available_licenses(p_track));end$$;
revoke all on function security_private.catalog_license_available(uuid,uuid) from public,anon,service_role;
grant execute on function security_private.catalog_license_available(uuid,uuid) to authenticated;
create policy "Catalog buyer license availability" on public.track_license_options as restrictive for select to authenticated using (
 not exists(select 1 from public.user_profiles viewer where viewer.id=auth.uid() and viewer.role='buyer') or security_private.catalog_license_available(track_id,license_type_id)
);
-- Transaction snapshots acquire the exact accepted catalog metadata; retries never rebase it.
create function catalog_private.freeze_quote() returns trigger language plpgsql security definer set search_path='' as $$declare c catalog_private.cases;d catalog_private.decisions;begin
 perform catalog_private.assert_current((new.schedule#>>'{track,id}')::uuid);
 select * into c from catalog_private.cases where track_id=(new.schedule#>>'{track,id}')::uuid;
 if c.track_id is not null then
  perform catalog_private.assert_current(c.track_id);select * into strict d from catalog_private.decisions where id=c.approved_decision;
  new.schedule:=new.schedule||jsonb_build_object('catalogEvidence',jsonb_build_object('versionId',d.version_id,'decisionId',d.id,'metadata',d.metadata,'metadataHash',licensing_private.hash_json(d.metadata),'contextHash',d.context_hash));new.schedule_hash:=licensing_private.hash_json(new.schedule);
 end if;return new;end$$;
create trigger zzz_catalog_quote before insert on licensing_private.quotes for each row execute function catalog_private.freeze_quote();
create function catalog_private.guard_acceptance() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.snapshot is not null then
  if new.snapshot->'catalogEvidence' is null then raise exception 'Original catalog acceptance required' using errcode='42501';end if;
  perform catalog_private.assert_current((new.snapshot#>>'{track,id}')::uuid,new.snapshot->'catalogEvidence');
 end if;return new;end$$;
create trigger catalog_acceptance before insert on licensing_private.acceptances for each row execute function catalog_private.guard_acceptance();
do $$declare definition text;begin
 select pg_get_functiondef('licensing_private.assert_purchase(uuid,boolean)'::regprocedure) into definition;
 execute replace(definition,'licensing_private.assert_purchase(','licensing_private.assert_purchase_before_system05(');
end$$;
create or replace function licensing_private.assert_purchase(p_order uuid,p_paid boolean) returns licensing_private.acceptances language plpgsql security definer set search_path='' as $$declare a licensing_private.acceptances;begin
 a:=licensing_private.assert_purchase_before_system05(p_order,p_paid);
 if not exists(select 1 from public.generated_licenses where order_id=p_order and status='generated') then
  if a.snapshot->'catalogEvidence' is null then raise exception 'Original catalog acceptance required' using errcode='42501';end if;
  perform catalog_private.assert_current((a.snapshot#>>'{track,id}')::uuid,a.snapshot->'catalogEvidence');
 end if;return a;end$$;

-- All private state is unexposed, FORCE RLS and only reachable through authorized RPCs.
do $$declare t text;f regprocedure;begin
 foreach t in array array['cases','versions','decisions','events','operations'] loop
  execute format('alter table catalog_private.%I enable row level security',t);execute format('alter table catalog_private.%I force row level security',t);execute format('create policy trusted_owner on catalog_private.%I to postgres using(true) with check(true)',t);
  if t<>'cases' then execute format('create trigger immutable_catalog before update or delete on catalog_private.%I for each row execute function licensing_private.immutable()',t);end if;
 end loop;
 for f in select p.oid::regprocedure from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in('catalog_save','catalog_submit','catalog_review','catalog_transition','catalog_reopen','catalog_read','catalog_list','catalog_history','catalog_recover','catalog_search','catalog_available_licenses','catalog_publication_status') loop
 execute format('revoke all on function %s from public,anon,service_role',f);execute format('grant execute on function %s to authenticated',f);end loop;
end$$;
revoke all on all tables in schema catalog_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema catalog_private from public,anon,authenticated,service_role;
revoke all on all functions in schema catalog_private from public,anon,authenticated,service_role;
revoke all on function licensing_private.assert_purchase_before_system05(uuid,boolean) from public,anon,authenticated,service_role;
commit;
