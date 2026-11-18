import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {HostSigner,DOStorage} from '../services/media-broker/do-storage.mjs';
import {verifyTransfer,transferBytes} from '../services/media-broker/do-transfer-proof.mjs';
import {DODatabase,DOAuthority} from '../services/media-broker/do-database.mjs';
import {DODispatcher} from '../services/media-broker/do-dispatcher.mjs';
import {doConfig,doUsage} from '../services/media-broker/do-entrypoint.mjs';
const boot=randomUUID(),run=randomUUID(),l={job_id:randomUUID(),lease_epoch:1,lease_token:randomUUID()};
const {privateKey,publicKey}=generateKeyPairSync('ed25519'),pem=publicKey.export({type:'spki',format:'pem'}),secret=privateKey.export({type:'pkcs8',format:'pem'});
const signer=new HostSigner(secret,boot,()=>100000);
const proof=()=>{const h=signer.proof(run,l,'input');return {p:JSON.parse(h['x-tse-proof']),signature:h['x-tse-signature']};};
test('host transfer proofs bind the full run, lease, boot and transfer with strict expiry/signature',()=>{
 const {p,signature}=proof();assert.equal(verifyTransfer(p,signature,pem,100001).boot_id,boot);
 for(const patch of [{host_id:'8797328859122759463'},{boot_id:randomUUID()},{run_id:randomUUID()},{lease_token:randomUUID()},{operation:'write-anywhere'},{bytes:1},{sha256:'a'.repeat(64)},{nonce:randomUUID()},{issued_at:100002}])assert.throws(()=>verifyTransfer({...p,...patch},signature,pem,100001));
 for(const at of [99999,130000])assert.throws(()=>verifyTransfer(p,signature,pem,at));assert.throws(()=>verifyTransfer(p,signature,generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}),100001));
 assert.throws(()=>transferBytes({...p,storage_path:'foreign/object'}));
});
test('DO database RPCs cannot call generic/GCP authority and always inject the verified boot',async()=>{
 const calls=[],pool={query:async(sql,args)=>{calls.push({sql,args});return {rows:[{value:true}]};}};const db=new DODatabase(pool,boot);await db.rpc('do_admit',[run,'digest']);assert.deepEqual(calls[0].args,[run,boot,'digest']);await db.rpc('do_observe',[10,20]);assert.deepEqual(calls[1].args,[boot,10,20]);for(const name of ['claim_job','vm_admit','set_config','do_require'])await assert.rejects(db.rpc(name));
});
test('Storage bridge allows exact production signed input URLs only; never sends database/Storage secrets',async()=>{
 const i={bucket:'submission-source',path:'owner/submission/asset/original',bytes:3,sha256:null};let calls=[];
 const fetcher=async(url,options)=>{calls.push({url:String(url),options});if(calls.length===1){assert.equal(options.headers.apikey,undefined);assert.equal(options.headers.authorization,undefined);return Response.json({url:'https://sgpubcpldfxcuhjjdcau.supabase.co/storage/v1/object/sign/'+i.bucket+'/'+i.path+'?token=synthetic',bytes:3,sha256:null});}return new Response('abc');};
 const storage=new DOStorage(signer,{run},l,fetcher);const stream=await storage.stream(i);let text='';for await(const b of stream)text+=b;assert.equal(text,'abc');assert.equal(calls.length,2);assert.equal(calls[1].options.redirect,'error');
 for(const bad of ['https://evil.test/x','http://sgpubcpldfxcuhjjdcau.supabase.co/storage/v1/object/sign/'+i.bucket+'/'+i.path,'https://sgpubcpldfxcuhjjdcau.supabase.co/storage/v1/object/sign/submission-source/other']){
 let n=0;const denied=new DOStorage(signer,{run},l,async()=>{n++;return Response.json({url:bad,bytes:3,sha256:null});});await assert.rejects(denied.stream(i));assert.equal(n,1);}
});
function dispatcher(options={}){let starts=0,stops=0,settles=0;const id=randomUUID();const db={rpc:async(name,args)=>{
 if(name==='do_scope_status')return args[0]?{authorized:!options.revoked}:{state:options.recover?'issued':'none',run_id:id};
 if(name==='do_admit')return {state:'issued',run_id:id,recovery:false};if(name==='do_settle'){settles++;return {state:'failed'};}throw Error(name);}};
 let state=options.recover?'RUNNING':'NONE';const launcher={status:async()=>({state}),start:async()=>{starts++;state='EXITED';if(options.uncertain)throw Error('lost response');return {state};},stop:async()=>{stops++;state='EXITED';return {state};}};
 const broker={bind:()=>({run_id:id}),revoke:()=>{}};return {runner:new DODispatcher({db,broker,launcher,digest:'digest',syncUsage:async()=>({enabled:true,paused:false})}),counts:()=>({starts,stops,settles})};}
