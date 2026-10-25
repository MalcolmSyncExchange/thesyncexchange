import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {readStorageMultipart} from '../services/storage/upload-request.ts';
import {checkoutNextProcesses} from '../scripts/build-guard.mjs';
import {selectBuyerCustomer} from '../lib/billing-customer.ts';
import {loadAuthModule,authHarness,form,locationOf} from './helpers/auth-system-harness.mjs';
import * as validation from '../lib/validation/track-submission.ts';
const storage=loadAuthModule('lib/storage.ts',{'@/lib/env':{env:{},hasSupabaseEnv:false}});
const owner='11111111-1111-4111-8111-111111111111';

test('System14 traversal and malformed scopes fail before Storage URL construction',()=>{
 for(const scope of ['../victim','../../agreements/victim','%2e%2e%2fvictim','a/b','a\\b','https://victim','..','.', 'a?x=1','a#x','a'.repeat(129),'a\u0000b'])assert.throws(()=>storage.buildTrackAssetPath({userId:owner,scope,kind:'audio',fileName:'Synthetic.wav'}));
 for(const scope of ['uploads','draft-123','a_b',owner])assert.match(storage.buildTrackAssetPath({userId:owner,scope,kind:'audio',fileName:'Synthetic.wav'}),new RegExp('^'+owner+'/'+scope+'/audio/'));
 assert.throws(()=>storage.buildTrackAssetPath({userId:'../victim',scope:'uploads',kind:'audio',fileName:'Synthetic.wav'}));
});

test('System14 installed Storage SDK demonstrates why legacy dot-segment input must be rejected',async()=>{
 const requests=[];const client=createClient('http://127.0.0.1:54321','SYNTHETIC_LOCAL_ANON_KEY',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input)=>{requests.push(new Request(input).url);return Response.json({url:'/object/upload/sign/track-audio/Synthetic?token=SYNTHETIC'});}}});
 await client.storage.from('track-audio').createSignedUploadUrl(owner+'/../victim/audio/Synthetic.wav');
 assert.equal(new URL(requests[0]).pathname,'/storage/v1/object/upload/sign/track-audio/victim/audio/Synthetic.wav');
 assert.equal(requests[0].includes(owner),false);
});

test('System14 customer ownership rejects recycled emails, missing binding, ambiguous pages and duplicates',()=>{
 const mine={id:'cus_mine',metadata:{supabaseUserId:owner}},other={id:'cus_other',metadata:{supabaseUserId:'different'}};
 assert.equal(selectBuyerCustomer({data:[other,mine]},owner).id,'cus_mine');
 assert.equal(selectBuyerCustomer({data:[other,{id:'cus_legacy',metadata:{}}]},owner),null);
 assert.throws(()=>selectBuyerCustomer({data:[mine,{...mine,id:'cus_duplicate'}]},owner));
 assert.throws(()=>selectBuyerCustomer({data:[mine],has_more:true},owner));
});

test('System14 patched validation and resolver reject oversized collections and preserve form errors',async()=>{
 const schema=z.object({items:z.array(z.string()).max(3)});
 const large=new Array(50000).fill(null);assert.equal(schema.safeParse({items:large}).success,false);
 const resolved=await zodResolver(schema)({items:large},{},{criteriaMode:'firstError',shouldUseNativeValidation:false,fields:{}});assert.ok(resolved.errors.items);assert.deepEqual(resolved.values,{});
 assert.equal(validation.rightsHolderSchema.safeParse({name:'Synthetic',email:'synthetic@fixture.invalid',roleType:'forged',ownershipPercent:100}).success,false);
});

test('System14 lockfile and installed tree retain targeted patched transitive versions',()=>{
 const lock=JSON.parse(readFileSync('package-lock.json'));for(const [path,p]of Object.entries(lock.packages)){
  if(/node_modules\/zod$/.test(path))assert.equal(p.version,'4.6.6',path);
  if(/node_modules\/brace-expansion$/.test(path))assert.ok(['1.1.21','5.0.12'].includes(p.version),path);
  if(/node_modules\/source-map-js$/.test(path))assert.equal(p.version,'1.2.2',path);
  if(/node_modules\/postcss-selector-parser$/.test(path))assert.equal(p.version,'7.1.6',path);
 }
});

