-- Private submission preparation only. No backfill, inferred rights, Storage policy or capability changes.
begin;
do $$begin if current_user<>'postgres' then raise exception 'Verified installer required';end if;end$$;
create table submission_media.workspace_documents (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null references submission_media.submissions(id),
 owner_id uuid not null references public.user_profiles(id),kind text not null check(kind in ('agreement','authority','sample')),
 filename text not null check(length(filename) between 1 and 255),bytes bigint not null check(bytes between 16 and 3000000),
 reservation_key uuid not null,created_at timestamptz not null default clock_timestamp(),
 state text not null default 'reserved' check(state in ('reserved','received')),
 object_id uuid references storage.objects(id),version text,sha256 text,received_at timestamptz,
 unique(owner_id,reservation_key),
 check((state='reserved' and object_id is null and version is null and sha256 is null and received_at is null) or
 (state='received' and object_id is not null and length(version) between 1 and 128 and sha256~'^[a-f0-9]{64}$' and received_at is not null))
);
create table submission_media.workspace_document_events (
 id bigint generated always as identity primary key,document_id uuid not null references submission_media.workspace_documents(id),
 actor_id uuid not null references public.user_profiles(id),action text not null check(action in ('reserved','received','authorized','delivered','failed')),
 recorded_at timestamptz not null default clock_timestamp()
);
create index workspace_document_events_actor_time on submission_media.workspace_document_events(actor_id,recorded_at);
alter table submission_media.workspace_documents enable row level security;
alter table submission_media.workspace_documents force row level security;
alter table submission_media.workspace_document_events enable row level security;
alter table submission_media.workspace_document_events force row level security;
create policy owner_only on submission_media.workspace_documents to postgres using(true) with check(true);
create policy owner_only on submission_media.workspace_document_events to postgres using(true) with check(true);
revoke all on submission_media.workspace_documents,submission_media.workspace_document_events from public,anon,authenticated,service_role,submission_media_broker,media_broker_production_login;
create function submission_media.guard_workspace_document() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or old.state='received' or (to_jsonb(new)-array['state','object_id','version','sha256','received_at']) is distinct from (to_jsonb(old)-array['state','object_id','version','sha256','received_at']) or new.state<>'received' then raise exception 'Immutable document evidence' using errcode='42501';end if;return new;
end$$;
create trigger workspace_document_identity before update or delete on submission_media.workspace_documents for each row execute function submission_media.guard_workspace_document();
create trigger workspace_document_events_immutable before update or delete on submission_media.workspace_document_events for each row execute function submission_media.vm_audit_immutable();
create function submission_media.workspace_text_object(p jsonb,limits jsonb) returns void language plpgsql immutable set search_path='' as $$declare f record;begin
 if jsonb_typeof(p) is distinct from 'object' or p-(select array_agg(key) from jsonb_object_keys(limits) key)<>'{}'::jsonb then raise exception 'Invalid structured rights fields' using errcode='22023';end if;
 for f in select key,value::integer maximum from jsonb_each_text(limits) loop
 if jsonb_typeof(p->f.key) is distinct from 'string' or length(p->>f.key)>f.maximum or (p->>f.key)~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'Invalid structured rights field' using errcode='22023';end if;end loop;
end$$;
create function submission_media.workspace_date_window(a text,b text) returns boolean language plpgsql immutable set search_path='' as $$begin
 if a!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(a::date,'YYYY-MM-DD')<>a then return false;end if;
 return b='' or (b~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and to_char(b::date,'YYYY-MM-DD')=b and b::date>=a::date);
 exception when others then return false;end$$;
