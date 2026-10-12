// Local only: pinned, already-cached Supabase image; no network, published ports,
// host volumes, credentials, hosted URL, or external configuration accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readdirSync} from 'node:fs';
import {source,root,seedDatabase,ids} from './helpers/artist-baseline-db.mjs';

const image='public.ecr.aws/supabase/postgres@sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb';
const excluded=new Set(['20260915072720_analytics_purchase_outbox.sql','20261010060000_analytics_verified_purchase_evidence.sql']);
const manifest=JSON.parse(source('docs/security-pr2/migration-manifest.json')).order;
const bootstrap=`
  create role postgres login createdb createrole bypassrls;
  create role anon; create role authenticated; create role service_role bypassrls;
  create role supabase_storage_admin noinherit; create role supabase_auth_admin noinherit;
  grant anon,authenticated,service_role to postgres;
  grant pg_monitor to postgres;
  grant create on database postgres to postgres;
  grant usage,create on schema public to postgres;
  create schema extensions;
  create extension pgcrypto with schema extensions;
  grant usage on schema extensions to postgres,anon,authenticated,service_role;
  create schema auth authorization supabase_auth_admin;
  set role supabase_auth_admin;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
  create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),'')) $$;
  grant usage on schema auth to postgres,anon,authenticated,service_role;
  grant all on all tables in schema auth to postgres;
  reset role;
  create schema storage authorization supabase_storage_admin;
  set role supabase_storage_admin;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  create table storage.buckets(id text primary key,name text not null,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,version text,owner uuid,owner_id text,unique(bucket_id,name));
  alter table storage.objects enable row level security;
  alter table storage.buckets enable row level security;
  grant usage on schema storage to postgres,anon,authenticated,service_role;
  grant all on all tables in schema storage to postgres with grant option;
  grant all on all tables in schema storage to anon,authenticated,service_role;
  reset role;
  set role postgres;
  alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
`;

function docker(args,input='') {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err='';
    child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);
    child.on('close',code=>code===0?resolve(out.trim()):reject(Error(`Local Docker command failed (${code}): ${err}`)));
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}

async function withManagedDatabase(run) {
  const name=`tse-managed-storage-${randomUUID()}`;let owned=false;
  const asRole=(role,text)=>docker(['exec','-i',name,'psql','-h','/tmp','-d','postgres','-U',role,'-X','-qAt','-v','ON_ERROR_STOP=1'],text);
  const sql=text=>asRole('postgres',text);
  const policyGrants=JSON.stringify({postgres:['auth.users','storage.objects','storage.buckets']});
  try {
    // These are the real Supabase extension grants observed read-only on the
    // target, restricted to tables this baseline uses. No SQL ownership shim.
    await docker(['run','--rm','--detach','--pull','never','--network','none','--name',name,
      '--user','postgres','--tmpfs','/tmp:rw,mode=1777','--entrypoint','sh',image,'-c',
      'initdb -D /tmp/managed-pg -U supabase_admin --auth=trust >/dev/null && exec postgres -D /tmp/managed-pg -c listen_addresses= -c unix_socket_directories=/tmp -c shared_preload_libraries=supautils -c dynamic_library_path=/nix/var/nix/profiles/default/lib "$@"',
      'managed-postgres','-c','supautils.superuser=supabase_admin',
      '-c',`supautils.policy_grants=${policyGrants}`,'-c',`supautils.drop_trigger_grants=${policyGrants}`]);owned=true;
    let ready=false;
    for(let i=0;i<100;i++) {
      try {await asRole('supabase_admin','select 1');ready=true;break;}catch {await new Promise(r=>setTimeout(r,100));}
    }
    assert.ok(ready,'Disposable Supabase PostgreSQL did not start');
    await asRole('supabase_admin',bootstrap);
    await run(sql,asRole);
  } finally {if(owned)await docker(['rm','--force',name]);}
}

const ownershipSql=`select json_build_object(
  'actor',current_user,'superuser',(select rolsuper from pg_roles where rolname=current_user),
  'membership',pg_has_role('postgres','supabase_storage_admin','MEMBER'),
  'owners',(select json_agg(pg_get_userbyid(relowner) order by relname) from pg_class where oid in ('storage.objects'::regclass,'storage.buckets'::regclass)),
  'rls',(select bool_and(relrowsecurity) from pg_class where oid in ('storage.objects'::regclass,'storage.buckets'::regclass)),
  'supautils',current_setting('shared_preload_libraries'),
  'policy_grants',current_setting('supautils.policy_grants')::jsonb->'postgres');`;

async function assertOwnership(sql) {
  assert.deepEqual(JSON.parse(await sql(ownershipSql)),{
    actor:'postgres',superuser:false,membership:false,
    owners:['supabase_storage_admin','supabase_storage_admin'],rls:true,
    supautils:'supautils',policy_grants:['auth.users','storage.objects','storage.buckets']
  });
  await assert.rejects(sql('alter table storage.objects enable row level security;'),/must be owner/);
  // Merely lacking ownership must not be confused with lacking policy grants.
  await sql('begin; create policy managed_probe on storage.objects for select using(false); alter policy managed_probe on storage.objects using(false); drop policy managed_probe on storage.objects; rollback;');
}

