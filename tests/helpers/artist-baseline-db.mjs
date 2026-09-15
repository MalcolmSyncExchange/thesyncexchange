import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
export const root = new URL('../../', import.meta.url);
export const source = path => readFileSync(new URL(path, root), 'utf8');
export const snapshot = name => JSON.parse(source(`tests/fixtures/artist-baseline/${name}.json`));
export const ids = { a:'11111111-1111-4111-8111-111111111111', b:'22222222-2222-4222-8222-222222222222', buyer:'33333333-3333-4333-8333-333333333333', admin:'44444444-4444-4444-8444-444444444444', draft:'55555555-5555-4555-8555-555555555555', live:'66666666-6666-4666-8666-666666666666', otherTrack:'77777777-7777-4777-8777-777777777777', order:'88888888-8888-4888-8888-888888888888', license:'99999999-9999-4999-8999-999999999999' };
export const quote = x => `'${String(x).replaceAll("'","''")}'`;
export const ident = x => `"${String(x).replaceAll('"','""')}"`;
// No URL option exists: fixtures always run inside a new in-memory PostgreSQL instance.
export async function database(target='repository', {seed=true}={}) {
 if (!['repository','production','staging'].includes(target)) throw Error('Unknown captured baseline');
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create schema storage;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
   create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
   create table storage.buckets(id text primary key,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,version text,owner uuid,owner_id text,unique(bucket_id,name));
   grant usage on schema public,auth,storage to anon,authenticated,service_role;
   alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
   grant all on all tables in schema storage to anon,authenticated,service_role;
   select set_config('request.jwt.claim.role','service_role',false);`);
  for(const file of readdirSync(new URL('supabase/migrations/',root)).filter(x=>x.endsWith('.sql')).sort()) {
   // Only extension installation is adapted; gen_random_uuid is native in this runtime.
   const sql=source(`supabase/migrations/${file}`).replace(/create extension if not exists "pgcrypto";/gi,'');
   try { await db.exec(sql); } catch(error) { throw Error(`Repository migration ${file}: ${error.message}`,{cause:error}); }
  }
  if(target!=='repository') await applyCapturedAuthorization(db,snapshot(target));
  if(seed) await seedDatabase(db);
  return db;
 } catch(error) { await db.close(); throw error; }
}
export async function applyCapturedAuthorization(db,s) {
 // Live policy/function/grant replay on repository domain tables; structural drift is compared separately.
 for(const p of (await db.query("select * from pg_policies where schemaname in ('public','storage')")).rows)
  await db.exec(`drop policy ${ident(p.policyname)} on ${ident(p.schemaname)}.${ident(p.tablename)}`);
 for(const t of (await db.query("select n.nspname,c.relname,t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','auth','storage')")).rows)
  await db.exec(`drop trigger ${ident(t.tgname)} on ${ident(t.nspname)}.${ident(t.relname)}`);
 await db.exec('create schema if not exists security_private');
 const rank=f=>f.name==='track_asset_object_names'?-2:f.name==='is_referenced_track_asset'?-1:0;
 for(const f of [...s.functions].sort((a,b)=>rank(a)-rank(b))) await db.exec(f.definition);
 for(const t of s.triggers.filter(t=>t.schema!=='storage'||t.name==='guard_referenced_media_version')) await db.exec(t.definition);
 for(const p of s.policies) await db.exec(`create policy ${ident(p.name)} on ${ident(p.schema)}.${ident(p.table)} as ${p.permissive} for ${p.command} to ${p.roles.map(ident).join(',')}${p.using?` using (${p.using})`:''}${p.check?` with check (${p.check})`:''}`);
 for(const t of s.tables.filter(t=>['public','rate_limit_private'].includes(t.schema)&&['r','p'].includes(t.kind)))
  await db.exec(`alter table ${ident(t.schema)}.${ident(t.name)} ${t.rls?'enable':'disable'} row level security`);
 for(const t of (await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','storage','rate_limit_private')")).rows)
  await db.exec(`revoke all on ${ident(t.schemaname)}.${ident(t.tablename)} from anon,authenticated,service_role`);
 for(const g of s.grants.filter(g=>['anon','authenticated','service_role'].includes(g.grantee)&&(g.schema!=='storage'||['objects','buckets'].includes(g.table))))
  await db.exec(`grant ${g.privilege} on ${ident(g.schema)}.${ident(g.table)} to ${ident(g.grantee)}`);
}
export async function asActor(db,id,run,role='authenticated') {
 if(!['authenticated','anon','service_role'].includes(role)) throw Error('Unknown fixture role');
 await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub',${quote(id||'')},false); select set_config('request.jwt.claim.role',${quote(role)},false)`);
 try { return await run(); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','service_role',false)"); }
}
export async function seedDatabase(db) {
 for(const [key,role] of [['a','artist'],['b','artist'],['buyer','buyer'],['admin','admin']])
  await db.exec(`insert into auth.users(id,email) values('${ids[key]}','${key}@fixture.invalid'); insert into user_profiles(id,email,role,full_name) values('${ids[key]}','${key}@fixture.invalid','${role}','Fixture ${key}')`);
 for(const key of ['a','b']) await db.exec(`insert into artist_profiles(user_id,artist_name,bio,payout_email) values('${ids[key]}','Artist ${key}','Public bio','private-${key}@fixture.invalid')`);
 await db.exec(`insert into buyer_profiles(user_id,company_name,industry_type,buyer_type,billing_email) values('${ids.buyer}','Fixture Buyer','Film','Supervisor','buyer@fixture.invalid'); update license_types set id='${ids.license}',default_price_cents=5000 where slug='digital-campaign'`);
 await db.exec(`insert into storage.objects(bucket_id,name,metadata,version) values('track-audio','${ids.a}/uploads/audio/live.wav','{"size":100}','v1')`);
 for(const [key,owner] of [['draft','a'],['live','a'],['otherTrack','b']]) await db.exec(`insert into tracks(id,artist_user_id,title,slug,genre,subgenre,bpm,musical_key,duration_seconds,release_year,audio_file_path,preview_file_path) values('${ids[key]}','${ids[owner]}','${key}','${key}','Electronic','Ambient',100,'C',120,2026,'${ids[owner]}/uploads/audio/${key}.wav','${ids[owner]}/uploads/previews/${key}.mp3'); insert into rights_holders(track_id,name,email,role_type,ownership_percent) values('${ids[key]}','Fixture rights holder','private-rights@fixture.invalid','owner',100); insert into track_license_options(track_id,license_type_id,price_cents,active) values('${ids[key]}','${ids.license}',5000,true)`);
 await db.exec(`update tracks set status='approved' where id='${ids.live}'`);
}
