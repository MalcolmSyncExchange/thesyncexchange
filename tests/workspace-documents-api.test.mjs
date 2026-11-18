import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import*as zod from'zod';
import{loadAuthModule}from'./helpers/auth-system-harness.mjs';
const actor='11111111-1111-4111-8111-111111111111',submission='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
class UploadError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const bytes=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nstartxref\n0\n%%EOF\n');
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(options={}){const calls=[],state={privileges:0,reads:0,uploads:0,access:0};const client={},admin={storage:{from:bucket=>({upload:async(path,b,settings)=>{state.uploads++;calls.push({bucket,path,upsert:settings.upsert});return {error:options.lostResponse?{message:'PRIVATE_PROVIDER_DIAGNOSTIC'}:null};}})}};
 const locator={id,submission_id:submission,bucket:'rights-evidence',path:actor+'/'+submission+'/'+id+'/original',bytes:bytes.length,state:options.reserved?'reserved':'received',sha256:options.reserved?null:hash(bytes),version:options.reserved?null:'v1'};
 const modules={'server-only':{},zod,'node:crypto':{createHash},'./uploads':{UploadError,mediaActor:async isAdmin=>{if(options.actorDenied||options.adminDenied&&isAdmin)throw new UploadError(403,'ACCESS_DENIED');return {client,user:{id:actor}};},mediaRpc:async(c,name,args)=>{calls.push({name,args});if(name==='media_workspace_document_access'){state.access++;if(options.denied||options.revoked&&state.access>1)throw new UploadError(403,'ACCESS_DENIED');return {...locator,...options.locator,...options.versionChanged&&state.access>1?{version:'v2'}:{}};}return {id,received:true};}},'@/services/security/rate-limit':{consumeRateLimit:async()=>({status:options.rateDenied?'rate-limited':'allowed'})},'@/services/supabase/admin':{createAdminSupabaseClient:()=>{state.privileges++;return admin;}},'@/services/rights/document-content':{inspectRightsDocument:async b=>{if(options.malformed)throw Error('PRIVATE_CONTENT');return hash(b);}},'@/services/delivery/server':{readPrivateArtifact:async()=>{state.reads++;if(options.storageFailure)throw Error('PRIVATE_STORAGE');return options.corrupt?Buffer.alloc(bytes.length,0):bytes;}}};
 const service=loadAuthModule('services/media/workspace-documents.ts',modules);const route=loadAuthModule('app/api/media/documents/[id]/route.ts',{zod,'@/lib/env':{env:{appUrl:'http://127.0.0.1:3333'}},'@/services/media/uploads':{UploadError},'@/services/media/workspace-documents':service});
 return {state,calls,service,route};
}
const put=(body=bytes,headers={})=>new Request('http://127.0.0.1:3333/api/media/documents/'+id,{method:'PUT',headers:{origin:'http://127.0.0.1:3333','content-type':'application/octet-stream',...headers},body});
const params={params:Promise.resolve({id})};
test('agreement PUT rechecks canonical ownership and content before privilege; duplicate or uncertain transfers never overwrite originals',async()=>{
 for(const lostResponse of [false,true]){const f=fixture({reserved:true,lostResponse});assert.equal((await f.route.PUT(put(),params)).status,200);assert.equal(f.state.privileges,1);assert.equal(f.state.access,3);assert.equal(f.state.uploads,1);assert.equal(f.calls.find(x=>'upsert'in x).upsert,false);assert.equal(f.calls.at(-1).name,'media_workspace_document_received');assert.equal(f.calls.at(-1).args.p_actor,actor);}
 const received=fixture();assert.equal((await received.route.PUT(put(),params)).status,200);assert.equal(received.state.uploads,0);
});
test('foreign origins, malformed headers, IDs and untrusted content never create a privileged Storage client',async()=>{
 for(const opts of [{denied:true},{actorDenied:true},{malformed:true},{rateDenied:true}]){const f=fixture(opts);assert.ok((await f.route.PUT(put(),params)).status>=400);assert.equal(f.state.privileges,0);}
 for(const request of [put(bytes,{origin:'https://foreign.example.test'}),put(bytes,{'content-type':'text/html'}),put(Buffer.alloc(bytes.length+1))]){const f=fixture();assert.ok((await f.route.PUT(request,params)).status>=400);assert.equal(f.state.privileges,0);}
 const invalid=fixture();assert.equal((await invalid.route.PUT(put(),{params:Promise.resolve({id:'../other'})})).status,400);
});
test('revocation, wrong bucket, object replacement, corrupted bytes and failed transfers cannot deliver private agreements',async()=>{
 for(const options of [{denied:true},{revoked:true},{versionChanged:true},{corrupt:true},{storageFailure:true},{locator:{bucket:'submission-source'}},{locator:{bytes:3000001}},{locator:{path:'unowned/path'}}]){const f=fixture(options);const r=await f.route.GET(new Request('http://127.0.0.1:3333/api/media/documents/'+id),params);assert.ok(r.status>=400);assert.doesNotMatch(await r.text(),/PRIVATE_|PROVIDER|STORAGE/);}
});
test('download is an attachment with sandbox/no-store/nosniff and preserves audited Admin MFA boundary',async()=>{
 const f=fixture(),r=await f.route.GET(new Request('http://127.0.0.1:3333/api/media/documents/'+id),params);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/octet-stream');assert.match(r.headers.get('content-disposition'),/^attachment/);assert.match(r.headers.get('content-security-policy'),/^sandbox/);assert.match(r.headers.get('cache-control'),/no-store/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);assert.equal(f.state.access,2);assert.deepEqual(f.calls.filter(x=>x.name==='media_workspace_document_audit').map(x=>x.args.p_outcome),['authorized','delivered']);
 const denied=fixture({adminDenied:true});assert.equal((await denied.route.GET(new Request('http://127.0.0.1:3333/api/media/documents/'+id+'?admin=true'),params)).status,403);assert.equal(denied.state.reads,0);
});