create function submission_media.workspace_region(a text,b text) returns boolean language sql immutable set search_path='' as $$select case when a~'^[0-9]{1,5}([.][0-9]{1,3})?$' and b~'^[0-9]{1,5}([.][0-9]{1,3})?$' then a::numeric>=0 and b::numeric>a::numeric and b::numeric<=86400 else false end$$;
create function submission_media.workspace_document_ref(p_submission uuid,p_id text,p_kind text) returns void language plpgsql security definer set search_path='' as $$begin
 if p_id='' then return;end if;
 if p_id is null or p_id!~'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' or not exists(select 1 from submission_media.workspace_documents d join submission_media.submissions s on s.id=d.submission_id join storage.objects o on o.id=d.object_id join storage.buckets b on b.id=o.bucket_id and not b.public where d.id=p_id::uuid and d.submission_id=p_submission and d.owner_id=s.owner_id and d.kind=p_kind and d.state='received' and o.bucket_id='rights-evidence' and o.name=d.owner_id||'/'||d.submission_id||'/'||d.id||'/original' and o.version=d.version and (o.metadata->>'size')::bigint=d.bytes) then raise exception 'Owned received document required' using errcode='22023';end if;
end$$;
create function submission_media.validate_workspace_rights(p_submission uuid,d jsonb,p_complete boolean) returns void language plpgsql security definer set search_path='' as $$
declare a jsonb;s jsonb;g jsonb;c jsonb;keys text[]:=array['publishingOwners','authority','hasSamples','samples','hasClaims','claims','hasAgreements','agreements'];begin
 if not d ?| keys and not p_complete then return;end if;
 if not d ?& keys then raise exception 'Structured rights information required' using errcode='22023';end if;
 perform submission_media.validate_master_owners(d->'publishingOwners',p_complete);
 if jsonb_typeof(d->'hasSamples') is distinct from 'boolean' or jsonb_typeof(d->'hasClaims') is distinct from 'boolean' or jsonb_typeof(d->'hasAgreements') is distinct from 'boolean' or jsonb_typeof(d->'samples') is distinct from 'array' or jsonb_typeof(d->'claims') is distinct from 'array' or jsonb_typeof(d->'agreements') is distinct from 'array' then raise exception 'Invalid disclosure classifications' using errcode='22023';end if;
 if jsonb_array_length(d->'samples')>10 or jsonb_array_length(d->'claims')>10 or jsonb_array_length(d->'agreements')>10 then raise exception 'Disclosure limit' using errcode='22023';end if;
 a:=d->'authority';
 perform submission_media.workspace_text_object(a,'{"mode": 20, "legalName": 200, "company": 200, "capacity": 100, "email": 254, "jurisdiction": 100, "address": 500, "representedOwners": 1000, "rights": 20, "uses": 1000, "territories": 500, "validFrom": 10, "validUntil": 10, "exclusivity": 20, "restrictions": 2000, "documentId": 36}'::jsonb);
 if a->>'mode' not in ('unknown','owners','representative') or a->>'rights' not in ('unknown','master','publishing','both') or a->>'exclusivity' not in ('unknown','nonexclusive','exclusive','both') then raise exception 'Invalid authority classification' using errcode='22023';end if;
 perform submission_media.workspace_document_ref(p_submission,a->>'documentId','authority');
 if p_complete and (a->>'mode'='unknown' or (a->>'mode'='representative' and (btrim(a->>'legalName')='' or btrim(a->>'capacity')='' or btrim(a->>'jurisdiction')='' or btrim(a->>'address')='' or a->>'email'!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or btrim(a->>'representedOwners')='' or a->>'rights'='unknown' or btrim(a->>'uses')='' or btrim(a->>'territories')='' or not submission_media.workspace_date_window(a->>'validFrom',a->>'validUntil') or a->>'exclusivity'='unknown' or a->>'documentId'=''))) then raise exception 'Complete licensing authority required' using errcode='22023';end if;
 if p_complete and ((d->>'hasSamples')::boolean is distinct from (jsonb_array_length(d->'samples')>0) or (d->>'hasClaims')::boolean is distinct from (jsonb_array_length(d->'claims')>0) or (d->>'hasAgreements')::boolean is distinct from (jsonb_array_length(d->'agreements')>0)) then raise exception 'Review retained disclosures' using errcode='22023';end if;
 for s in select value from jsonb_array_elements(d->'samples') loop
 perform submission_media.workspace_text_object(s,'{"title": 200, "artist": 200, "identifier": 100, "use": 20, "masterOwner": 200, "publisher": 200, "sourceStart": 10, "sourceEnd": 10, "trackStart": 10, "trackEnd": 10, "description": 1000, "clearance": 20, "documentId": 36}'::jsonb);
 if s->>'use' not in ('unknown','recording','interpolation') or s->>'clearance' not in ('unknown','pending','claimed_cleared') then raise exception 'Invalid sample classification' using errcode='22023';end if;
 perform submission_media.workspace_document_ref(p_submission,s->>'documentId','sample');
 if p_complete and (btrim(s->>'title')='' or btrim(s->>'artist')='' or s->>'use'='unknown' or (s->>'use'='recording' and btrim(s->>'masterOwner')='') or btrim(s->>'publisher')='' or not submission_media.workspace_region(s->>'sourceStart',s->>'sourceEnd') or not submission_media.workspace_region(s->>'trackStart',s->>'trackEnd') or btrim(s->>'description')='' or s->>'clearance'='unknown' or (s->>'clearance'='claimed_cleared' and s->>'documentId'='')) then raise exception 'Complete sample disclosure required' using errcode='22023';end if;
 end loop;
 for c in select value from jsonb_array_elements(d->'claims') loop
 perform submission_media.workspace_text_object(c,'{"claimant": 200, "kind": 20, "reference": 200, "details": 2000, "status": 20, "resolution": 1000}'::jsonb);
 if c->>'kind' not in ('unknown','ownership','copyright','exclusivity','other') or c->>'status' not in ('unknown','open','claimed_resolved') then raise exception 'Invalid claim classification' using errcode='22023';end if;
 if p_complete and (btrim(c->>'claimant')='' or c->>'kind'='unknown' or btrim(c->>'details')='' or c->>'status'='unknown' or (c->>'status'='claimed_resolved' and btrim(c->>'resolution')='')) then raise exception 'Complete claim disclosure required' using errcode='22023';end if;
 end loop;
 for g in select value from jsonb_array_elements(d->'agreements') loop
 perform submission_media.workspace_text_object(g,'{"title": 200, "counterparty": 200, "kind": 30, "rights": 20, "validFrom": 10, "validUntil": 10, "territories": 500, "restrictions": 2000, "documentId": 36}'::jsonb);
 if g->>'kind' not in ('unknown','publishing','label','distribution','administration','exclusive_license','other') or g->>'rights' not in ('unknown','master','publishing','both') then raise exception 'Invalid agreement classification' using errcode='22023';end if;
 perform submission_media.workspace_document_ref(p_submission,g->>'documentId','agreement');
 if p_complete and (btrim(g->>'title')='' or btrim(g->>'counterparty')='' or g->>'kind'='unknown' or g->>'rights'='unknown' or not submission_media.workspace_date_window(g->>'validFrom',g->>'validUntil') or btrim(g->>'territories')='' or g->>'documentId'='') then raise exception 'Complete existing agreement and document required' using errcode='22023';end if;
 end loop;
