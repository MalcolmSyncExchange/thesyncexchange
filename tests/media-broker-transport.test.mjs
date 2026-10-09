import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join} from 'node:path';
import {fixture,enabled,submission,reserve,upload,key,masterResult,quote} from './helpers/submission-media-postgres.mjs';
import {brokerServer} from '../services/media-broker/server.mjs';
import {DispatchAuthority} from '../services/media-broker/dispatcher.mjs';
import {RemoteBroker} from '../workers/media/remote-broker.mjs';
import {LocalObjects,leaseOf} from '../workers/media/broker.mjs';
import {verifyOutput} from '../workers/media/files.mjs';
const config={MEDIA_ENV:'security-staging',GCP_PROJECT:'tse-security-staging-media',SUPABASE_REF:'xgbiypruultmzbwhhjrx',SUPABASE_URL:'https://xgbiypruultmzbwhhjrx.supabase.co',BROKER_URL:'https://media-broker-staging-123456.us-east5.run.app',BROKER_AUDIENCE:'https://media-broker-staging-123456.us-east5.run.app',WORKER_SUBJECT:'111111111',WORKER_EMAIL:'media-worker-staging@tse-security-staging-media.iam.gserviceaccount.com',DISPATCHER_SUBJECT:'222222222',DISPATCHER_EMAIL:'media-dispatcher-staging@tse-security-staging-media.iam.gserviceaccount.com'};
async function setup(body){const db=await fixture(),dir=await mkdtemp('/private/tmp/broker-http-'),pool=new pg.Pool({host:'/private/tmp',port:55440,user:'slice3_fixture_admin',database:db.name,max:8});
 const store=new LocalObjects(join(dir,'objects'),async(j,o)=>db.exec(`insert into storage.objects(id,bucket_id,name,metadata,version) values('${o.object_id}',${quote(j.bucket)},${quote(j.path)},jsonb_build_object('size',${o.bytes},'mimetype','application/octet-stream'),${quote(o.version)})`));
 let duringInput=null,duringWrite=null,dropPath=null;
 const server=brokerServer({config:{...config,SCRATCH:dir},pool,identity:{verify:async h=>{if(h==='Bearer worker')return {role:'worker',subject:config.WORKER_SUBJECT};if(h==='Bearer dispatcher')return {role:'dispatcher',subject:config.DISPATCHER_SUBJECT};throw Error('raw-secret-must-not-leak');}},dispatcher:new DispatchAuthority(pool),storageFactory:()=>({stream:async i=>{const o=store.objects.get(i.object_id);assert.equal(o.version,i.version);if(duringInput)await duringInput();return createReadStream(o.path);},createExact:async(...a)=>{const o=await store.createExact(...a);if(duringWrite)await duringWrite();return o;},inspectExact:i=>store.inspectExact(i)})});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const http=(path,value,role='worker',headers={})=>fetch(url+path,{method:'POST',headers:{Authorization:'Bearer '+role,...headers},body:JSON.stringify(value)});
 const remote=p=>new RemoteBroker({...config,EXECUTION_PERMIT_ID:p,EXECUTION_NAME:'projects/tse-security-staging-media/locations/us-east5/jobs/media-worker-staging/executions/test-'+p},{token:async()=>'worker',fetcher:async(u,o)=>{const path=u.slice(config.BROKER_URL.length),r=await fetch(url+path,o);if(path===dropPath){dropPath=null;await r.arrayBuffer();throw Error('synthetic response lost');}return r;}});
 const nominate=async j=>{const r=await http('/dispatch',{job_id:j.id,asset_id:j.asset_id,job_type:j.job_type,profile:j.profile_version,state:j.state,attempt:j.attempt,correlation_id:key()},'dispatcher');assert.equal(r.status,200);const p=await r.json();const bound=await http('/bind',{permit_id:p.permit_id,execution_name:'projects/tse-security-staging-media/locations/us-east5/jobs/media-worker-staging/executions/test-'+p.permit_id},'dispatcher');assert.equal(bound.status,200);return remote(p.permit_id);};
 try{await enabled(db);const s=await submission(db),a=await reserve(db,s);await upload(db,a.asset_id);const i=JSON.parse(await db.scalar(`select jsonb_build_object('object_id',storage_object_id,'version',storage_version) from submission_media.assets where id='${a.asset_id}'`));const input=join(dir,'input-fixture');await writeFile(input,Buffer.alloc(100));await store.register(i,input);await body({db,dir,store,http,nominate,setInput:f=>duringInput=f,setWrite:f=>duringWrite=f,drop:path=>dropPath=path});}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));await pool.end();await db.close();await rm(dir,{recursive:true,force:true});}
}
async function source(c){const j=(await c.db.query("select * from submission_media.jobs where job_type='source_validation'")).rows[0],remote=await c.nominate(j),claim=await remote.claim();return {remote,l:leaseOf(claim),claim};}
async function wave(c){const src=await source(c);await src.remote.complete(src.l,masterResult());const j=(await c.db.query("select * from submission_media.jobs where job_type='waveform_generation'")).rows[0],remote=await c.nominate(j),claim=await remote.claim();return {remote,l:leaseOf(claim),claim};}
async function proof(c){const output=join(c.dir,'wave');await writeFile(output,'synthetic-bounded-waveform');return verifyOutput(output,2e6,undefined,async()=>({container:'waveform_minmax_i16_v1',waveform_points:12000,source_sha256:'a'.repeat(64)}));}
test('HTTP remote: exact input/heartbeat, no destination disclosure, fenced waveform and duplicate completion',()=>setup(async c=>{
 const s=await source(c);assert.equal('bucket' in s.claim,false);assert.equal('path' in s.claim,false);await s.remote.heartbeat(s.l);await s.remote.read(s.l,join(c.dir,'worker-input'));assert.equal((await readFile(join(c.dir,'worker-input'))).length,100);
 await s.remote.complete(s.l,masterResult());await s.remote.complete(s.l,masterResult());const j=(await c.db.query("select * from submission_media.jobs where job_type='waveform_generation'")).rows[0],remote=await c.nominate(j),l=leaseOf(await remote.claim()),result=await proof(c);
 await remote.writeOutput(l,await remote.authorizeOutput(l),result);await remote.writeOutput(l,await remote.authorizeOutput(l),result);assert.equal(c.store.destinations.size,1);await remote.complete(l,{...result,build_digest:'sha256:'+'b'.repeat(64)});assert.equal(await c.db.scalar("select count(*) from submission_media.jobs where state='succeeded'"),'2');
}));
test('HTTP forged job/token/destination/profile/metadata and caller roles fail closed',()=>setup(async c=>{
 const w=await wave(c),result=await proof(c),context=w.remote.context(w.l);
 for(const path of ['/dispatch','/bind','/status'])assert.equal((await c.http(path,{})).status,403);
 assert.equal((await c.http('/claim',{permit_id:context.permit_id,execution_name:context.execution_name},'buyer')).status,409);
 for(const x of [{...context,job_id:key()},{...context,lease_token:key()},{...context,bucket:'evil'}])assert.notEqual((await c.http('/resolve',x)).status,200);
 for(const x of [{context,result,profile:'wrong'},{context,result:{...result,raw_error:'secret'},profile:w.claim.profile},{context,result,profile:w.claim.profile,path:'evil'}]){const reply=await c.http('/output',{},'worker',{'x-media-context':JSON.stringify(x)});assert.notEqual(reply.status,200);assert.doesNotMatch(await reply.text(),/raw-secret/);}
 assert.equal(c.store.destinations.size,0);
}));
test('HTTP stale during input recheck and before output never records authoritative bytes',()=>setup(async c=>{
 const w=await wave(c);c.setInput(()=>c.db.exec(`update submission_media.jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id='${w.l.job_id}'`));await assert.rejects(w.remote.read(w.l,join(c.dir,'stale')));await assert.rejects(w.remote.authorizeOutput(w.l));assert.equal(c.store.destinations.size,0);
}));
test('HTTP stale lease after create retains private uncertain object but rolls back output evidence',()=>setup(async c=>{
 const w=await wave(c),result=await proof(c);c.setWrite(()=>new Promise(r=>setTimeout(r,300)));await c.db.exec(`update submission_media.jobs set lease_expires_at=clock_timestamp()+interval '150 milliseconds' where id='${w.l.job_id}'`);await assert.rejects(w.remote.writeOutput(w.l,await w.remote.authorizeOutput(w.l),result));assert.equal(c.store.destinations.size,1);assert.equal(await c.db.scalar(`select count(*) from submission_media.jobs where output_object_id is not null and asset_id='${w.claim.asset_id}'`),'0');await assert.rejects(w.remote.complete(w.l,{...result,build_digest:'sha256:'+'b'.repeat(64)}));
}));

test('HTTP lost output evidence/completion response reconciles exact result without new object or attempt',()=>setup(async c=>{
 const w=await wave(c),result=await proof(c);c.drop('/output');await w.remote.writeOutput(w.l,await w.remote.authorizeOutput(w.l),result);assert.equal(c.store.destinations.size,1);c.drop('/complete');await w.remote.complete(w.l,{...result,build_digest:'sha256:'+'b'.repeat(64)});assert.equal(await c.db.scalar(`select attempt from submission_media.jobs where id='${w.l.job_id}'`),'1');assert.equal(await c.db.scalar(`select state from submission_media.jobs where id='${w.l.job_id}'`),'succeeded');
}));
