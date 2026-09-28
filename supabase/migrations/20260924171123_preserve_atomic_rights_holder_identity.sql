begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
-- Forward-only. Applied M3 and PT409 migrations remain byte-for-byte unchanged.
do $guard$
declare p oid := to_regprocedure('public.update_artist_track_atomic(uuid,uuid,timestamptz,jsonb,jsonb,jsonb)');
begin
 if p is null or not exists(select 1 from pg_proc where oid=p and md5(prosrc) in ('c6a7734f084f9af3c26638eda5e8fd79','5beb5797b50719e88ee9e7d019304bd5')) then
  raise exception 'Atomic artist function baseline mismatch; stop and review.';
 end if;
 if (select array_agg(attname::text order by attname) from pg_attribute
     where attrelid='public.rights_holders'::regclass and attnum>0 and not attisdropped)
    is distinct from array['approval_status','created_at','email','id','name','ownership_percent','role_type','track_id','updated_at','user_id']::text[] then
  raise exception 'Rights holder column contract changed; stop and review.';
 end if;
end $guard$;
create or replace function public.update_artist_track_atomic(
 p_actor_id uuid,p_track_id uuid,p_expected_updated_at timestamptz,
 p_values jsonb,p_rights jsonb,p_options jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
 prior public.tracks%rowtype;
 candidate public.tracks%rowtype;
 actor_email text;
 prior_rights jsonb;
 prior_options jsonb;
 matched_rights jsonb;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'Trusted artist workflow required.' using errcode='42501';
 end if;
 if not exists(select 1 from public.user_profiles where id=p_actor_id and role='artist') then
  raise exception 'Artist access required.' using errcode='42501';
 end if;
 select * into prior from public.tracks where id=p_track_id and artist_user_id=p_actor_id for update;
 if not found then raise exception 'Artist-owned track not found.' using errcode='42501'; end if;
 if p_expected_updated_at is null or prior.updated_at is distinct from p_expected_updated_at then
  raise exception 'This track changed. Reload before saving.' using errcode='PT409';
 end if;
 if jsonb_typeof(p_values) is distinct from 'object' or exists(
  select 1 from jsonb_object_keys(p_values) k where k not in (
   'title','slug','description','genre','subgenre','moods','bpm','musical_key','duration_seconds',
   'instrumental','vocals','explicit','lyrics','release_year','waveform_path','audio_file_path',
   'preview_file_path','cover_art_path','status')) then
  raise exception 'Unsupported track fields.' using errcode='42501';
 end if;
 candidate := jsonb_populate_record(prior,p_values);
 if candidate.status not in ('draft','pending_review') then
  raise exception 'Artist saves require review.' using errcode='42501';
 end if;
 if jsonb_typeof(p_rights) is distinct from 'array' or jsonb_array_length(p_rights)=0
    or jsonb_typeof(p_options) is distinct from 'array' or jsonb_array_length(p_options)=0 then
  raise exception 'Rights and license options are required.';
 end if;
 if abs((select coalesce(sum(ownership_percent),0) from jsonb_to_recordset(p_rights) as r(ownership_percent numeric))-100)>0.01 then
  raise exception 'Rights shares must total 100 percent.';
 end if;
 if exists(select 1 from jsonb_to_recordset(p_options) as x(license_type_id uuid,active boolean)
    left join public.license_types l on l.id=x.license_type_id where l.id is null) then
  raise exception 'Known license options are required.';
 end if;
 select email into actor_email from auth.users where id=p_actor_id;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into prior_rights from public.rights_holders r where track_id=p_track_id;
 select coalesce(jsonb_agg(to_jsonb(o)),'[]') into prior_options from public.track_license_options o where track_id=p_track_id;

 -- Match within this locked track only. Exact email+role supports multiple roles
 -- per contact; a unique email on BOTH sides permits an unambiguous role edit.
 -- Existing track_id/approval_status payload fields remain ignored.
 if exists(select 1 from jsonb_array_elements(p_rights) x
   where jsonb_typeof(x) is distinct from 'object' or x ?| array['id','user_id','created_at','updated_at']) then
  raise exception 'Rights identity fields are server controlled.' using errcode='42501';
 end if;
 if exists(select 1 from jsonb_to_recordset(p_rights) as x(email text,role_type text)
   where x.email is null or btrim(x.email)='' or x.role_type is null) or exists(
   select 1 from jsonb_to_recordset(p_rights) as x(email text,role_type text)
   group by x.email,x.role_type having count(*)>1) then
  raise exception 'Rights holders require unambiguous email and role identities.' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_populate_recordset(null::public.rights_holders,prior_rights) h
   where exists(select 1 from jsonb_to_recordset(p_rights) as x(email text,role_type text)
     where x.email=h.email and x.role_type=h.role_type)
   group by h.email,h.role_type having count(*)>1) then
  raise exception 'Existing rights identity is ambiguous; review before saving.' using errcode='22023';
 end if;
 select jsonb_agg(jsonb_build_object('input',x,'prior_id',(
   select h.id from jsonb_populate_recordset(null::public.rights_holders,prior_rights) h
   where h.email=x->>'email' and (h.role_type=x->>'role_type' or (
     (select count(*) from jsonb_populate_recordset(null::public.rights_holders,prior_rights) e where e.email=h.email)=1
     and (select count(*) from jsonb_array_elements(p_rights) e where e->>'email'=h.email)=1))
 ))) into matched_rights from jsonb_array_elements(p_rights) x;
 -- Do not guess which unmatched old row a changed role represents. An entirely
 -- new role may be added only when all old rows for that email are accounted for.
 if exists(select 1 from jsonb_array_elements(matched_rights) x
   where x->>'prior_id' is null and exists(
     select 1 from jsonb_populate_recordset(null::public.rights_holders,prior_rights) h
     where h.email=x->'input'->>'email' and not exists(
       select 1 from jsonb_array_elements(matched_rights) m where m->>'prior_id'=h.id::text))) then
  raise exception 'Rights role change is ambiguous; review before saving.' using errcode='22023';
 end if;

 update public.tracks set title=candidate.title,slug=candidate.slug,description=candidate.description,
 genre=candidate.genre,subgenre=candidate.subgenre,moods=candidate.moods,bpm=candidate.bpm,
 musical_key=candidate.musical_key,duration_seconds=candidate.duration_seconds,
 instrumental=candidate.instrumental,vocals=candidate.vocals,explicit=candidate.explicit,
 lyrics=candidate.lyrics,release_year=candidate.release_year,waveform_path=candidate.waveform_path,
 audio_file_path=candidate.audio_file_path,preview_file_path=candidate.preview_file_path,
 cover_art_path=candidate.cover_art_path,status=candidate.status where id=p_track_id;
 delete from public.rights_holders where track_id=p_track_id;
 insert into public.rights_holders(id,track_id,user_id,name,email,role_type,ownership_percent,approval_status,created_at,updated_at)
 select coalesce(h.id,gen_random_uuid()),p_track_id,h.user_id,r.name,r.email,r.role_type,r.ownership_percent,
   case when h.id is not null and row(h.name,h.email,h.role_type,h.ownership_percent)
     is not distinct from row(r.name,r.email,r.role_type,r.ownership_percent) then h.approval_status
     else (case when r.email=actor_email then 'approved' else 'pending' end)::public.approval_status end,
   coalesce(h.created_at,now()),
   case when h.id is not null and row(h.name,h.email,h.role_type,h.ownership_percent)
     is not distinct from row(r.name,r.email,r.role_type,r.ownership_percent) then h.updated_at else now() end
 from jsonb_array_elements(matched_rights) m
 cross join lateral jsonb_to_record(m->'input') as r(name text,email text,role_type text,ownership_percent numeric)
 left join jsonb_populate_recordset(null::public.rights_holders,prior_rights) h on h.id=(m->>'prior_id')::uuid;
 delete from public.track_license_options where track_id=p_track_id;
 insert into public.track_license_options(track_id,license_type_id,price_cents,active)
 select p_track_id,o.license_type_id,o.price_cents,(o.active and l.active)
 from jsonb_to_recordset(p_options) as o(license_type_id uuid,price_cents integer,active boolean)
 join public.license_types l on l.id=o.license_type_id;
 insert into public.track_audit_log(track_id,actor_id,action,metadata)
 values(p_track_id,p_actor_id,'track_updated',jsonb_build_object('before',to_jsonb(prior),
  'changes',p_values,'previous_rights',prior_rights,'rights',p_rights,'previous_options',prior_options,'options',p_options));
 return p_track_id;
end; $$;
commit;