end$$;
create or replace function public.media_submission_save_draft(p_submission uuid,p_data jsonb,p_revision bigint,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions; o submission_media.operations; f record;begin
 perform submission_media.require_capability('reservations');s:=submission_media.lock_owned(p_submission,null);
 o:=submission_media.begin_operation(s.id,'save_workspace_draft',p_key,jsonb_build_object('data',p_data,'revision',p_revision));if o.state='complete' then return o.result;end if;
 if p_revision is null or p_revision<>s.workspace_revision then raise exception 'STALE_REVISION' using errcode='40001';end if;
 if exists(select 1 from submission_media.master_reviews where submission_id=s.id and state='pending') or (s.track_id is not null and not exists(select 1 from public.tracks where id=s.track_id and status='draft')) then raise exception 'Submitted workspace is read only' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>40000 or (p_data-array['title','primaryArtist','featuredArtists','description','genre','subgenre','bpm','key','moods','language','releaseTitle','releaseDate','releaseYear','masterOwnership','masterOwners','publishingOwners','authority','hasSamples','samples','hasClaims','claims','hasAgreements','agreements','publishingOwnership','licensingAuthority','rightsNotes','permittedUses','restrictions','territories','licenseDuration','explicit','vocal','releaseStatus','contributors','rightsDeclared','licenseCategories'])<>'{}'::jsonb then raise exception 'Invalid draft' using errcode='22023';end if;
 for f in select * from (values ('title',160),('primaryArtist',200),('featuredArtists',1000),('description',3000),('genre',80),('subgenre',80),('bpm',3),('key',40),('moods',500),('language',35),('releaseTitle',200),('releaseDate',10),('releaseYear',4),('masterOwnership',2000),('publishingOwnership',2000),('licensingAuthority',2000),('rightsNotes',2000),('permittedUses',1000),('restrictions',2000),('territories',500),('licenseDuration',200)) fields(name,maximum) loop
  if jsonb_typeof(p_data->f.name) is distinct from 'string' or length(p_data->>f.name)>f.maximum or (p_data->>f.name)~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'Invalid draft field' using errcode='22023';end if;
 end loop;
 if coalesce(p_data->>'explicit','') not in ('unknown','clean','explicit') or coalesce(p_data->>'vocal','') not in ('unknown','instrumental','vocal','mixed') or coalesce(p_data->>'releaseStatus','') not in ('unreleased','released') or jsonb_typeof(p_data->'rightsDeclared') is distinct from 'boolean' or jsonb_typeof(p_data->'contributors') is distinct from 'array' or jsonb_typeof(p_data->'licenseCategories') is distinct from 'array' then raise exception 'Invalid draft classification' using errcode='22023';end if;
 if jsonb_array_length(p_data->'contributors')>30 or jsonb_array_length(p_data->'licenseCategories')>3 then raise exception 'Draft limit' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'licenseCategories') c where jsonb_typeof(c) is distinct from 'string' or c#>>'{}' not in ('digital','broadcast','exclusive')) or exists(select 1 from jsonb_array_elements(p_data->'contributors') c where jsonb_typeof(c) is distinct from 'object' or c-array['name','role']<>'{}'::jsonb or jsonb_typeof(c->'name') is distinct from 'string' or length(c->>'name')>200 or coalesce(c->>'role','') not in ('writer','composer','producer','publisher','performer','other')) then raise exception 'Invalid contributors or preferences' using errcode='22023';end if;
 if s.workspace_draft ? 'publishingOwners' and not p_data ? 'publishingOwners' then raise exception 'Reload the updated rights workspace before saving' using errcode='22023';end if;
 perform submission_media.validate_master_owners(p_data->'masterOwners',false);
 perform submission_media.validate_workspace_rights(s.id,p_data,false);
 update submission_media.submissions set workspace_draft=p_data,workspace_revision=workspace_revision+1 where id=s.id;
 perform submission_media.append_event(s.id,'upload_metadata_saved',null,o.id,null,null,'artist');
 return submission_media.finish_operation(o.id,jsonb_build_object('draft_revision',s.workspace_revision+1,'revision',submission_media.bump(s.id)));
