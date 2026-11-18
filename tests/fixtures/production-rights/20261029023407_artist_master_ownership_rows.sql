-- Structured master ownership is a private claim, never canonical verified rights.
-- Additive local migration. No existing draft, rightsholder, payment or permit rows rewritten.
begin;
create or replace function submission_media.validate_master_owners(p_owners jsonb,p_complete boolean) returns void
language plpgsql immutable set search_path='' as $$
declare owner jsonb;percentage text;total numeric:=0;begin
 if p_owners is null and not p_complete then return;end if;
 if p_owners is null or jsonb_typeof(p_owners) is distinct from 'array' then raise exception 'Invalid master owners' using errcode='22023';end if;
 if jsonb_array_length(p_owners)>30 or (p_complete and jsonb_array_length(p_owners)=0) then raise exception 'Enter master owners totaling 100 percent' using errcode='22023';end if;
 for owner in select value from jsonb_array_elements(p_owners) loop
  if jsonb_typeof(owner) is distinct from 'object' or owner-array['name','percentage']<>'{}'::jsonb or jsonb_typeof(owner->'name') is distinct from 'string' or length(owner->>'name')>200 or (owner->>'name')~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' or jsonb_typeof(owner->'percentage') is distinct from 'string' or length(owner->>'percentage')>6 or (owner->>'percentage')~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'Invalid master owner' using errcode='22023';end if;
  percentage:=owner->>'percentage';
  -- Empty/incomplete percentages are recoverable private drafts only.
  if percentage<>'' and percentage!~'^(100([.]0{1,2})?|[0-9]{1,2}([.][0-9]{1,2})?)$' then
   if p_complete then raise exception 'Invalid ownership percentage' using errcode='22023';end if;
  elsif percentage<>'' then total:=total+percentage::numeric;end if;
  if p_complete and (btrim(owner->>'name')='' or percentage='' or percentage::numeric<=0) then raise exception 'Each master owner needs a name and positive share' using errcode='22023';end if;
 end loop;
 if p_complete and total<>100 then raise exception 'Master ownership must total exactly 100 percent' using errcode='22023';end if;
end $$;
revoke all on function submission_media.validate_master_owners(jsonb,boolean) from public,anon,authenticated,service_role;

create or replace function public.media_submission_save_draft(p_submission uuid,p_data jsonb,p_revision bigint,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions; o submission_media.operations; f record;begin
 perform submission_media.require_capability('reservations');s:=submission_media.lock_owned(p_submission,null);
 o:=submission_media.begin_operation(s.id,'save_workspace_draft',p_key,jsonb_build_object('data',p_data,'revision',p_revision));if o.state='complete' then return o.result;end if;
 if p_revision is null or p_revision<>s.workspace_revision then raise exception 'STALE_REVISION' using errcode='40001';end if;
 if exists(select 1 from submission_media.master_reviews where submission_id=s.id and state='pending') or (s.track_id is not null and not exists(select 1 from public.tracks where id=s.track_id and status='draft')) then raise exception 'Submitted workspace is read only' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>40000 or (p_data-array['title','primaryArtist','featuredArtists','description','genre','subgenre','bpm','key','moods','language','releaseTitle','releaseDate','releaseYear','masterOwnership','masterOwners','publishingOwnership','licensingAuthority','rightsNotes','permittedUses','restrictions','territories','licenseDuration','explicit','vocal','releaseStatus','contributors','rightsDeclared','licenseCategories'])<>'{}'::jsonb then raise exception 'Invalid draft' using errcode='22023';end if;
 for f in select * from (values ('title',160),('primaryArtist',200),('featuredArtists',1000),('description',3000),('genre',80),('subgenre',80),('bpm',3),('key',40),('moods',500),('language',35),('releaseTitle',200),('releaseDate',10),('releaseYear',4),('masterOwnership',2000),('publishingOwnership',2000),('licensingAuthority',2000),('rightsNotes',2000),('permittedUses',1000),('restrictions',2000),('territories',500),('licenseDuration',200)) fields(name,maximum) loop
  if jsonb_typeof(p_data->f.name) is distinct from 'string' or length(p_data->>f.name)>f.maximum or (p_data->>f.name)~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'Invalid draft field' using errcode='22023';end if;
 end loop;
 if coalesce(p_data->>'explicit','') not in ('unknown','clean','explicit') or coalesce(p_data->>'vocal','') not in ('unknown','instrumental','vocal','mixed') or coalesce(p_data->>'releaseStatus','') not in ('unreleased','released') or jsonb_typeof(p_data->'rightsDeclared') is distinct from 'boolean' or jsonb_typeof(p_data->'contributors') is distinct from 'array' or jsonb_typeof(p_data->'licenseCategories') is distinct from 'array' then raise exception 'Invalid draft classification' using errcode='22023';end if;
 if jsonb_array_length(p_data->'contributors')>30 or jsonb_array_length(p_data->'licenseCategories')>3 then raise exception 'Draft limit' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'licenseCategories') c where jsonb_typeof(c) is distinct from 'string' or c#>>'{}' not in ('digital','broadcast','exclusive')) or exists(select 1 from jsonb_array_elements(p_data->'contributors') c where jsonb_typeof(c) is distinct from 'object' or c-array['name','role']<>'{}'::jsonb or jsonb_typeof(c->'name') is distinct from 'string' or length(c->>'name')>200 or coalesce(c->>'role','') not in ('writer','composer','producer','publisher','performer','other')) then raise exception 'Invalid contributors or preferences' using errcode='22023';end if;
 perform submission_media.validate_master_owners(p_data->'masterOwners',false);
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


-- Cover review requests that bypass the workspace preparation UI/API.
create or replace function submission_media.guard_master_ownership_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare draft jsonb;begin
 if new.state='pending' and (tg_op='INSERT' or old.state is distinct from new.state) then
  select workspace_draft into draft from submission_media.submissions where id=new.submission_id;
  if draft is not null then perform submission_media.validate_master_owners(draft->'masterOwners',true);end if;
 end if;
 return new;
end $$;
revoke all on function submission_media.guard_master_ownership_review() from public,anon,authenticated,service_role;
drop trigger if exists guard_master_ownership_review on submission_media.master_reviews;
create trigger guard_master_ownership_review before insert or update of state on submission_media.master_reviews for each row execute function submission_media.guard_master_ownership_review();
-- CREATE OR REPLACE preserves the existing public RPC ACLs. No new API grants.
commit;