test('one-shot dispatch and interrupted-controller recovery never repeat an issued launch',async()=>{
 const normal=dispatcher();await normal.runner.once();assert.deepEqual(normal.counts(),{starts:1,stops:0,settles:1});
 const recovery=dispatcher({recover:true});await recovery.runner.once();assert.deepEqual(recovery.counts(),{starts:0,stops:1,settles:1});
 const uncertain=dispatcher({uncertain:true});assert.equal((await uncertain.runner.once()).state,'uncertain_launch');assert.deepEqual(uncertain.counts(),{starts:1,stops:0,settles:0});
 const revoked=dispatcher({revoked:true});await revoked.runner.once();assert.equal(revoked.counts().starts,0);
});
test('root accounting evidence rejects stale samples, guest mismatches and counter ambiguity',async()=>{
 const sample={provider:'digitalocean',host_id:'620470021',boot_id:boot,traffic_bytes:100,log_bytes:10,sampled_at:100000};let writes=0;const db={rpc:async(name,args)=>{assert.equal(name,'do_observe');assert.deepEqual(args,[100,10]);return {enabled:true,paused:false,projected_usd:13,month:'2026-11'};}};
 await doUsage(db,boot,{load:async()=>sample,now:()=>100001,save:async()=>{writes++;}});assert.equal(writes,1);
 for(const patch of [{sampled_at:1},{sampled_at:100002},{host_id:'8797328859122759463'},{boot_id:randomUUID()},{traffic_bytes:-1}])await assert.rejects(doUsage(db,boot,{load:async()=>({...sample,...patch}),now:()=>100001,save:async()=>{throw Error('must not write');}}));
});
test('independent root launch evidence rejects another host, boot, run, image, missing key and stale evidence',async()=>{
 const {launchBytes,verifyLaunch}=await import('../services/media-broker/do-transfer-proof.mjs');
 const p={version:1,host_id:'620470021',run_id:run,boot_id:boot,worker_digest:'sha256:d9b0e5d8cc4cebef685cef3cc8d235ebdd2d9c313169addcc33794b23f1d62e1',nonce:randomUUID(),issued_at:100000,expires_at:110000};const signature=sign(null,launchBytes(p),privateKey).toString('base64');assert.equal(verifyLaunch(p,signature,pem,100001).run_id,run);
 for(const patch of [{host_id:'8797328859122759463'},{boot_id:randomUUID()},{run_id:randomUUID()},{worker_digest:'sha256:'+'a'.repeat(64)},{expires_at:99999},{expires_at:200000}])assert.throws(()=>verifyLaunch({...p,...patch},signature,pem,100001));assert.throws(()=>verifyLaunch(p,signature,undefined,100001));assert.throws(()=>verifyLaunch(p,signature,pem,110000));
});

test('DO output callback never holds a database transaction across independently fenced application transfer',async()=>{
 let held=false;const calls=[];const value={asset_id:randomUUID(),profile:'waveform-v1',bucket:'submission-derived',path:'exact/output',source:{sha256:'a'.repeat(64)}};
 const query=async(sql)=>{calls.push(sql);if(sql==='begin')held=true;if(['commit','rollback'].includes(sql))held=false;return {rows:[{value}]};};
 const pool={query,connect:async()=>({query,release(){}})},authority=new DOAuthority(new DODatabase(pool,boot),run);
 await authority.withLease(l,async(job,recheck,record)=>{
  assert.equal(job.asset_id,value.asset_id);await recheck();
  // The real application transfer re-enters do_resolve on another connection.
  // Holding the broker transaction here reproduces its PostgreSQL lock timeout.
  assert.equal(held,false,'Application cannot re-enter a run locked by the awaiting broker');
  await record({object_id:randomUUID(),version:'verified',sha256:'b'.repeat(64),bytes:100});
 });
 assert.equal(calls.some(sql=>sql==='begin'),false);
 assert.equal(calls.filter(sql=>sql.startsWith('select submission_media.do_resolve')).length,3);
 assert.equal(calls.filter(sql=>sql.startsWith('select submission_media.do_record')).length,1);
});
test('revocation during a private transfer prevents output recording and accepted completion',async()=>{
 let revoked=false,privateWrites=0,recorded=0;const pool={query:async(sql)=>{
  if(sql.includes('do_record')){recorded++;throw Error('must not record stale output');}
  if(revoked)throw Object.assign(Error('expired live fence'),{code:'40001'});
  return{rows:[{value:{asset_id:randomUUID()}}]};
 }};const authority=new DOAuthority(new DODatabase(pool,boot),run);
 await assert.rejects(authority.withLease(l,async(job,recheck,record)=>{
  await recheck();privateWrites++;revoked=true;
  await recheck();await record({object_id:randomUUID(),version:'private',sha256:'a'.repeat(64),bytes:3});
 }));
 assert.equal(privateWrites,1);assert.equal(recorded,0);
 await assert.rejects(authority.complete(l,{sha256:'a'.repeat(64)},null));
});
