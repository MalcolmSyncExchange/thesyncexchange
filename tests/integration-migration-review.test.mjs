import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readdirSync} from 'node:fs';
import {fixtureBootstrapSql,pgliteDigestFixtureSql,adaptMigrationForPGlite,seedDatabase,root,source} from './helpers/artist-baseline-db.mjs';
import {seedDelivery} from './helpers/secure-delivery-fixture.mjs';
const first='20261023000941_authenticated_adverse_financial_evidence.sql',second='20261023001622_verified_provider_fee_bounds.sql';
async function baseline(){
 const db=new PGlite();await db.exec(fixtureBootstrapSql+'\n'+pgliteDigestFixtureSql);
 for(const file of readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')&&f<first).sort())await db.exec(adaptMigrationForPGlite(source('supabase/migrations/'+file)));
 await seedDatabase(db);return db;
}
const publicContracts=async db=>(await db.query("select p.oid,p.proname,p.proowner,p.proacl,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.oid")).rows;
const roleAndStorage=async db=>(await db.query("select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('auth','storage') or tablename='user_profiles' order by schemaname,tablename,policyname")).rows;
const recordState=async db=>(await db.query("select (select jsonb_agg(to_jsonb(t) order by id) from orders t) orders,(select jsonb_agg(to_jsonb(t) order by order_id) from licensing_private.acceptances t) acceptances,(select jsonb_agg(to_jsonb(t) order by id) from generated_licenses t) licenses,(select jsonb_agg(to_jsonb(t) order by id) from order_asset_entitlements t) entitlements,(select to_jsonb(t) from finance_private.capabilities t) flags")).rows[0];

test('IR-MIG-01 additive remediation preserves every public RPC OID/owner/grant/config, Auth/Storage policies and issued evidence',async()=>{
 const db=await baseline();try{
  await seedDelivery(db);const contracts=await publicContracts(db),roles=await roleAndStorage(db),records=await recordState(db);
  for(const file of [first,second])await db.exec(source('supabase/migrations/'+file));
  assert.deepEqual(await publicContracts(db),contracts);assert.deepEqual(await roleAndStorage(db),roles);assert.deepEqual(await recordState(db),records);
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege('"+role+"','finance_private.adverse_provider_summary(text,jsonb)','execute') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select to_regclass('public.analytics_outbox') value")).rows[0].value,null);
 }finally{await db.close();}
});

test('IR-MIG-02 definition drift fails atomically and removes newly attempted helper without changing prior contracts',async()=>{
 const db=await baseline();try{
  const signature='public.ingest_financial_provider_event(uuid,text,text,text,jsonb)';
  const original=(await db.query("select pg_get_functiondef('"+signature+"'::regprocedure) body")).rows[0].body;
  const changed=original.replace("p_summary->>'supported'='true' and (r->>'type'","p_summary->>'supported'='true'  and (r->>'type'");assert.notEqual(changed,original);await db.exec(changed);
  const before=await publicContracts(db),roles=await roleAndStorage(db);
  await assert.rejects(db.exec(source('supabase/migrations/'+first)),/admission contract drift/);await db.exec('rollback');
  assert.equal((await db.query("select to_regprocedure('finance_private.adverse_provider_summary(text,jsonb)') value")).rows[0].value,null);
  assert.deepEqual(await publicContracts(db),before);assert.deepEqual(await roleAndStorage(db),roles);
  assert.equal((await db.query("select pg_get_functiondef('"+signature+"'::regprocedure) body")).rows[0].body,changed);
 }finally{await db.close();}
});

test('IR-MIG-03 out-of-order fee remediation fails without changing existing implementation or grants',async()=>{
 const db=await baseline();try{
  const before=await publicContracts(db);
  await assert.rejects(db.exec(source('supabase/migrations/'+second)),/adverse-evidence remediation required/);await db.exec('rollback');
  assert.deepEqual(await publicContracts(db),before);
  assert.equal((await db.query("select to_regprocedure('finance_private.adverse_provider_summary(text,jsonb)') value")).rows[0].value,null);
 }finally{await db.close();}
});