test('System14 ordinary sessions cannot use the recovery action, proofs are consumed before provider mutation',async()=>{
 const request=form({password:'SyntheticPassword!123',confirmPassword:'SyntheticPassword!123'});
 const ordinary=authHarness();assert.equal((await locationOf(()=>ordinary.actions.updatePasswordAction(request))).pathname,'/forgot-password');assert.equal(ordinary.state.calls.includes('updateUser'),false);
 const recovered=authHarness({recovery:true});assert.equal((await locationOf(()=>recovered.actions.updatePasswordAction(request))).pathname,'/login');assert.ok(recovered.state.calls.indexOf('consumeRecovery')<recovered.state.calls.indexOf('updateUser'));
 const failed=authHarness({recovery:true,updateFails:true});await locationOf(()=>failed.actions.updatePasswordAction(request));await locationOf(()=>failed.actions.updatePasswordAction(request));assert.equal(failed.state.calls.filter(c=>c==='updateUser').length,1);
});

test('System14 existing sessions, route hints, code links and empty OTP responses cannot mint recovery',async()=>{
 for(const params of ['code=SYNTHETIC&type=recovery','token_hash=SYNTHETIC&type=signup&next=/reset-password']){const h=authHarness();const response=await h.callback().GET(new Request('http://127.0.0.1:3333/auth/confirm?'+params));assert.equal(new URL(response.headers.get('location')).pathname,'/forgot-password');assert.equal(response.writes.get('tse-recovery-127')?.value,'');}
 for(const options of [{otpMissingData:true},{mintFails:true}]){const h=authHarness(options);const response=await h.callback().GET(new Request('http://127.0.0.1:3333/auth/confirm?type=recovery&token_hash=SYNTHETIC'));assert.equal(new URL(response.headers.get('location')).pathname,'/forgot-password');}
 const h=authHarness();const response=await h.callback().GET(new Request('http://127.0.0.1:3333/auth/confirm?type=recovery&token_hash=SYNTHETIC'));assert.equal(response.writes.get('tse-recovery-127')?.httpOnly,true);assert.equal(response.writes.get('tse-recovery-127')?.maxAge,900);assert.doesNotMatch(response.headers.get('location'),/SYNTHETIC|aaaa/);
});

test('System14 build guard ignores unrelated checkout listeners and catches this checkout on any port',async()=>{
 const elsewhere=mkdtempSync(join(tmpdir(),'tse-build-guard-'));const children=[];
 try{
  for(const [cwd,title] of [[elsewhere,"next-server"],[process.cwd(),"next-server"],[process.cwd(),"next-build"]]){const child=spawn(process.execPath,['-e',`process.title='${title} (synthetic)';process.send('ready');setInterval(()=>{},1000)`],{cwd,stdio:['ignore','ignore','ignore','ipc']});children.push(child);await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);});}
  const found=checkoutNextProcesses(process.cwd());assert.equal(found.includes(children[0].pid),false);assert.equal(found.includes(children[1].pid),true);assert.equal(found.includes(children[2].pid),true);
  assert.throws(()=>checkoutNextProcesses(process.cwd(),(bin)=>{if(bin==='ps')return `${children[0].pid} next-build (synthetic)`;throw Error('Synthetic inspection failure');}));
 }finally{await Promise.all(children.map(child=>new Promise(resolve=>{child.once('exit',resolve);child.kill();})));rmSync(elsewhere,{recursive:true,force:true});}
 assert.throws(()=>checkoutNextProcesses(process.cwd(),()=>{throw Object.assign(Error('missing'),{code:'ENOENT'});}));
 assert.equal(spawnSync(process.execPath,['scripts/build-guard.mjs'],{encoding:'utf8'}).status,0);
});

