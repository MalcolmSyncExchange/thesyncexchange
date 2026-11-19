import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {uploadsFixture} from './helpers/music-uploads-fixture.mjs';

const target=JSON.parse(await readFile(new URL('../docs/audio-reconstruction/production-schema-evidence.json',import.meta.url),'utf8'));
const migration=await readFile(new URL('../supabase/migrations/20261118022453_automatic_audio_preview_and_waveform.sql',import.meta.url),'utf8');
const rollback=await readFile(new URL('../docs/audio-reconstruction/production-rollback.sql',import.meta.url),'utf8');
const original=target.functions.find(f=>f.schema==='public'&&f.name==='media_request_preview');

test('captured production baseline matches before the additive draft migration and the exact migration preserves records',async()=>{
 const db=await uploadsFixture({throughMigration:'20261119004313_digitalocean_november_20usd_ceiling.sql'});try{
  const local=(await db.query("select table_schema,table_name,column_name,udt_name from information_schema.columns where table_schema='submission_media' and table_name in ('submissions','assets','jobs','operations','capabilities','master_reviews')")).rows;
  for(const c of local){const actual=target.columns.find(t=>t.schema===c.table_schema&&t.table===c.table_name&&t.name===c.column_name);assert.ok(actual,`${c.table_name}.${c.column_name} missing`);assert.equal(actual.type,c.udt_name);}
  for(const name of ['lock_owned','begin_operation','finish_operation','bump','require_capability','require_actor','check_region','append_event','complete_job','claim_job'])assert.ok(target.functions.some(f=>f.schema==='submission_media'&&f.name===name),name);
  assert.equal(target.functions.some(f=>f.name==='marketplace_waveform_locator'||f.name==='queue_default_preview'),false);
  assert.equal(original.owner,'postgres');
  const before=(await db.query('select to_jsonb(s) v from submission_media.submissions s order by id')).rows;
  await db.exec(await readFile(new URL('../supabase/migrations/20261119005330_recoverable_artist_draft_deletion.sql',import.meta.url),'utf8'));
  const added=(await db.query("select udt_name,is_nullable from information_schema.columns where table_schema='submission_media' and table_name='submissions' and column_name='deleted_at'")).rows[0];
  assert.deepEqual(added,{udt_name:'timestamptz',is_nullable:'YES'});
  assert.deepEqual((await db.query("select to_jsonb(s)-'deleted_at' v from submission_media.submissions s order by id")).rows,before);
  for(const role of ['anon','service_role','media_broker_do_login'])assert.equal((await db.query("select has_function_privilege($1,'public.media_submission_delete(uuid,bigint)','EXECUTE') v",[role])).rows[0].v,false);
 }finally{await db.close();}
});

test('captured production preview function survives candidate migration and target rollback with ACL and state unchanged',async()=>{
 const db=await uploadsFixture();try{
  await db.exec(rollback);
  await db.exec('update submission_media.capabilities set worker_enabled=false,activation_enabled=false');
  const signature="'public.media_request_preview(uuid,bigint,uuid)'::regprocedure";
  const inspect=async()=>(await db.query(`select pg_get_functiondef(${signature}) as definition,proacl::text as acl,pg_get_userbyid(proowner) as owner from pg_proc where oid=${signature}`)).rows[0];
  const before=await inspect();
  assert.equal(before.definition,original.definition);
  const counts=async()=>(await db.query('select (select count(*) from submission_media.jobs) jobs,(select count(*) from submission_media.assets) assets,(select to_jsonb(c) from submission_media.capabilities c) caps')).rows[0];
  const records=await counts();
  await db.exec(migration);
  assert.ok((await db.query("select to_regprocedure('public.marketplace_waveform_locator(uuid,uuid,uuid)')::text n")).rows[0].n);
  assert.deepEqual(await counts(),records);
  await db.exec(rollback);
  assert.deepEqual(await inspect(),before);
  assert.deepEqual(await counts(),records);
  assert.equal((await db.query("select to_regprocedure('public.marketplace_waveform_locator(uuid,uuid,uuid)')::text n")).rows[0].n,null);
 }finally{await db.close();}
});
