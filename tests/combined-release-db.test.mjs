import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { fixtureBootstrapSql, pgliteDigestFixtureSql, adaptMigrationForPGlite, seedDatabase, asActor, ids } from './helpers/artist-baseline-db.mjs';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const history=JSON.parse(read('docs/posthog-phase2-release/hosted-history.json')).migrations;
const baseline=JSON.parse(read('docs/posthog-phase2-release/outbox-baseline.json'));
const files=['20261011191427_analytics_delivery_reliability.sql','20261011210517_analytics_reporting_index.sql','20261012173855_artist_onboarding_atomic.sql','20261012173856_staging_avatar_storage_readiness.sql'];
async function fixture(){
 const db=new PGlite();await db.exec(`${fixtureBootstrapSql}\n${pgliteDigestFixtureSql}`);
 for(const row of history)await db.exec(adaptMigrationForPGlite(read(`supabase/migrations/${row.name}.sql`)));
 await seedDatabase(db);
 await db.exec(`create table auth.identities(id uuid primary key,user_id uuid references auth.users(id),provider text);insert into auth.identities select id,id,'email' from auth.users;update user_profiles set onboarding_step='basics',onboarding_payload='{"fixture":"saved progress"}'::jsonb where role='artist';create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
 for(const row of history)await db.query('insert into supabase_migrations.schema_migrations values($1,$2,array[$3::text])',[row.version,row.name,read(`supabase/migrations/${row.name}.sql`)]);
 for(const [i,row]of baseline.rows.entries())await db.query("insert into analytics_outbox(id,dedupe_key,environment,event,actor_id,actor_role,properties,is_test,is_internal,occurred_at,delivered_at,lease_id) values($1,$2,'preview','onboarding_started',$3,'artist',$4,true,false,$5,$6,$7)",[row.id,`fixture-${i}`,ids.a,JSON.stringify({fixture:i}),row.occurred_at,row.delivered_at,row.lease_id]);
 const hashes=(await db.query(`select id,encode(extensions.digest((${baseline.fingerprintExpression})::text,'sha256'),'hex') as hash from analytics_outbox o`)).rows;
 const packs=['reliability','reporting-index'].map(label=>{let sql=read(`docs/posthog-phase2-release/${label}-execution.sql`);for(const row of baseline.rows)sql=sql.replaceAll(row.row_sha256,hashes.find(r=>r.id===row.id).hash);return sql;});
 return {db,sql:[...packs,...files.slice(2).map(f=>read(`supabase/migrations/${f}`))]};
}
async function snapshot(db){
 const tables=['auth.users','auth.identities','public.user_profiles','public.artist_profiles'];const data={};
 for(const table of tables)data[table]=(await db.query(`select to_jsonb(t) as row from ${table} t order by id`)).rows;
 data.outbox=(await db.query("select to_jsonb(o)-array['delivery_status','attempt_count','delivery_cycle','last_attempt_at','next_retry_at','failure_category'] as row from analytics_outbox o order by id")).rows;
 return data;
}
async function apply(db,sql,i){await db.exec(sql);if(i>=2)await db.query('insert into supabase_migrations.schema_migrations values($1,$2,array[$3::text])',[files[i].split('_')[0],files[i].slice(0,-4),read(`supabase/migrations/${files[i]}`)]);}
test('all four release migrations preserve Auth identities, canonical profiles, artist data and every delivered row',async()=>{
 const {db,sql}=await fixture();try{
  const before=await snapshot(db);
  for(let i=0;i<sql.length;i++){await apply(db,sql[i],i);assert.deepEqual(await snapshot(db),before);}
  assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,38);
  assert.ok((await db.query('select delivery_status,attempt_count,delivery_cycle from analytics_outbox')).rows.every(r=>r.delivery_status==='delivered'&&r.attempt_count===0&&r.delivery_cycle===0));
  const funcs=(await db.query("select proname,prosecdef,has_function_privilege('authenticated',oid,'EXECUTE') allowed from pg_proc where proname in ('save_artist_onboarding_atomic','complete_artist_onboarding_atomic','complete_analytics_event','fail_analytics_event')")).rows;
  assert.equal(funcs.length,4);assert.ok(funcs.every(r=>!r.prosecdef&&!r.allowed));
  await asActor(db,ids.a,async()=>{
   await assert.rejects(db.query("select save_artist_onboarding_atomic($1,now(),'basics','{}')",[ids.a]),e=>e.code==='42501');
   await assert.rejects(db.query("update user_profiles set onboarding_completed_at=now() where id=$1",[ids.a]),e=>e.code==='42501');
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('avatars',$1)",[`${ids.a}/profile/1234567890123-11111111-1111-4111-8111-111111111111.jpg`]),e=>e.code==='42501');
  });
  assert.deepEqual(await snapshot(db),before);
  assert.equal((await db.query("select count(*)::int n from pg_policies where schemaname='storage' and policyname in ('Avatar uploads require server validation','Avatars require a new object path','Active artist avatars cannot be deleted') and permissive='RESTRICTIVE'")).rows[0].n,3);
 }finally{await db.close();}
});
for(let index=0;index<4;index++)test(`${files[index]} rolls back an injected late failure without losing prior committed migrations or data`,async()=>{
 const {db,sql}=await fixture();try{
  for(let i=0;i<index;i++)await apply(db,sql[i],i);
  const before=await snapshot(db);const definitions=(await db.query("select proname,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','security_private') order by p.oid")).rows;
  const policies=(await db.query("select * from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname")).rows;
  const count=(await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n;
  const broken=sql[index].replace(/commit;\s*$/,'select 1/0;\ncommit;\n');assert.notEqual(broken,sql[index]);
  await assert.rejects(db.exec(broken),/division by zero/);await db.exec('rollback');
  assert.deepEqual(await snapshot(db),before);assert.deepEqual((await db.query("select proname,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','security_private') order by p.oid")).rows,definitions);
  assert.deepEqual((await db.query("select * from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname")).rows,policies);
  assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,count);
  await apply(db,sql[index],index);assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});
