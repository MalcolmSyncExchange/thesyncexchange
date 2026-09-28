import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { source, ids } from './helpers/artist-baseline-db.mjs';
const require=createRequire(import.meta.url);
function load(path,mocks={}) {
 const loadedModule={exports:{}};
 vm.runInNewContext(ts.transpileModule(source(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  module:loadedModule,exports:loadedModule.exports,FormData,Response,Request,URL,Error,console,Buffer,
  require:name=>name in mocks?mocks[name]:name.startsWith('@/')?{}:require(name)
 },{filename:path});
 return loadedModule.exports;
}
function harness({user={id:ids.buyer},role='buyer',owner=ids.buyer,pending=false}={}) {
 const events=[];
 const client={auth:{getUser:async()=>{events.push('auth');return{data:{user}};}},from(table){
  let op='read';const q={select:()=>q,eq:()=>q,update:()=>{op='write';return q;},insert:()=>{op='write';return q;},
   maybeSingle:async()=>{events.push(`${op}:${table}`);return{data:{id:ids.order,slug:'fixture',buyer_user_id:owner,status:pending?'pending':'fulfilled'},error:null};},
   then(resolve){events.push(`${op}:${table}`);return Promise.resolve({data:null,error:null}).then(resolve);}};return q;
 }};
 const mocks={
  'next/server':{NextResponse:{json:(x,o)=>Response.json(x,o),redirect:x=>new Response(null,{status:307,headers:{location:x}})}},
  'next/cache':{revalidatePath:()=>events.push('revalidate')},'next/headers':{cookies:async()=>({get:()=>null})},
  '@/lib/env':{hasSupabaseEnv:true,env:{demoMode:false}},
  '@/services/supabase/server':{createServerSupabaseClient:async()=>client},
  '@/services/supabase/admin':{createAdminSupabaseClient:()=>{events.push('service-client');return client;}},
  '@/services/supabase/privileged':{createPrivilegedSupabaseClient:async()=>{events.push('service-client');return client;}},
  '@/services/auth/user-profiles':{selectUserProfileCompat:async()=>{events.push('role');return{data:{role},error:null};}},
  '@/services/supabase/schema-compat':{isMissingColumnError:()=>false,warnSchemaFallbackOnce:()=>{}},
  '@/services/generated-licenses/server':{loadGeneratedLicenseByOrderId:async()=>{events.push('read:license');return pending?null:{status:'generated',pdf_storage_path:'fixture/agreement.pdf',generated_at:'2026-09-15',agreement_number:'FIXTURE'};},markGeneratedLicenseDownloaded:async()=>events.push('mark-download')},
  '@/services/orders/activity':{appendOrderActivityLog:async()=>events.push('activity')},
  '@/services/agreements/server':{createAgreementSignedUrl:async()=>{events.push('sign');return'https://fixture.invalid/agreement';},downloadAgreementArtifact:async()=>{events.push('bytes');return'fixture';}},
  '@/services/orders/checkout-pricing':{loadTrustedCheckoutDetails:async()=>{events.push('read:checkout');return{order:{id:ids.order,buyer_user_id:owner,status:'pending'},amountCents:5000,currency:'USD',trackTitle:'Fixture',trackSlug:'fixture',licenseName:'Digital'};},getStoredOrderPricingMismatch:()=>({amountMismatch:false,currencyMismatch:false})},
  '@/lib/server-env':{assertStripeServerConfiguration:()=>{}},
  '@/services/security/rate-limit':{consumeRateLimit:async()=>({allowed:true}),rateLimitErrorResponse:()=>null},
  '@/services/stripe/server':{createStripeCheckoutSession:async()=>{events.push('stripe');return{id:'cs_fixture',url:'https://fixture.invalid/checkout'};}}
 };
 return{events,mocks};
}
const request=()=>new Request('https://fixture.invalid/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orderId:ids.order})});
for(const [label,opts,status] of [['anonymous',{user:null},401],['wrong owner',{owner:ids.a},403],['pending own order',{pending:true},409],['authorized buyer',{},307],['platform admin',{role:'admin',owner:ids.a},307]]) test(`agreement download: ${label}`,async()=>{
 const h=harness(opts),{GET}=load('app/api/orders/[orderId]/agreement/route.ts',h.mocks);
 const response=await GET(new Request('https://fixture.invalid'),{params:Promise.resolve({orderId:ids.order})});
 assert.equal(response.status,status);
 assert.equal(h.events.includes('sign'),status===307);
 if(status===307) assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0');
 if(status===401) assert.ok(!h.events.includes('service-client'));
});
test('forbidden agreement request denies before privileged or license retrieval',async()=>{
 const h=harness({owner:ids.a}),{GET}=load('app/api/orders/[orderId]/agreement/route.ts',h.mocks);
 assert.equal((await GET(new Request('https://fixture.invalid'),{params:Promise.resolve({orderId:ids.order})})).status,403);
 assert.ok(!h.events.includes('read:license'));assert.ok(!h.events.includes('service-client'));assert.ok(!h.events.includes('sign'));
});
for(const [label,opts,status] of [['anonymous',{user:null},401],['artist role',{role:'artist'},403],['foreign order',{owner:ids.a},404],['own order',{},200]]) test(`checkout entry: ${label}`,async()=>{
 const h=harness(opts),{POST}=load('app/api/checkout/route.ts',h.mocks);
 const response=await POST(request());assert.equal(response.status,status);
 assert.equal(h.events.includes('stripe'),status===200);
 if([401,403].includes(status)) assert.ok(!h.events.includes('service-client'));
});
for(const action of ['updateTrackStatusAction','updateOrderStatusAction']) test(`${action} denies before privileged context retrieval`,async()=>{
 const h=harness({role:'buyer'}),actions=load('services/admin/actions.ts',h.mocks);
 const form=new FormData();form.set('trackId',ids.live);form.set('orderId',ids.order);form.set('status','approved');
 await assert.rejects(actions[action](form),/Admin access/);
 assert.ok(h.events.includes('auth'));assert.ok(!h.events.includes('service-client'));assert.ok(!h.events.some(x=>x.startsWith('read:')));
 assert.ok(!h.events.some(x=>x.startsWith('write:')));
});
test('actual serialized buyer catalog excludes injected private metadata while preserving eligible playback and licensing',async()=>{
 const events=[];const records={
  buyer_catalog_public:[{artist_id:"public-artist-id",artist_name:"Artist A",id:ids.live,artist_user_id:ids.a,title:'Fixture',slug:'fixture',status:'approved',preview_file_path:'public/preview.mp3',audio_file_path:'private/audio.wav',approved_by:ids.admin,track_license_options:[{active:true,price_cents:5000,license_types:{id:ids.license,active:true,default_price_cents:5000}}]}],
  track_license_options:[{track_id:ids.live,active:true,price_cents:5000,license_types:{id:ids.license,active:true,default_price_cents:5000}}],
  artist_profiles:[{user_id:ids.a,artist_name:'Artist A'}],track_rights_holders_public:[{id:'holder',track_id:ids.live,name:'Credit',ownership_percent:100}],favorites:[]
 };
 const client={auth:{getUser:async()=>({data:{user:{id:ids.buyer}}})},from(table){const q={select(fields){events.push({table,fields});return q;},eq(k,v){events.push({table,k,v});return q;},in:()=>q,order:()=>q,then(resolve){return Promise.resolve({data:records[table],error:null}).then(resolve);}};return q;}};
 const authMocks={
  '@/services/supabase/server':{createServerSupabaseClient:async()=>client},
  '@/services/auth/user-profiles':{selectUserProfileCompat:async()=>({data:{role:'buyer'},error:null})}
 };
 const authorization=load('services/auth/authorization.ts',authMocks);
 const {getBuyerCatalogTracks}=load('services/buyer/queries.ts',{
  '@/lib/env':{hasSupabaseEnv:true,env:{demoMode:false}},'@/lib/storage':{getPublicStorageUrl:()=>null,storageBuckets:{}},
  '@/services/supabase/privileged':{createPrivilegedSupabaseClient:async()=>client},
  '@/services/auth/authorization':authorization
 });
 const tracks=await getBuyerCatalogTracks(ids.buyer);assert.equal(tracks.length,1);
 assert.ok(events.some(e=>e.table==='buyer_catalog_public'&&e.fields.includes('artist_id')));
 const serialized=JSON.stringify(tracks);
 for(const field of ['audio_file_path','artist_user_id','approved_by','approved_at','payout_email','email','approval_status','user_id']) assert.ok(!serialized.includes(`"${field}"`),field);
 assert.equal(tracks[0].artist_id,'public-artist-id');assert.equal(tracks[0].preview_file_path,'public/preview.mp3');
 assert.equal(tracks[0].rights_holders[0].name,'Credit');assert.equal(tracks[0].license_options[0].price_override,50);
});