for(const mode of ['fresh','resume']) test(`managed Storage ${mode}: full non-analytics baseline, unchanged ownership, real policy permissions`,{timeout:90000},async t=>{
  assert.equal(manifest.length,31);
  const all=readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort();
  assert.ok(manifest.every(m=>all.includes(m.file)));
  assert.deepEqual(all.filter(f=>!manifest.some(m=>m.file===f)),['20260915072720_analytics_purchase_outbox.sql','20261010060000_analytics_verified_purchase_evidence.sql','20261011004710_sec_payment_readiness.sql','20261011191427_analytics_delivery_reliability.sql','20261011210517_analytics_reporting_index.sql','20261012173855_artist_onboarding_atomic.sql','20261012173856_staging_avatar_storage_readiness.sql']);
  await withManagedDatabase(async sql=>{
    await assertOwnership(sql);
    const ledger=[];
    for(let index=0;index<manifest.length;index++) {
      const m=manifest[index],query=source(`supabase/migrations/${m.file}`);
      assert.equal(createHash('sha256').update(query).digest('hex'),m.sha256,m.file);
      if(index===11&&mode==='resume') {
        // Reproduce the hosted failure after exactly 11 successful migrations.
        const original='alter table storage.objects enable row level security;\n\n'+query.slice(query.indexOf('drop policy'));
        await assert.rejects(sql(original),/must be owner/);
        assert.equal(ledger.length,11);
        assert.equal(await sql("select count(*) from pg_policies where schemaname='storage'"),'0');
        await assertOwnership(sql);
      }
      await sql(query); // Run unchanged source as non-superuser postgres.
      ledger.push(m.file);
      await assertOwnershipStateOnly(sql);
    }
    assert.equal(ledger.length,31);
    assert.equal(await sql("select count(*) from pg_policies where schemaname='storage' and tablename='objects'"),'6');
    assert.equal(await sql("select count(*) from pg_policies where schemaname='storage' and permissive='RESTRICTIVE'"),'4');
    assert.deepEqual(JSON.parse(await sql(`select json_build_object(
      'objects',(select count(*) from storage.objects),'users',(select count(*) from auth.users),
      'tracks',(select count(*) from tracks),'orders',(select count(*) from orders),
      'analytics',to_regclass('public.analytics_outbox') is not null,
      'analytics_rpcs',(select count(*) from pg_proc where proname like '%analytics%'),
      'gate_d',to_regprocedure('public.gate_d_prepare_checkout(uuid,uuid,bigint,text)') is not null);`)),
      {objects:0,users:0,tracks:0,orders:0,analytics:false,analytics_rpcs:0,gate_d:true});
    t.diagnostic(`${mode}: all 31 migrations; managed owners/RLS unchanged after each migration; 6 Storage policies; no analytics or marketplace data`);
    await verifyStorageAuthorization(sql);
  });
});

async function assertOwnershipStateOnly(sql) {
  const state=JSON.parse(await sql(ownershipSql));
  assert.equal(state.superuser,false);assert.equal(state.membership,false);
  assert.deepEqual(state.owners,['supabase_storage_admin','supabase_storage_admin']);assert.equal(state.rls,true);
}

async function verifyStorageAuthorization(sql) {
  // Synthetic SQL rows exist only in the disposable container, after replay.
  const seed=[];await seedDatabase({exec:async statement=>seed.push(statement+';')});
  await sql(["select set_config('request.jwt.claim.role','service_role',false);",...seed].join('\n'));
  const ownAvatar=`${ids.a}/profile/1770000000000-33333333-3333-4333-8333-333333333333.png`;
  await sql(`insert into storage.objects(bucket_id,name) values('avatars','${ownAvatar}');`);
  for(const bucket of ['cover-art','track-previews','agreements','purchase-assets','order-receipts'])
    await sql(`insert into storage.objects(bucket_id,name,version) values('${bucket}','${ids.a}/private-fixture','v1')`);
  const actor=(role,id,query)=>sql(`begin; set local role ${role};
    select set_config('request.jwt.claim.sub','${id}',true);
    select set_config('request.jwt.claim.role','${role}',true); ${query}; rollback;`).then(out=>out.split('\n').at(-1));
  for(const [role,id] of [['anon',''],['authenticated',ids.a],['authenticated',ids.buyer],['authenticated',ids.admin]]) {
    for(const bucket of ['avatars','cover-art','track-previews','track-audio','agreements','purchase-assets','order-receipts'])
      await assert.rejects(actor(role,id,`insert into storage.objects(bucket_id,name) values('${bucket}','${ids.a}/untrusted')`),/row-level security/);
    assert.equal(await actor(role,id,"select count(*) from storage.objects where bucket_id in ('track-audio','agreements','purchase-assets','order-receipts')"),'0');
    assert.equal(await actor(role,id,"with removed as (delete from storage.objects where bucket_id in ('track-audio','agreements','purchase-assets','order-receipts') returning id) select count(*) from removed"),'0');
    assert.equal(await actor(role,id,"with changed as (update storage.objects set version='forged' returning id) select count(*) from changed"),'0');
  }
  assert.equal(await actor('authenticated',ids.a,`select count(*) from storage.objects where name='${ownAvatar}'`),'1');
  for(const id of [ids.b,ids.buyer,ids.admin])
    assert.equal(await actor('authenticated',id,`with removed as (delete from storage.objects where name='${ownAvatar}' returning id) select count(*) from removed`),'0');
  assert.equal(await actor('authenticated',ids.a,`with removed as (delete from storage.objects where name='${ownAvatar}' returning id) select count(*) from removed`),'1');
  await assert.rejects(actor('service_role','',`update storage.objects set version='forged' where name='${ids.a}/uploads/audio/live.wav'`),/Referenced track media/);
  await assert.rejects(actor('service_role','',`delete from storage.objects where name='${ids.a}/uploads/audio/live.wav'`),/Referenced track media/);
  await assert.rejects(actor('service_role','',"update storage.buckets set public=true where id='purchase-assets'"),/must remain private/);
  await actor('service_role','',`insert into storage.objects(bucket_id,name,version) values('track-audio','${ids.a}/uploads/audio/fresh.wav','v1')`);
}

