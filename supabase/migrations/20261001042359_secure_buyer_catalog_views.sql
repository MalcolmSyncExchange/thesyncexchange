begin;
set local lock_timeout = '3s';
set local statement_timeout = '45s';

do $preflight$
declare
  buyer_options text[];
  rights_options text[];
  buyer_columns text[];
  rights_columns text[];
begin
  if session_user <> 'postgres' or current_user <> 'postgres' or current_role <> 'postgres' then
    raise exception 'secure catalog view migration requires postgres operator' using errcode = '42501';
  end if;

  if to_regnamespace('security_private') is null then
    raise exception 'security_private schema is missing' using errcode = '55000';
  end if;

  select reloptions into buyer_options
  from pg_catalog.pg_class
  where oid = to_regclass('public.buyer_catalog_public');

  select reloptions into rights_options
  from pg_catalog.pg_class
  where oid = to_regclass('public.track_rights_holders_public');

  if buyer_options is distinct from array['security_barrier=true']::text[]
     or rights_options is distinct from array['security_barrier=true']::text[] then
    raise exception 'catalog view option baseline mismatch' using errcode = '55000';
  end if;

  if md5(pg_get_viewdef('public.buyer_catalog_public'::regclass, true)) <> '8c51e230f1191b096930ad577ac9859c'
     or md5(pg_get_viewdef('public.track_rights_holders_public'::regclass, true)) <> '576c47360e1f435346f569e52c97a8fd' then
    raise exception 'catalog view definition baseline mismatch' using errcode = '55000';
  end if;

  select array_agg(attname order by attnum) into buyer_columns
  from pg_catalog.pg_attribute
  where attrelid = 'public.buyer_catalog_public'::regclass
    and attnum > 0 and not attisdropped;

  select array_agg(attname order by attnum) into rights_columns
  from pg_catalog.pg_attribute
  where attrelid = 'public.track_rights_holders_public'::regclass
    and attnum > 0 and not attisdropped;

  if buyer_columns is distinct from array[
    'id','artist_id','artist_name','title','slug','description','genre','subgenre','moods','bpm',
    'musical_key','duration_seconds','instrumental','vocals','explicit','lyrics','release_year',
    'cover_art_path','preview_file_path','waveform_path','featured','created_at','updated_at'
  ]::text[] then
    raise exception 'buyer catalog column baseline mismatch' using errcode = '55000';
  end if;

  if rights_columns is distinct from array[
    'id','track_id','name','role_type','ownership_percent'
  ]::text[] then
    raise exception 'rights holder projection column baseline mismatch' using errcode = '55000';
  end if;

  if not has_table_privilege('authenticated', 'public.buyer_catalog_public', 'select')
     or not has_table_privilege('authenticated', 'public.track_rights_holders_public', 'select')
     or has_table_privilege('anon', 'public.buyer_catalog_public', 'select')
     or has_table_privilege('anon', 'public.track_rights_holders_public', 'select') then
    raise exception 'catalog view grant baseline mismatch' using errcode = '55000';
  end if;

  if to_regprocedure('security_private.buyer_catalog_public_rows()') is not null
     or to_regprocedure('security_private.track_rights_holders_public_rows()') is not null then
    raise exception 'catalog helper function name collision' using errcode = '55000';
  end if;
end;
$preflight$;