test('System14 HTTP hardening is compatible with application scripts and private APIs',async()=>{
 const {default:config}=await import('../next.config.mjs');const rules=await config('phase-production-build').headers();const h=Object.fromEntries(rules[0].headers.map(({key,value})=>[key,value]));assert.equal(h['X-Frame-Options'],'DENY');assert.equal(h['X-Content-Type-Options'],'nosniff');assert.equal(h['Content-Security-Policy'],undefined);
 const maintenance=await import('../lib/maintenance-mode.mjs');const a=authHarness();const middleware=loadAuthModule('middleware.ts',{...a.modules,'@/lib/maintenance-mode.mjs':maintenance});
 for(const path of ['/','/login','/api/rights/documents/SYNTHETIC']){const url=new URL(path,'http://127.0.0.1:3333');const response=await middleware.middleware({url:url.href,nextUrl:url,cookies:a.cookieStore,method:'GET'});if(path.startsWith('/api'))assert.equal(response.headers.get('content-security-policy'),null);else{assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');}}
 assert.match(rules[1].headers[0].value,/private, no-store/);
});


test('System14 legacy multipart requests reject oversized and malformed transport before allocation',async()=>{
 const form=new FormData();form.set('scope','uploads');form.set('file',new File(['SYNTHETIC'],'Synthetic.wav'));
 const good=new Request('http://127.0.0.1/upload',{method:'POST',body:form});const parsed=await readStorageMultipart(good);assert.equal(parsed.get('scope'),'uploads');assert.equal(parsed.get('file').size,9);
 const huge=new Request('http://127.0.0.1/upload',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=synthetic','content-length':String(52*1024*1024)},body:'SYNTHETIC'});await assert.rejects(readStorageMultipart(huge),e=>e.status===413);assert.equal(huge.bodyUsed,false);
 await assert.rejects(readStorageMultipart(new Request('http://127.0.0.1/upload',{method:'POST',body:'SYNTHETIC'})),e=>e.status===415);
 assert.deepEqual(checkoutNextProcesses(process.cwd(),()=> '1 /bin/zsh -lc echo next-build; echo node /other/next dev'),[]);
});

test('System14 actual signed-upload route rejects foreign Origin, oversized JSON and traversal before privilege',async()=>{
 const origin='http://127.0.0.1:3333',env={appUrl:origin,demoMode:false};let privileged=0;
 const requestModule=loadAuthModule('services/orders/payment-request.ts',{'@/lib/env':{env}});
 const modules={
  '@/services/orders/payment-request':requestModule,'@/services/auth/security':{hasPrivilegedAssurance:async()=>false},'next/server':{NextResponse:{json:Response.json}},
  '@/lib/env':{env,hasSupabaseEnv:true},'@/lib/storage':storage,
  '@/services/auth/user-profiles':{selectUserProfileCompat:async()=>({data:{role:'artist'}})},
  '@/services/supabase/server':{createServerSupabaseClient:async()=>({auth:{getUser:async()=>({data:{user:{id:owner}}})}})},
  '@/services/supabase/admin':{createAdminSupabaseClient:()=>{privileged++;return{storage:{from:()=>({createSignedUploadUrl:async()=>({data:{token:'SYNTHETIC'},error:null})})}};}},
  '@/services/storage/assets':{assertStorageUploadMetadata:()=>{}},'@/services/security/rate-limit':{consumeRateLimit:async()=>({}),rateLimitErrorResponse:()=>null},
  '@/lib/maintenance-mode.mjs':{resolveMaintenanceMode:()=>({blocksApplication:false})}
 };
 const route=loadAuthModule('app/api/storage/upload-url/route.ts',modules);
 const body={kind:'audio',scope:'uploads',fileName:'Synthetic.wav',fileSize:100,userId:'forged-victim'};
 const request=(value,o=origin)=>new Request(origin+'/api/storage/upload-url',{method:'POST',headers:{origin:o,'content-type':'application/json'},body:JSON.stringify(value)});
 assert.equal((await route.POST(request(body,'https://untrusted.invalid'))).status,403);
 assert.equal((await route.POST(request({...body,scope:'../victim'}))).status,400);
 assert.equal((await route.POST(request({...body,padding:'x'.repeat(9000)}))).status,413);assert.equal(privileged,0);
 const valid=await route.POST(request(body));assert.equal(valid.status,200);assert.equal(privileged,1);assert.match((await valid.json()).path,new RegExp('^'+owner+'/uploads/audio/'));
});
