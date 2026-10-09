import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture,enabled,submission,actor,call,key,revision,broker,quote,psql,complete,masterResult } from './helpers/submission-media-postgres.mjs';
import { ids } from './helpers/artist-baseline-db.mjs';
import { PgAuthority,MediaBroker,LocalObjects,leaseOf } from '../workers/media/broker.mjs';
import { MediaTools } from '../workers/media/process.mjs';
import { runOne } from '../workers/media/worker.mjs';
import { tone } from './media-worker/fixtures.mjs';
import { waveform,hashFile } from '../workers/media/media.mjs';
import { verifyOutput } from '../workers/media/files.mjs';
const digest='sha256:'+'b'.repeat(64);
const tools=new MediaTools(process.env.MEDIA_TOOL_DIR||'/private/tmp/slice3-media-tools/bin');
async function setup(body) {
 const db=await fixture(),dir=await mkdtemp('/private/tmp/media-pg-');
 const rawPool=new pg.Pool({host:'/private/tmp',port:55440,user:'slice3_fixture_admin',database:db.name,max:5});
 const pool={async connect(){const c=await rawPool.connect();await c.query('set role submission_media_broker');return c;},async query(text,args){const c=await this.connect();try{return await c.query(text,args);}finally{c.release();}}};
 const authority=new PgAuthority(pool);
 const objects=new LocalObjects(join(dir,'objects'),async(job,o)=>{
   await db.exec(`insert into storage.objects(id,bucket_id,name,version,metadata) values('${o.object_id}',${quote(job.bucket)},${quote(job.path)},'${o.version}',jsonb_build_object('size',${o.bytes},'mimetype',${quote(job.job_type==='preview_generation'?'audio/mp4':'application/octet-stream')}))`);
 });
 const mediaBroker=new MediaBroker(authority,objects);
 try {await enabled(db);await body({db,dir,authority,objects,mediaBroker});}
 finally {await rawPool.end();await db.close();await rm(dir,{recursive:true,force:true});}
}
async function input(ctx,s,path) {
 const size=(await stat(path)).size;
 const a=await actor(ctx.db,ids.a,call('media_reserve_asset',[s,'source_master','synthetic.wav',size,await revision(ctx.db,s),key()]));
 await ctx.db.exec(`insert into storage.objects(bucket_id,name,owner_id,metadata,version) select bucket,object_path,'${ids.a}',jsonb_build_object('size',${size},'mimetype','audio/wav'),'synthetic-version' from submission_media.assets where id='${a.asset_id}'`);
 await broker(ctx.db,`select submission_media.observe_upload('${a.asset_id}')`);
 const o=JSON.parse(await ctx.db.scalar(`select jsonb_build_object('object_id',storage_object_id,'version',storage_version) from submission_media.assets where id='${a.asset_id}'`));
 await ctx.objects.register(o,path);return a.asset_id;
}
test('real PostgreSQL worker: source → waveform → preview evidence; no publication or commerce',()=>setup(async c=>{
 const s=await submission(c.db),path=join(c.dir,'tone');await tone(path,{seconds:30,channels:2});const master=await input(c,s,path);
 await runOne(c.mediaBroker,tools,digest);await runOne(c.mediaBroker,tools,digest);
 assert.equal(await c.db.scalar(`select count(*) from submission_media.assets where technical_state='ready'`),'2');
 await actor(c.db,ids.a,call('media_select_preview_region',[s,master,0,30000,await revision(c.db,s),key()]));
 await actor(c.db,ids.a,call('media_request_preview',[s,await revision(c.db,s),key()]));
 await runOne(c.mediaBroker,tools,digest);
 assert.equal(await c.db.scalar(`select count(*) from submission_media.assets where technical_state='ready'`),'3');
 assert.equal(await c.db.scalar(`select count(*) from submission_media.master_reviews`),'0');
 assert.equal(await c.db.scalar(`select count(*) from submission_media.assets where accepted_at is not null`),'0');
 assert.equal(await c.db.scalar(`select count(*) from submission_media.submissions where current_master_id is not null or current_preview_id is not null`),'0');
 assert.equal(await c.db.scalar(`select count(*) from public.orders`),'0'); // unchanged seeded order
}));
test('real PostgreSQL fencing: takeover denies old output/read/complete, new lease writes exactly once',()=>setup(async c=>{
 const s=await submission(c.db),path=join(c.dir,'tone');await tone(path,{seconds:2});await input(c,s,path);await runOne(c.mediaBroker,tools,digest);
 const old=await c.mediaBroker.claim(),l=leaseOf(old),cap=await c.mediaBroker.authorizeOutput(l);
 await c.db.exec(`update submission_media.jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id='${old.job_id}'`);
 const next=await c.mediaBroker.claim();assert.equal(next.lease_epoch,old.lease_epoch+1);
 const output=join(c.dir,'out');await writeFile(output,'synthetic-local-output');const proof=await verifyOutput(output,2e6,undefined,async()=>({}));
 await assert.rejects(c.mediaBroker.writeOutput(l,cap,proof),/worker_lease_expired/);
 await assert.rejects(c.mediaBroker.read(l,join(c.dir,'old-read')),/worker_lease_expired/);
 await assert.rejects(c.mediaBroker.complete(l,masterResult()),/worker_lease_expired/);
 assert.equal(c.objects.destinations.size,0);
 const fresh=leaseOf(next);await c.mediaBroker.heartbeat(fresh);const newCap=await c.mediaBroker.authorizeOutput(fresh);
 await c.mediaBroker.writeOutput(fresh,newCap,proof);assert.equal(c.objects.destinations.size,1);
 await assert.rejects(c.mediaBroker.writeOutput(fresh,newCap,proof),/worker_lease_expired/);
 const replay=await c.mediaBroker.writeOutput(fresh,await c.mediaBroker.authorizeOutput(fresh),proof);assert.equal(replay.object_id,c.objects.destinations.values().next().value);assert.equal(c.objects.destinations.size,1);
}));
test('real PostgreSQL: output commit holds lease lock; concurrent takeover cannot race destination creation',()=>setup(async c=>{
 const s=await submission(c.db),path=join(c.dir,'tone');await tone(path,{seconds:2});await input(c,s,path);await runOne(c.mediaBroker,tools,digest);const job=await c.mediaBroker.claim(),l=leaseOf(job);
 let release,entered;const wait=new Promise(r=>{release=r;});const started=new Promise(r=>{entered=r;});
 const holding=c.authority.withLease(l,async(_,recheck)=>{entered();await wait;await recheck();});await started;
 const parallel=psql(c.db.name,`begin; set local lock_timeout='100ms'; update submission_media.jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id='${job.job_id}';commit`,{allowFailure:true});
 const blocked=await parallel;assert.notEqual(blocked.code,0);assert.match(blocked.err,/lock timeout/);release();await holding;
}));
test('real PostgreSQL: forged tuples/roles, output substitution, bounded result, retries and max attempts',()=>setup(async c=>{
 const s=await submission(c.db),path=join(c.dir,'tone');await tone(path,{seconds:2});await input(c,s,path);const job=await c.mediaBroker.claim(),l=leaseOf(job);
 for(const bad of [{...l,asset_id:ids.b},{...l,bucket:'submission-derived'},{...l,path:'../x'},{...l,url:'https://invalid.test'}, {...l,lease_epoch:0},{...l,lease_token:ids.b},{...l,job_id:ids.b}])await assert.rejects(c.mediaBroker.authorizeOutput(bad));
 for(const [id,role] of [[ids.a,'authenticated'],[ids.b,'authenticated'],[ids.buyer,'authenticated'],[null,'anon'],[ids.admin,'authenticated']]) await assert.rejects(actor(c.db,id,`select submission_media.resolve_worker_io('${job.job_id}',${job.lease_epoch},'${job.lease_token}')`,role),/permission denied/);
 await assert.rejects(c.mediaBroker.complete(l,{raw_error:'token='.repeat(2000)}),/validation_failed/);
 await c.mediaBroker.fail(l,'temporary_system_error');
 for(let attempt=2;attempt<=3;attempt++){await c.db.exec(`update submission_media.jobs set available_at=clock_timestamp()-interval '1 second' where id='${job.job_id}'`);const retry=await c.mediaBroker.claim();assert.equal(retry.lease_epoch,attempt);await c.mediaBroker.fail(leaseOf(retry),'validator_timeout');}
 assert.equal(await c.db.scalar(`select state from submission_media.jobs where id='${job.job_id}'`),'failed');assert.equal(await c.mediaBroker.claim(),null);
}));
test('real PostgreSQL: simultaneous claims yield one lease; source identity/profile mismatch fails closed',()=>setup(async c=>{
 const s=await submission(c.db),path=join(c.dir,'tone');await tone(path,{seconds:2});await input(c,s,path);
 const jobs=await Promise.all([c.mediaBroker.claim(),c.mediaBroker.claim()]);assert.equal(jobs.filter(Boolean).length,1);
 const l=leaseOf(jobs.find(Boolean));await assert.rejects(c.db.exec(`update submission_media.jobs set profile_version='source-validator-v2' where id='${l.job_id}'`),/check constraint/);
 await c.db.exec(`alter table storage.objects disable trigger guard_submission_media_object; update storage.objects set version='foreign-version' where id=(select storage_object_id from submission_media.assets where id='${jobs.find(Boolean).asset_id}'); alter table storage.objects enable trigger guard_submission_media_object;`);
 await assert.rejects(c.mediaBroker.read(l,join(c.dir,'bad')),/temporary_system_error/);
}));
test('real PostgreSQL: unfenced completion cannot promote an uncertain derivative object',()=>setup(async c=>{
 const s=await submission(c.db),path=join(c.dir,'tone');await tone(path,{seconds:2});await input(c,s,path);await runOne(c.mediaBroker,tools,digest);
 const job=await c.mediaBroker.claim(),l=leaseOf(job),output=join(c.dir,'out');await writeFile(output,'deterministic fixture output');
 const facts=await hashFile(output,2e6);
 // The legacy completion RPC alone cannot turn an unrecorded derivative READY.
 await c.db.exec(`insert into storage.objects(bucket_id,name,metadata,version) select bucket,object_path,jsonb_build_object('size',${facts.actual_bytes},'mimetype','application/octet-stream'),'test-unfenced' from submission_media.assets where id='${job.asset_id}'`);
 await assert.rejects(broker(c.db,`select submission_media.complete_job('${job.job_id}',${job.lease_epoch},'${job.lease_token}',${quote(JSON.stringify({...facts,source_sha256:'0'.repeat(64),container:'waveform_minmax_i16_v1',waveform_points:200,build_digest:digest}))}::jsonb)`));
 // Preserve uncertain evidence; no destructive cleanup or fabricated success.
 const state=await c.authority.withLease(l,async value=>value);assert.equal(state.output,null);
 await assert.rejects(c.mediaBroker.complete(l,{...facts,build_digest:digest}),/worker_lease_expired/);
}));
test('real PostgreSQL: broker restart and lease takeover recover exact durable output without overwrite',()=>setup(async c=>{
 const s=await submission(c.db),path=join(c.dir,'tone');await tone(path,{seconds:2});await input(c,s,path);await runOne(c.mediaBroker,tools,digest);
 const job=await c.mediaBroker.claim(),l=leaseOf(job),local=join(c.dir,'input'),output=join(c.dir,'out');
 const facts=await c.mediaBroker.read(l,local);const result=await waveform(tools,local,facts.source,facts.source,output);
 const first=await c.mediaBroker.writeOutput(l,await c.mediaBroker.authorizeOutput(l),result);
 const restarted=new MediaBroker(c.authority,c.objects);
 await c.db.exec(`update submission_media.jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id='${job.job_id}'`);
 const next=await restarted.claim(),fresh=leaseOf(next);await assert.rejects(restarted.complete(l,{...result,build_digest:digest}),/worker_lease_expired/);
 const recovered=await restarted.writeOutput(fresh,await restarted.authorizeOutput(fresh),result);assert.equal(recovered.object_id,first.object_id);assert.equal(c.objects.destinations.size,1);
 await restarted.complete(fresh,{...result,build_digest:digest});assert.equal(await c.db.scalar(`select state from submission_media.jobs where id='${job.job_id}'`),'succeeded');
}));
