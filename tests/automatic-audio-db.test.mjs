import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { uploadsFixture, create, reserve, observed, completeNext, artist, worker, revision } from './helpers/music-uploads-fixture.mjs';
const fresh=async fn=>{const db=await uploadsFixture();try{await fn(db);}finally{await db.close();}};
test('validated upload schedules waveform then default preview without artist request; acceptance stays explicit',()=>fresh(async db=>{
  const s=await create(db), m=await reserve(db,s);await observed(db,s,m.asset_id);
  await completeNext(db);await completeNext(db);
  const rows=(await db.query("select job_type,state from submission_media.jobs where submission_id=$1 order by created_at",[s])).rows;
  assert.deepEqual(rows.map(r=>r.job_type),['source_validation','waveform_generation','preview_generation']);
  const p=(await db.query("select * from submission_media.assets where submission_id=$1 and kind='buyer_preview'",[s])).rows[0];
  assert.equal(Number(p.region_start_ms),0);assert.equal(Number(p.region_end_ms),30000);assert.equal(p.accepted_at,null);
  await completeNext(db);
  const state=(await db.query('select accepted_preview_id,current_preview_id,current_review_id from submission_media.submissions where id=$1',[s])).rows[0];
  assert.deepEqual(state,{accepted_preview_id:null,current_preview_id:null,current_review_id:null});
  assert.equal((await db.query('select count(*) n from submission_media.master_reviews where submission_id=$1',[s])).rows[0].n,0);
  const again=await artist(db,'media_request_preview',[s,await revision(db,s),randomUUID()]);assert.equal(again.asset_id,p.id);
  assert.equal((await db.query("select count(*) n from submission_media.assets where submission_id=$1 and kind='buyer_preview'",[s])).rows[0].n,1);
}));
test('automatic default respects an explicitly selected preview',()=>fresh(async db=>{
  const s=await create(db),m=await reserve(db,s);await observed(db,s,m.asset_id);await completeNext(db);
  await artist(db,'media_select_preview_region',[s,m.asset_id,1000,20000,await revision(db,s),randomUUID()]);
  await completeNext(db);const p=(await db.query("select region_start_ms,region_end_ms from submission_media.assets where submission_id=$1 and kind='buyer_preview'",[s])).rows[0];
  assert.equal(Number(p.region_start_ms),1000);assert.equal(Number(p.region_end_ms),20000);
}));
test('stale source waveform cannot schedule a preview for a replaced master',()=>fresh(async db=>{
  const s2=await create(db),old=await reserve(db,s2);await observed(db,s2,old.asset_id);await completeNext(db);await reserve(db,s2);
  await completeNext(db);
  assert.equal((await db.query("select count(*) n from submission_media.assets where source_asset_id=$1 and kind='buyer_preview'",[old.asset_id])).rows[0].n,0);
}));
test('transient preview failure keeps existing bounded retry budget and does not create another output',()=>fresh(async db=>{
  const s=await create(db),m=await reserve(db,s);await observed(db,s,m.asset_id);await completeNext(db);await completeNext(db);
  await completeNext(db,{error:'temporary_system_error'});
  const j=(await db.query("select state,attempt,max_attempts from submission_media.jobs where submission_id=$1 and job_type='preview_generation'",[s])).rows[0];
  assert.equal(j.state,'retry_wait');assert.equal(j.attempt,1);assert.equal(j.max_attempts,3);
  assert.equal(await worker(db,'claim_job'),null);
}));
test('new privileged procedures are not executable by browser roles',()=>fresh(async db=>{
  for(const role of ['anon','authenticated','service_role','submission_media_broker']){
    assert.equal((await db.query("select has_function_privilege($1,'submission_media.queue_default_preview()','execute') allowed",[role])).rows[0].allowed,false);
  }
  for(const role of ['anon','authenticated']) assert.equal((await db.query("select has_function_privilege($1,'public.marketplace_waveform_locator(uuid,uuid,uuid)','execute') allowed",[role])).rows[0].allowed,false);
}));
test('local schema rollback preserves jobs, attempts, assets and capability state',()=>fresh(async db=>{
  const s=await create(db),m=await reserve(db,s);await observed(db,s,m.asset_id);await completeNext(db);await completeNext(db);
  const snapshot=async()=>({jobs:(await db.query('select id,state,attempt from submission_media.jobs order by id')).rows,assets:(await db.query('select id,technical_state,accepted_at from submission_media.assets order by id')).rows,flags:(await db.query('select * from submission_media.capabilities')).rows});
  const before=await snapshot();await db.exec(await readFile(new URL('../docs/audio-reconstruction/rollback.sql',import.meta.url),'utf8'));assert.deepEqual(await snapshot(),before);
  assert.equal((await db.query("select to_regprocedure('public.marketplace_waveform_locator(uuid,uuid,uuid)') is null absent")).rows[0].absent,true);
  const existing=(await db.query("select id from submission_media.assets where submission_id=$1 and kind='buyer_preview'",[s])).rows[0].id;
  assert.equal((await artist(db,'media_request_preview',[s,await revision(db,s),randomUUID()])).asset_id,existing);
}));
