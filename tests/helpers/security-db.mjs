import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.SECURITY_PGLITE_MODULE || '@electric-sql/pglite');
export const artist = '11111111-1111-4111-8111-111111111111';
export const other = '22222222-2222-4222-8222-222222222222';
export const admin = '33333333-3333-4333-8333-333333333333';
export const track = '44444444-4444-4444-8444-444444444444';
export const draft = '55555555-5555-4555-8555-555555555555';
export const mediaPath = `${artist}/uploads/audio/reviewed.wav`;
export const source = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
export async function database({ storagePolicies = 'legacy' } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
    create table public.user_profiles(id uuid primary key, role text);
    create function public.current_app_role() returns text language sql stable security definer set search_path='' as $$ select role from public.user_profiles where id=auth.uid() $$;
    create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_profiles where id=auth.uid() and role='admin') $$;
    create table public.tracks(id uuid primary key, artist_user_id uuid not null, status text not null, approved_at timestamptz, approved_by uuid, featured boolean default false, audio_file_path text, preview_file_path text, waveform_path text, cover_art_path text);
    create table public.rights_holders(id uuid primary key default gen_random_uuid(), track_id uuid references public.tracks(id) on delete cascade, name text, ownership_percent numeric check(ownership_percent > 0 and ownership_percent <= 100), approval_status text default 'pending');
    create table storage.objects(bucket_id text, name text, metadata jsonb, version text, primary key(bucket_id,name));
    alter table storage.objects enable row level security;
    alter table public.tracks enable row level security;
    alter table public.rights_holders enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant select,insert,update,delete on all tables in schema public,storage to authenticated,service_role;
    grant select,insert,update,delete on storage.objects to anon;
    insert into public.user_profiles values ('${artist}','artist'),('${other}','artist'),('${admin}','admin');
    select set_config('request.jwt.claim.role','service_role',false);
  `);
  const foundation = source('supabase/migrations/0008_database_foundation.sql');
  for (const name of ['Tracks are readable by approved buyers, owners, or admins','Artists can insert their own tracks','Artists and admins can update owned tracks','Artists and admins can delete owned tracks','Rights holders are readable by track owners or admins','Rights holders are writable by track owners or admins']) {
    const start = foundation.indexOf(`create policy "${name}"`);
    if(start < 0) throw Error(name);
    await db.exec(foundation.slice(start, foundation.indexOf(';',start)+1));
  }
  if (storagePolicies === 'legacy') await db.exec(source('supabase/storage-policies.sql'));
  else if (storagePolicies !== 'none') throw new Error('Unknown Storage policy fixture');
  await db.exec(source('supabase/migrations/0018_lock_down_track_moderation_fields.sql'));
  await db.exec(`
    insert into public.tracks(id,artist_user_id,status,audio_file_path) values ('${track}','${artist}','draft','${mediaPath}'),('${draft}','${artist}','draft',null);
    insert into public.rights_holders(track_id,name,ownership_percent) values('${track}','Reviewed owner',100),('${draft}','Draft owner',100);
    update public.tracks set status='approved' where id='${track}';
    insert into storage.objects(bucket_id,name,metadata) values('track-audio','${mediaPath}','{"version":"reviewed"}');
  `);
  return db;
}
export async function asActor(db, id, run, role='authenticated') {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub','${id}',false); select set_config('request.jwt.claim.role','${role}',false);`);
  try { return await run(); }
  finally { await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false);"); }
}