end $$;
create or replace function public.media_submission_prepare(p_submission uuid,p_revision bigint,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions;o submission_media.operations;d jsonb;m jsonb;c jsonb;r jsonb;t uuid;begin
 perform submission_media.require_capability('reservations');s:=submission_media.lock_owned(p_submission,null);
 o:=submission_media.begin_operation(s.id,'prepare_workspace',p_key,jsonb_build_object('revision',p_revision));if o.state='complete' then return o.result;end if;
 if p_revision is null or p_revision<>s.revision then raise exception 'STALE_REVISION' using errcode='40001';end if;
 d:=s.workspace_draft;if d is null then raise exception 'Save track details first' using errcode='22023';end if;
 perform submission_media.validate_master_owners(d->'masterOwners',true);
 perform submission_media.validate_workspace_rights(s.id,d,true);
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
create or replace function submission_media.guard_master_ownership_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare draft jsonb;begin
 if new.state='pending' and (tg_op='INSERT' or old.state is distinct from new.state) then
  select workspace_draft into draft from submission_media.submissions where id=new.submission_id;
  if draft is not null then perform submission_media.validate_master_owners(draft->'masterOwners',true);perform submission_media.validate_workspace_rights(new.submission_id,draft,true);end if;
 end if;
 return new;
end $$;

create function submission_media.workspace_document_editable(s submission_media.submissions) returns void language plpgsql set search_path='' as $$begin
 if exists(select 1 from submission_media.master_reviews where submission_id=s.id and state='pending') or (s.track_id is not null and not exists(select 1 from public.tracks where id=s.track_id and status='draft')) then raise exception 'Submitted workspace is read only' using errcode='42501';end if;
end$$;
create function public.media_workspace_document_reserve(p_submission uuid,p_kind text,p_filename text,p_bytes bigint,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions;d submission_media.workspace_documents;begin
 perform submission_media.require_capability('reservations');s:=submission_media.lock_owned(p_submission,null);perform submission_media.workspace_document_editable(s);
 if p_key is null or p_kind is null or p_kind not in ('agreement','authority','sample') or p_filename is null or p_filename!~*'^[^/\\[:cntrl:]]+[.]pdf$' or length(p_filename)>255 or p_bytes is null or p_bytes not between 16 and 3000000 then raise exception 'Invalid private document' using errcode='22023';end if;
 select * into d from submission_media.workspace_documents where owner_id=s.owner_id and reservation_key=p_key;
 if found then
 if d.submission_id<>s.id or d.kind<>p_kind or d.filename<>p_filename or d.bytes<>p_bytes then raise exception 'Idempotency conflict' using errcode='22023';end if;return jsonb_build_object('document_id',d.id);end if;
 if (select count(*) from submission_media.workspace_documents where submission_id=s.id)>=20 then raise exception 'Document reservation limit' using errcode='54000';end if;
 if not exists(select 1 from storage.buckets where id='rights-evidence' and not public and file_size_limit>=p_bytes) then raise exception 'Private evidence storage unavailable' using errcode='55000';end if;
 insert into submission_media.workspace_documents(submission_id,owner_id,kind,filename,bytes,reservation_key) values(s.id,s.owner_id,p_kind,p_filename,p_bytes,p_key) returning * into d;
 insert into submission_media.workspace_document_events(document_id,actor_id,action) values(d.id,s.owner_id,'reserved');return jsonb_build_object('document_id',d.id);
end$$;
create function submission_media.workspace_document_actor(p_submission uuid,p_admin boolean) returns uuid language plpgsql security definer set search_path='' as $$declare u uuid;begin
 perform submission_media.require_capability('reads');
 if p_admin then perform public.media_upload_admin_read(p_submission);u:=submission_media.require_actor('admin');
 else u:=submission_media.require_actor('artist');if not exists(select 1 from submission_media.submissions where id=p_submission and owner_id=u) then raise exception 'Permission denied' using errcode='42501';end if;end if;
 return u;
end$$;
create function public.media_workspace_documents(p_submission uuid,p_admin boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform submission_media.workspace_document_actor(p_submission,p_admin);
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'filename',d.filename,'bytes',d.bytes,'state',d.state,'sha256',d.sha256) order by d.created_at,d.id) from submission_media.workspace_documents d where d.submission_id=p_submission),'[]'::jsonb);
end$$;
create function public.media_workspace_document_access(p_document uuid,p_write boolean default false,p_admin boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$declare d submission_media.workspace_documents;s submission_media.submissions;u uuid;begin
 select * into d from submission_media.workspace_documents where id=p_document;if not found then raise exception 'Permission denied' using errcode='42501';end if;
 u:=submission_media.workspace_document_actor(d.submission_id,p_admin);
 if p_write then if p_admin then raise exception 'Permission denied' using errcode='42501';end if;perform submission_media.require_capability('reservations');s:=submission_media.lock_owned(d.submission_id,null);perform submission_media.workspace_document_editable(s);
 else if d.state<>'received' then raise exception 'Document not received' using errcode='22023';end if;perform submission_media.workspace_document_ref(d.submission_id,d.id::text,d.kind);end if;
 return jsonb_build_object('id',d.id,'submission_id',d.submission_id,'bucket','rights-evidence','path',d.owner_id||'/'||d.submission_id||'/'||d.id||'/original','bytes',d.bytes,'state',d.state,'sha256',d.sha256,'version',d.version);
end$$;
create function public.media_workspace_document_received(p_actor uuid,p_document uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$declare d submission_media.workspace_documents;s submission_media.submissions;o storage.objects;begin
 perform submission_media.require_capability('reservations');select * into d from submission_media.workspace_documents where id=p_document for update;
 if not found or p_actor is null or d.owner_id<>p_actor or not exists(select 1 from public.user_profiles where id=p_actor and role='artist') then raise exception 'Permission denied' using errcode='42501';end if;
 select * into s from submission_media.submissions where id=d.submission_id and owner_id=p_actor for update;perform submission_media.workspace_document_editable(s);
 if p_hash is null or p_hash!~'^[a-f0-9]{64}$' then raise exception 'Invalid document hash' using errcode='22023';end if;
 select * into o from storage.objects where bucket_id='rights-evidence' and name=d.owner_id||'/'||d.submission_id||'/'||d.id||'/original';
 if not found or o.version is null or length(o.version) not between 1 and 128 or (o.metadata->>'size')::bigint is distinct from d.bytes or (o.owner_id is not null and o.owner_id<>p_actor::text) or not exists(select 1 from storage.buckets where id=o.bucket_id and not public) then raise exception 'Private document integrity failed' using errcode='22023';end if;
 if d.state='received' then if d.sha256<>p_hash or d.object_id<>o.id or d.version<>o.version then raise exception 'Immutable document evidence' using errcode='42501';end if;return jsonb_build_object('id',d.id,'received',true);end if;
 update submission_media.workspace_documents set state='received',object_id=o.id,version=o.version,sha256=p_hash,received_at=clock_timestamp() where id=d.id;
 insert into submission_media.workspace_document_events(document_id,actor_id,action) values(d.id,p_actor,'received');return jsonb_build_object('id',d.id,'received',true);
end$$;
create function public.media_workspace_document_audit(p_document uuid,p_admin boolean,p_outcome text) returns jsonb language plpgsql security definer set search_path='' as $$declare d submission_media.workspace_documents;u uuid;begin
 select * into d from submission_media.workspace_documents where id=p_document;if not found then raise exception 'Permission denied' using errcode='42501';end if;
 u:=submission_media.workspace_document_actor(d.submission_id,p_admin);
 if p_outcome is null or p_outcome not in ('authorized','delivered','failed') then raise exception 'Invalid access outcome' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('workspace-document-audit:'||u::text,0));
 if (select count(*) from submission_media.workspace_document_events where actor_id=u and recorded_at>clock_timestamp()-interval '15 minutes')>=300 or (p_outcome='authorized' and (select count(*) from submission_media.workspace_document_events where actor_id=u and action='authorized' and recorded_at>clock_timestamp()-interval '15 minutes')>=30) then raise exception 'Private document access limit' using errcode='54000';end if;
 insert into submission_media.workspace_document_events(document_id,actor_id,action) values(d.id,u,p_outcome);return jsonb_build_object('recorded',true);
end$$;
-- New private helpers are closed; old public RPC ACLs are preserved.
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='submission_media' and p.proname in ('guard_workspace_document','workspace_text_object','workspace_date_window','workspace_region','workspace_document_ref','validate_workspace_rights','workspace_document_editable','workspace_document_actor') loop execute format('revoke all on function %s from public,anon,authenticated,service_role,submission_media_broker,media_broker_production_login',f);end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('media_workspace_document_reserve','media_workspace_documents','media_workspace_document_access','media_workspace_document_audit') loop execute format('revoke all on function %s from public,anon,service_role',f);execute format('grant execute on function %s to authenticated',f);end loop;
end$$;
revoke all on function public.media_workspace_document_received(uuid,uuid,text) from public,anon,authenticated,submission_media_broker,media_broker_production_login;
grant execute on function public.media_workspace_document_received(uuid,uuid,text) to service_role;
commit;
