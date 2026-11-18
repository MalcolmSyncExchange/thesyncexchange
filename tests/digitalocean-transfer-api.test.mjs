import test from 'node:test';import assert from 'node:assert/strict';import {createHash,generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {loadAuthModule} from './helpers/auth-system-harness.mjs';
import {verifyTransfer,transferBytes} from '../services/media-broker/do-transfer-proof.mjs';
const {privateKey,publicKey}=generateKeyPairSync('ed25519'),publicPem=publicKey.export({format:'pem',type:'spki'});const bytes=Buffer.from('synthetic output');const hash=createHash('sha256').update(bytes).digest('hex');
class UploadError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const proof=operation=>({version:1,host_id:'620470021',run_id:randomUUID(),boot_id:randomUUID(),job_id:randomUUID(),lease_epoch:1,lease_token:randomUUID(),nonce:randomUUID(),operation,bytes:operation==='input'?null:bytes.length,sha256:operation==='input'?null:hash,issued_at:Date.now()-1,expires_at:Date.now()+20000});
function fixture(options={}){let privileges=0,uploads=0,checks=0,reads=0;const loc={bucket:'submission-derived',path:'owner/submission/asset/generated',bytes:bytes.length,sha256:hash,job_type:'preview_generation',output:null};
 const admin={storage:{from:()=>({upload:async(_p,_b,o)=>{uploads++;assert.equal(o.upsert,false);return {error:options.lostResponse?{}:null};},createSignedUrl:async()=>({data:{signedUrl:'https://synthetic.example.test/signed'},error:null})})}};
 const modules={'server-only':{},'node:crypto':{createHash},'@/services/media-broker/do-transfer-proof.mjs':{verifyTransfer},'@/services/supabase/admin':{createAdminSupabaseClient:()=>{privileges++;return admin;}},'./uploads':{UploadError,mediaRpc:async(_c,name,args)=>{assert.equal(name,'media_do_transfer');checks++;if(options.denied||options.revoked&&checks>1||options.revokedAfterWrite&&checks>2)throw new UploadError(403,'DENIED');return options.locator||{...loc,output:checks>2||options.existing?{object_id:options.rotated&&checks>2?'replaced':'object',version:options.rotated&&checks>2?'v2':'v1',bytes:bytes.length}:null};}},'@/services/delivery/server':{readPrivateArtifact:async()=>{reads++;if(options.readFailure)throw Error('PRIVATE_PROVIDER_DIAGNOSTIC');return options.corrupt?Buffer.alloc(bytes.length):bytes;}}};
 const service=loadAuthModule('services/media/do-transfer.ts',modules,{process:{env:{MEDIA_DO_HOST_PUBLIC_KEY:options.missingKey?undefined:publicPem}}});const route=loadAuthModule('app/api/media/worker-transfer/route.ts',{'@/services/media/do-transfer':service,'@/services/media/uploads':{UploadError}});
 return {route,state:()=>({privileges,uploads,checks,reads})};}
function request(p=proof('output'),body=bytes,signature=sign(null,transferBytes(p),privateKey).toString('base64')){return new Request('https://thesyncexchange.com/api/media/worker-transfer',{method:'POST',headers:{'content-type':'application/octet-stream','x-tse-proof':JSON.stringify(p),'x-tse-signature':signature},body});}
test('invalid or absent host proof never creates a privileged client',async()=>{
 for(const options of [{missingKey:true},{}]){const f=fixture(options);const p=proof('output');const r=await f.route.POST(request(p,bytes,'invalid'));assert.equal(r.status,403);assert.equal(f.state().privileges,0);}
 const f=fixture(),p=proof('output');p.expires_at=Date.now()-1;assert.equal((await f.route.POST(request(p))).status,403);assert.equal(f.state().privileges,0);
});
test('output insert is create-only, byte checked and reauthorized before and after Storage; lost responses reconcile safely',async()=>{
 for(const lostResponse of [false,true]){const f=fixture({lostResponse}),r=await f.route.POST(request());assert.equal(r.status,200);const value=await r.json();assert.equal(value.sha256,hash);assert.equal(value.version,'v1');assert.deepEqual(f.state(),{privileges:1,uploads:1,checks:3,reads:1});assert.match(r.headers.get('cache-control'),/no-store/);}
});
test('wrong bytes, ownership denial, revocation, corrupt readback and wrong paths never return a successful transfer',async()=>{
 for(const options of [{denied:true},{revoked:true},{corrupt:true},{readFailure:true},{locator:{bucket:'public',path:'foreign',bytes:bytes.length}}]){const f=fixture(options),r=await f.route.POST(request());assert.ok(r.status>=400);assert.doesNotMatch(await r.text(),/PRIVATE|PROVIDER|signedUrl|token/);}
 const f=fixture();assert.ok((await f.route.POST(request(proof('output'),Buffer.alloc(bytes.length)))).status>=400);assert.equal(f.state().uploads,0);
});
test('input authorization returns only a short-lived signed URL, never key material or arbitrary destinations',async()=>{
 const f=fixture({locator:{bucket:'submission-source',path:'owner/submission/asset/original',bytes:100,sha256:null,object_id:'object',version:'v1'}}),p=proof('input');const r=await f.route.POST(request(p,undefined));assert.equal(r.status,200);assert.deepEqual(Object.keys(await r.json()).sort(),['bytes','sha256','url']);assert.equal(f.state().uploads,0);
});

test('revocation after immutable private upload rejects acceptance and never returns its locator',async()=>{
 const f=fixture({revokedAfterWrite:true}),response=await f.route.POST(request());
 assert.equal(response.status,403);assert.equal(f.state().uploads,1);assert.equal(f.state().checks,3);
 assert.doesNotMatch(await response.text(),/object|v1|sha256|signedUrl|token/);
});
