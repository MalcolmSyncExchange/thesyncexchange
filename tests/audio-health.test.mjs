import test from 'node:test';import assert from 'node:assert/strict';
import {uploadsFixture,create,reserve,observed,ids} from './helpers/music-uploads-fixture.mjs';
import {operationalAlerts} from '../services/media-broker/operational-health.mjs';
test('health RPC reports only eligible founder queue aggregates and preserves all jobs',async()=>{
 const db=await uploadsFixture();try{
  const boot='c6204700-2001-4000-8000-000000000001';
  await db.query('update submission_media.do_control set boot_id=$1,allowed_owner=$2,jobs_after=clock_timestamp()',[boot,ids.a]);
  const s=await create(db),a=await reserve(db,s);await observed(db,s,a.asset_id);
  const before=(await db.query('select count(*) n from submission_media.jobs')).rows[0].n;
  const v=(await db.query('select submission_media.do_health($1) v',[boot])).rows[0].v;
  assert.equal(v.queue_depth,1);assert.equal(v.running,0);assert.equal(v.failed_24h,0);assert.equal(v.mean_processing_seconds,null);
  assert.doesNotMatch(JSON.stringify(v),/job_id|submission_id|password|object_path|owner_id/);
  assert.equal((await db.query('select count(*) n from submission_media.jobs')).rows[0].n,before);
  await assert.rejects(db.query("select submission_media.do_health('00000000-0000-4000-8000-000000000001')"));
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'submission_media.do_health(uuid)','EXECUTE') v",[role])).rows[0].v,false);
  assert.equal((await db.query("select has_function_privilege('media_broker_do_login','submission_media.do_health(uuid)','EXECUTE') v")).rows[0].v,true);
 }finally{await db.close();}
});
test('bounded operational alerts identify stalled, unavailable, failing and near-budget workers',()=>{
 const queue={queue_depth:1,oldest_queued_seconds:301,running:0,completed_24h:3,failed_24h:1};
 assert.deepEqual(operationalAlerts({queue,projectedUsd:19.8,ceilingUsd:20,available:false}),['worker_unavailable','queue_stalled','processing_delayed','repeated_processing_failures','budget_approaching_exhaustion']);
 assert.deepEqual(operationalAlerts({queue:{...queue,queue_depth:0,oldest_queued_seconds:0,failed_24h:0},projectedUsd:17,ceilingUsd:20}),[]);
 assert.deepEqual(operationalAlerts({queue:null}),['health_evidence_missing','financial_evidence_missing']);
});
