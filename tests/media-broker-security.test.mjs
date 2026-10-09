import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {GoogleIdentity} from '../services/media-broker/auth.mjs';
import {stagingConfig,BoundedStream,boundedJson,logEvent} from '../services/media-broker/common.mjs';
import {StagingStorage} from '../services/media-broker/storage.mjs';
import {Dispatcher,CloudRunControl} from '../services/media-broker/dispatcher.mjs';
import {runtimePreflight} from '../workers/media/runtime-preflight.mjs';
export const config={MEDIA_ENV:'security-staging',GCP_PROJECT:'tse-security-staging-media',SUPABASE_REF:'xgbiypruultmzbwhhjrx',SUPABASE_URL:'https://xgbiypruultmzbwhhjrx.supabase.co',BROKER_URL:'https://media-broker-staging-123456.us-east5.run.app',BROKER_AUDIENCE:'https://media-broker-staging-123456.us-east5.run.app',WORKER_SUBJECT:'111111111',WORKER_EMAIL:'media-worker-staging@tse-security-staging-media.iam.gserviceaccount.com',DISPATCHER_SUBJECT:'222222222',DISPATCHER_EMAIL:'media-dispatcher-staging@tse-security-staging-media.iam.gserviceaccount.com'};
test('OIDC signed Google identity only: issuer/audience/sub/email/expiry/signature/browser token',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const key={...publicKey.export({format:'jwk'}),kid:'test'};const verifier=new GoogleIdentity(config,async(url,opt)=>{assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs');assert.equal(opt.redirect,'error');return new Response(JSON.stringify({keys:[key]}));},()=>1000000);
 const base={iss:'https://accounts.google.com',aud:config.BROKER_AUDIENCE,sub:config.WORKER_SUBJECT,email:config.WORKER_EMAIL,email_verified:true,iat:999,exp:1600};
 const token=(c,h={alg:'RS256',kid:'test'})=>{const parts=[h,c].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url'));return 'Bearer '+parts.join('.')+'.'+sign('RSA-SHA256',Buffer.from(parts.join('.')),privateKey).toString('base64url');};
 assert.equal((await verifier.verify(token(base))).role,'worker');assert.equal((await verifier.verify(token({...base,sub:config.DISPATCHER_SUBJECT,email:config.DISPATCHER_EMAIL}))).role,'dispatcher');
 for(const c of [{...base,iss:'https://evil.test'},{...base,aud:'browser'},{...base,sub:'333333333'},{...base,email:'media-worker@production.iam.gserviceaccount.com'},{...base,exp:900},{...base,email_verified:false},{...base,iat:10000}])await assert.rejects(verifier.verify(token(c)),/AUTH_DENIED/);
 for(const t of ['Bearer x.y.z',token(base,{alg:'none',kid:'test'}),token(base).slice(0,-10)+'junk'])await assert.rejects(verifier.verify(t),/AUTH_DENIED/);
});
test('production / project / audience / secret namespace fail closed; no env file consumption',async()=>{
 assert.equal(stagingConfig(config).SUPABASE_REF,config.SUPABASE_REF);
 for(const x of [{SUPABASE_REF:'sgpubcpldfxcuhjjdcau'},{SUPABASE_URL:'https://sgpubcpldfxcuhjjdcau.supabase.co'},{GCP_PROJECT:'production'},{BROKER_AUDIENCE:'https://evil.test'},{DB_SECRET:'projects/other/secrets/media-db-staging/versions/1'},{DB_SECRET:'projects/tse-security-staging-media/secrets/media-storage-staging/versions/1'}])assert.throws(()=>stagingConfig({...config,...x}),/TARGET_MISMATCH/);
 await assert.rejects(runtimePreflight(config));
});
test('input fixed host/path and redirect fail closed; oversized/truncated/checksum streams reject',async()=>{
 let calls=0;const storage=new StagingStorage('synthetic-not-a-real-credential',async()=>null,async(url,opt)=>{calls++;assert.ok(url.startsWith(config.SUPABASE_URL+'/storage/v1/object/submission-source/'));assert.equal(opt.redirect,'error');return new Response('bytes',{status:200,headers:{'content-length':'5'}});});
 const i={bucket:'submission-source',path:'fixed/object.wav',bytes:5};await storage.stream(i);assert.equal(calls,1);
 for(const x of [{bucket:'evil'}, {path:'../other'}, {path:'https://evil.test/x'}, {path:'/root'},{path:'x%2f..'},{path:'x?url=evil'}])await assert.rejects(storage.stream({...i,...x}));assert.equal(calls,1);
 await assert.rejects(storage.stream({...i,bytes:6}));
 const redirect=new StagingStorage('synthetic-not-a-real-credential',async()=>null,async()=>new Response(null,{status:302,headers:{location:'https://evil.test'}}));await assert.rejects(redirect.stream(i));
 for(const [bytes,max,expected,hash] of [['sixsix',5,null,null],['two',10,5,null],['five!',10,5,'f'.repeat(64)]])await assert.rejects(pipeline(Readable.from([Buffer.from(bytes)]),new BoundedStream(max,expected,hash),async src=>{for await(const _ of src){}}));
 await assert.rejects(boundedJson(new Response('x'.repeat(70000))));
});
test('dispatcher uncertain invoke is never blindly repeated; reconciles durable execution',async()=>{
 let requested=false,execution=null,runs=0;const transport=async(path)=>path==='/dispatch'?{permit_id:'p',state:'requested',invoke:!requested&&(requested=true),execution_name:execution}:path==='/bind'?(execution='e'):{state:'requested',execution_name:execution};
 const d=new Dispatcher(transport,{run:async()=>{runs++;throw Error('response lost');},find:async()=>['e']});await d.dispatch({});await d.dispatch({});await d.dispatch({});assert.equal(runs,1);assert.equal(execution,'e');
 const control=new CloudRunControl(config,()=>{throw Error('must not fetch');});await assert.rejects(control.api('projects/production/locations/us-east5/jobs/other:run'));
});
test('safe logs drop credentials / lease / metadata / raw errors',()=>{
 let row;logEvent(x=>row=x,{job_id:'safe',stage:'test',lease_token:'secret',Authorization:'secret',password:'secret',raw_error:'secret'});assert.deepEqual(row,{job_id:'safe',stage:'test'});
});