create function security_private.buyer_catalog_public_rows()
returns table (
  id uuid,
  artist_id uuid,
  artist_name text,
  title text,
  slug text,
  description text,
  genre text,
  subgenre text,
  moods text[],
  bpm integer,
  musical_key text,
  duration_seconds integer,
  instrumental boolean,
  vocals boolean,
  explicit boolean,
  lyrics text,
  release_year integer,
  cover_art_path text,
  preview_file_path text,
  waveform_path text,
  featured boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    t.id,
    p.id as artist_id,
    p.artist_name,
    t.title,
    t.slug,
    t.description,
    t.genre,
    t.subgenre,
    t.moods,
    t.bpm,
    t.musical_key,
    t.duration_seconds,
    t.instrumental,
    t.vocals,
    t.explicit,
    t.lyrics,
    t.release_year,
    t.cover_art_path,
    t.preview_file_path,
    t.waveform_path,
    t.featured,
    t.created_at,
    t.updated_at
  from public.tracks t
  join public.artist_profiles p on p.user_id = t.artist_user_id
  where t.status = 'approved'::public.track_status
    and exists (
      select 1
      from public.user_profiles viewer
      where viewer.id = auth.uid()
        and viewer.role in ('buyer'::public.user_role, 'admin'::public.user_role)
    );
$function$;

alter function security_private.buyer_catalog_public_rows() owner to postgres;
revoke all on function security_private.buyer_catalog_public_rows() from public, anon, authenticated, service_role;
grant execute on function security_private.buyer_catalog_public_rows() to authenticated, service_role;

create function security_private.track_rights_holders_public_rows()
returns table (
  id uuid,
  track_id uuid,
  name text,
  role_type text,
  ownership_percent numeric(5,2)
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    r.id,
    r.track_id,
    r.name,
    r.role_type,
    r.ownership_percent
  from public.rights_holders r
  join public.tracks t on t.id = r.track_id
  where t.status = 'approved'::public.track_status
    and exists (
      select 1
      from public.user_profiles viewer
      where viewer.id = auth.uid()
        and viewer.role in ('buyer'::public.user_role, 'admin'::public.user_role)
    );
$function$;

alter function security_private.track_rights_holders_public_rows() owner to postgres;
revoke all on function security_private.track_rights_holders_public_rows() from public, anon, authenticated, service_role;
grant execute on function security_private.track_rights_holders_public_rows() to authenticated, service_role;

grant usage on schema security_private to service_role;

create or replace view public.buyer_catalog_public
with (security_barrier = true, security_invoker = true)
as
select * from security_private.buyer_catalog_public_rows();

alter view public.buyer_catalog_public owner to postgres;
revoke all on public.buyer_catalog_public from public, anon, authenticated;
grant select on public.buyer_catalog_public to authenticated, service_role;

create or replace view public.track_rights_holders_public
with (security_barrier = true, security_invoker = true)
as
select
  id,
  track_id,
  name,
  role_type,
  ownership_percent::numeric(5,2) as ownership_percent
from security_private.track_rights_holders_public_rows();

alter view public.track_rights_holders_public owner to postgres;
revoke all on public.track_rights_holders_public from public, anon, authenticated;
grant select on public.track_rights_holders_public to authenticated, service_role;

comment on function security_private.buyer_catalog_public_rows() is
  'Narrow approved-track projection for authenticated canonical buyers and admins. Deliberately owner-context; not exposed through an API schema.';
comment on function security_private.track_rights_holders_public_rows() is
  'Narrow approved-track rights projection for authenticated canonical buyers and admins. Deliberately owner-context; not exposed through an API schema.';
comment on view public.buyer_catalog_public is
  'Security-invoker buyer/admin catalog contract. Base-table access remains private; the private helper returns only approved narrow fields.';
comment on view public.track_rights_holders_public is
  'Security-invoker buyer/admin rights contract without email, account linkage, or review metadata.';

do $postflight$
begin
  if not exists (
       select 1 from unnest((select reloptions from pg_catalog.pg_class where oid = 'public.buyer_catalog_public'::regclass)) option
       where option = 'security_invoker=true'
     )
     or not exists (
       select 1 from unnest((select reloptions from pg_catalog.pg_class where oid = 'public.track_rights_holders_public'::regclass)) option
       where option = 'security_invoker=true'
     ) then
    raise exception 'catalog views are not security invoker' using errcode = '55000';
  end if;

  if has_table_privilege('anon', 'public.buyer_catalog_public', 'select')
     or has_table_privilege('anon', 'public.track_rights_holders_public', 'select')
     or not has_table_privilege('authenticated', 'public.buyer_catalog_public', 'select')
     or not has_table_privilege('authenticated', 'public.track_rights_holders_public', 'select') then
    raise exception 'catalog view postflight grant mismatch' using errcode = '55000';
  end if;
end;
$postflight$;

commit;
