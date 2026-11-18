import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm,readFile,stat,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {InputGrants,PrivateInputSigner} from '../services/media-broker/input-grants.mjs';
import {downloadInput,validateGrant,DirectInputBroker} from '../workers/media/direct-input.mjs';
import {STAGING} from '../services/media-broker/common.mjs';
function fixture({bytes=100,sha=true}={}){
 const owner=randomUUID(),submission_id=randomUUID(),asset_id=randomUUID(),data=Buffer.alloc(bytes,42);
 const job={asset_id,submission_id,job_type:'source_validation',profile:'source-validator-v1',bucket:'submission-source',path:`${owner}/${submission_id}/${asset_id}/original`,object_id:randomUUID(),version:randomUUID(),bytes,max_bytes:50e6,sha256:sha?createHash('sha256').update(data).digest('hex'):null};
 let live=true,signs=0,now=100000;
 const authority={async withLease(_l,f){if(!live)throw Error('LEASE_STALE');return f({...job},async()=>{if(!live)throw Error('LEASE_STALE');return {...job};});}};
 const signer={async sign(i,_seconds,id){signs++;return `https://${STAGING}.supabase.co/storage/v1/object/sign/${i.bucket}/${i.path}?token=synthetic&cacheNonce=${id}`;}};
 return {job,data,authority,signer,issue:()=>new InputGrants(authority,signer,{now:()=>now}).issue({}),clock:()=>now,setTime:v=>now=v,revoke:()=>live=false,signs:()=>signs};
}
async function directory(fn){const d=await realpath(await mkdtemp(join(tmpdir(),'direct-input-')));try{await fn(d);}finally{await rm(d,{recursive:true,force:true});}}
test('direct private transfer at exactly 50 MB; broker returns only a small grant, not audio',()=>directory(async d=>{
 const c=fixture({bytes:50_000_000}),{job,grant}=await c.issue();let fetches=0;
 assert.ok(Buffer.byteLength(JSON.stringify({job,grant}))<4096);assert.equal('path' in job,false);assert.equal('bucket' in job,false);
 const facts=await downloadInput(grant,job,join(d,'input'),{now:c.clock,fetcher:async(url,options)=>{fetches++;assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,undefined);assert.match(url,/object\/sign\/submission-source/);return new Response(c.data,{headers:{'content-length':String(c.data.length)}});}});
 assert.equal(facts.actual_bytes,50_000_000);assert.equal(facts.sha256,c.job.sha256);assert.equal(fetches,1);assert.equal((await stat(join(d,'input'))).mode&0o777,0o600);
}));
test('grants bind canonical owner/submission/object/version, reject legacy paths and enforce 150 MB admission',async()=>{
 for(const mutate of [j=>j.path='../foreign',j=>j.path=j.path.replace(j.submission_id,randomUUID()),j=>j.path=j.path.replace(j.asset_id,randomUUID()),j=>j.bucket='track-audio',j=>j.bytes=150_000_001]){const c=fixture();mutate(c.job);await assert.rejects(c.issue());assert.equal(c.signs(),0);}
 const c=fixture();c.signer.sign=async()=>{c.revoke();return 'unused';};await assert.rejects(c.issue(),/LEASE_STALE/);
});
test('expired, foreign account/path/origin, public URLs and redirects are denied before transfer',()=>directory(async d=>{
 const c=fixture(),{job,grant}=await c.issue();let calls=0;
 for(const g of [{...grant,expires_at:c.clock()-1},{...grant,expires_at:c.clock()+31000},{...grant,url:grant.url.replace(STAGING,'sgpubcpldfxcuhjjdcau')},{...grant,url:grant.url.replace(c.job.path.split('/')[0],randomUUID())},{...grant,url:grant.url.replace('/object/sign/','/object/public/')},{...grant,url:grant.url+'&extra=1'},{...grant,identity:{...grant.identity,object_id:randomUUID()}}])await assert.rejects(downloadInput(g,job,join(d,randomUUID()),{now:c.clock,fetcher:async()=>{calls++;assert.fail();}}));
 assert.equal(calls,0);assert.throws(()=>validateGrant({...grant,url:'https://evil.invalid/?token=secret'},job,c.clock()));
}));
test('truncation, bad checksum, oversized, compressed and ranged responses leave no partial file',()=>directory(async d=>{
 const c=fixture(),{job,grant}=await c.issue(),target=join(d,'input');
 for(const response of [()=>new Response(c.data.subarray(1)),()=>new Response(Buffer.alloc(100)),()=>new Response(Buffer.alloc(101)),()=>new Response(c.data,{headers:{'content-encoding':'gzip'}}),()=>new Response(c.data,{headers:{'content-range':'bytes 0-99/100'}})]){
  await assert.rejects(downloadInput(grant,job,target,{now:c.clock,fetcher:async()=>response()}));await assert.rejects(stat(target),{code:'ENOENT'});
 }
}));
test('interrupted transfer and expired authorization recover with fresh grant and exact bytes; existing file is preserved',()=>directory(async d=>{
 const c=fixture(),first=await c.issue(),target=join(d,'input');
 await assert.rejects(downloadInput(first.grant,first.job,target,{now:c.clock,fetcher:async()=>new Response(new ReadableStream({start(x){x.enqueue(c.data.subarray(0,50));x.error(Error('synthetic connection lost'));}}))}));await assert.rejects(stat(target),{code:'ENOENT'});
 c.setTime(first.grant.expires_at);await assert.rejects(downloadInput(first.grant,first.job,target,{now:c.clock,fetcher:async()=>assert.fail()}));
 const next=await c.issue();assert.notEqual(first.grant.id,next.grant.id);await downloadInput(next.grant,next.job,target,{now:c.clock,fetcher:async()=>new Response(c.data)});assert.deepEqual(await readFile(target),c.data);
 await assert.rejects(downloadInput(next.grant,next.job,target,{now:c.clock,fetcher:async()=>new Response(c.data)}));assert.deepEqual(await readFile(target),c.data);
}));
test('first source without prior hash is independently hashed; authorization revoked during mint is fenced',()=>directory(async d=>{
 const c=fixture({sha:false}),{job,grant}=await c.issue();const r=await downloadInput(grant,job,join(d,'input'),{now:c.clock,fetcher:async()=>new Response(c.data)});assert.equal(r.sha256,createHash('sha256').update(c.data).digest('hex'));
 const changed=fixture(),old=changed.signer.sign;changed.signer.sign=async(...a)=>{const u=await old(...a);changed.job.version=randomUUID();return u;};await assert.rejects(changed.issue(),/INPUT_MISMATCH/);
}));
test('broker signs only exact private object with 30-second TTL; service credential never enters returned URL',async()=>{
 const c=fixture(),credential='synthetic-only-credential-not-valid',signer=new PrivateInputSigner(credential,{fetcher:async(url,o)=>{assert.equal(url,`https://${STAGING}.supabase.co/storage/v1/object/sign/submission-source/${c.job.path}`);assert.deepEqual(JSON.parse(o.body),{expiresIn:30});assert.equal(o.headers.Authorization,'Bearer '+credential);assert.equal(o.redirect,'error');return Response.json({signedURL:`/object/sign/submission-source/${c.job.path}?token=short-lived`});}});
 const u=await signer.sign(c.job,30,randomUUID());assert.doesNotMatch(u,/credential/);
 await assert.rejects(new PrivateInputSigner(credential,{fetcher:async()=>Response.json({signedURL:'https://foreign.invalid/?token=x'})}).sign(c.job,30,randomUUID()));
});
test('direct broker rechecks the lease after bytes; revoked or replaced input is removed before processing',()=>directory(async d=>{
 const config={MEDIA_ENV:'security-staging',GCP_PROJECT:'tse-security-staging-media',SUPABASE_REF:STAGING,SUPABASE_URL:`https://${STAGING}.supabase.co`,BROKER_URL:'https://media-broker-staging-123456.us-east5.run.app',BROKER_AUDIENCE:'https://media-broker-staging-123456.us-east5.run.app',WORKER_SUBJECT:'111111111',WORKER_EMAIL:'media-worker-staging@tse-security-staging-media.iam.gserviceaccount.com',DISPATCHER_SUBJECT:'222222222',DISPATCHER_EMAIL:'media-dispatcher-staging@tse-security-staging-media.iam.gserviceaccount.com',EXECUTION_PERMIT_ID:randomUUID(),EXECUTION_NAME:'projects/tse-security-staging-media/locations/us-east5/jobs/media-worker-staging/executions/synthetic'};
 const c=fixture();c.setTime(Date.now());const issued=await c.issue(),l={job_id:randomUUID(),lease_epoch:1,lease_token:randomUUID()};
 for(const mode of ['success','revoked','replaced']){
  const remote=new DirectInputBroker(config,{inputFetch:async()=>new Response(c.data)});let reads=0;
  remote.call=async path=>{if(path==='/input-grant')return issued;assert.equal(path,'/resolve');reads++;if(mode==='revoked')throw Error('LEASE_STALE');return mode==='replaced'?{...issued.job,version:randomUUID()}:issued.job;};
  const target=join(d,mode);if(mode==='success'){await remote.read(l,target);assert.deepEqual(await readFile(target),c.data);}else{await assert.rejects(remote.read(l,target));await assert.rejects(stat(target),{code:'ENOENT'});}assert.equal(reads,1);
 }
}));