test('combined release: four exact migrations preserve existing data under managed Storage ownership', {timeout:90000},async t=>{
 await withManagedDatabase(async(sql,asRole)=>{
  await assertOwnership(sql);
  const history=JSON.parse(source('docs/posthog-phase2-release/hosted-history.json')).migrations;
  for(const row of history)await sql(source(`supabase/migrations/${row.name}.sql`));
  const trusted=text=>sql("select set_config('request.jwt.claim.role','service_role',false);"+text);
  await seedDatabase({exec:trusted});
  await asRole('supabase_admin',"set role supabase_auth_admin;create table auth.identities(id uuid primary key,user_id uuid references auth.users(id),provider text);grant all on auth.identities to postgres;");
  await trusted("insert into auth.identities select id,id,'email' from auth.users;update user_profiles set onboarding_step='basics',onboarding_payload='{\"fixture\":\"saved progress\"}' where role='artist';");
  for(let i=0;i<5;i++)await trusted(`insert into analytics_outbox(dedupe_key,environment,event,actor_id,actor_role,properties,is_test,is_internal,delivered_at) values('combined-${i}','preview','signup_completed','${ids.a}','artist','{}',true,false,now());`);
  const snapshot=()=>sql("select json_build_object('users',(select json_agg(to_jsonb(p) order by id) from auth.users p),'identities',(select json_agg(to_jsonb(p) order by id) from auth.identities p),'profiles',(select json_agg(to_jsonb(p) order by id) from user_profiles p),'artists',(select json_agg(to_jsonb(p) order by id) from artist_profiles p),'outbox',(select json_agg(to_jsonb(p)-array['delivery_status','attempt_count','delivery_cycle','last_attempt_at','next_retry_at','failure_category'] order by id) from analytics_outbox p))");
  const before=await snapshot();
  const files=['20261011191427_analytics_delivery_reliability.sql','20261011210517_analytics_reporting_index.sql','20261012173855_artist_onboarding_atomic.sql','20261012173856_staging_avatar_storage_readiness.sql'];
  for(const file of files){
   const raw=source(`supabase/migrations/${file}`);
   const wrapped=raw.trimStart().startsWith('begin;')?raw:`begin;set local lock_timeout='3s';set local statement_timeout='30s';${raw}\ncommit;`;
   await assert.rejects(sql(wrapped.replace(/commit;\s*$/,'select 1/0;commit;')),/division by zero/);
   assert.equal(await snapshot(),before);
   await sql(wrapped);assert.equal(await snapshot(),before);await assertOwnershipStateOnly(sql);
   t.diagnostic(`${file}: rollback and exact data preservation passed`);
  }
  assert.equal(await sql("select count(*) from analytics_outbox where delivery_status='delivered' and attempt_count=0 and delivery_cycle=0"),'5');
  assert.equal(await sql("select count(*) from pg_policies where schemaname='storage' and permissive='RESTRICTIVE'"),'7');
  await assert.rejects(sql(`set role authenticated;select set_config('request.jwt.claim.role','authenticated',false);select set_config('request.jwt.claim.sub','${ids.a}',false);select complete_artist_onboarding_atomic('${ids.a}',now());`),/permission denied/);
  await assert.rejects(sql(`set role authenticated;select set_config('request.jwt.claim.role','authenticated',false);select set_config('request.jwt.claim.sub','${ids.a}',false);insert into storage.objects(bucket_id,name) values('avatars','${ids.a}/profile/untrusted.jpg');`),/row-level security/);
  assert.equal(await snapshot(),before);t.diagnostic('service-only RPC and restrictive avatar write boundaries preserved');
 });
});
