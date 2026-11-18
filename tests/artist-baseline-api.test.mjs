import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { source, ids } from './helpers/artist-baseline-db.mjs';
import { isBuyerCatalogEligible } from '../lib/buyer-catalog-eligibility.ts';
const require=createRequire(import.meta.url);
function load(path,mocks={}) {
 const loadedModule={exports:{}};
 vm.runInNewContext(ts.transpileModule(source(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  module:loadedModule,exports:loadedModule.exports,FormData,Response,Request,URL,Error,console,Buffer,process,TextDecoder,setTimeout,clearTimeout,
  require:name=>name in mocks?mocks[name]:name.startsWith('@/')?{}:require(name)
 },{filename:path});
 return loadedModule.exports;
}
function harness({user={id:ids.buyer},role='buyer',owner=ids.buyer,pending=false,accepted=true}={}) {
 const events=[];
 const client={rpc:async name=>{events.push(`rpc:${name}`);return{data:name==='auth_session_is_active',error:null};},auth:{getUser:async()=>{events.push('auth');return{data:{user}};}},from(table){
  let op='read';const q={select:()=>q,eq:()=>q,update:()=>{op='write';return q;},insert:()=>{op='write';return q;},
   maybeSingle:async()=>{events.push(`${op}:${table}`);return{data:{id:ids.order,slug:'fixture',buyer_user_id:owner,status:pending?'pending':'fulfilled'},error:null};},
   then(resolve){events.push(`${op}:${table}`);return Promise.resolve({data:null,error:null}).then(resolve);}};return q;
 }};
 const mocks={
  'next/server':{NextResponse:{json:(x,o)=>Response.json(x,o),redirect:x=>new Response(null,{status:307,headers:{location:x}})}},
  'next/cache':{revalidatePath:()=>events.push('revalidate')},'next/headers':{cookies:async()=>({get:()=>null})},
  '@/lib/env':{hasSupabaseEnv:true,env:{demoMode:false,appUrl:'https://fixture.invalid'},shouldUseDemoData:()=>false},
  '@/services/supabase/server':{createServerSupabaseClient:async()=>client},
  '@/services/supabase/admin':{createAdminSupabaseClient:()=>{events.push('service-client');return client;}},
  '@/services/supabase/privileged':{createPrivilegedSupabaseClient:async()=>{events.push('service-client');return client;}},
  '@/lib/maintenance-mode.mjs':{resolveMaintenanceMode:()=>({blocksApplication:false})},
  '@/lib/payment-mode.mjs':{getStripeCheckoutSessionMode:()=> 'test'},
  '@/services/orders/payment-request':load('services/orders/payment-request.ts',{'@/lib/env':{env:{appUrl:'https://fixture.invalid'}}}),
  '@/services/auth/security':{hasPrivilegedAssurance:async()=>true},
  '@/services/auth/user-profiles':{selectUserProfileCompat:async()=>{events.push('role');return{data:{role},error:null};}},
  '@/services/supabase/schema-compat':{isMissingColumnError:()=>false,warnSchemaFallbackOnce:()=>{}},
  '@/services/generated-licenses/server':{loadGeneratedLicenseByOrderId:async()=>{events.push('read:license');return pending?null:{status:'generated',pdf_storage_path:'fixture/agreement.pdf',generated_at:'2026-09-15',agreement_number:'FIXTURE'};},markGeneratedLicenseDownloaded:async()=>events.push('mark-download')},
  '@/services/orders/activity':{appendOrderActivityLog:async()=>events.push('activity')},
  '@/services/agreements/server':{createAgreementSignedUrl:async()=>{events.push('sign');return'https://fixture.invalid/agreement';},downloadAgreementArtifact:async()=>{events.push('bytes');return'fixture';}},
  '@/services/orders/checkout-pricing':{loadTrustedCheckoutDetails:async()=>{events.push('read:checkout');return{order:{id:ids.order,buyer_user_id:owner,track_id:ids.live,license_type_id:ids.license,status:'pending',amount_cents:5000,currency:'USD'},track:{id:ids.live,title:'Fixture',slug:'fixture',status:'approved'},licenseType:{id:ids.license,slug:'digital-campaign',name:'Digital',active:true,default_price_cents:5000},licenseOption:{track_id:ids.live,license_type_id:ids.license,price_cents:5000,active:true},amountCents:5000,currency:'USD',trackTitle:'Fixture',trackSlug:'fixture',licenseName:'Digital'};},getStoredOrderPricingMismatch:()=>({amountMismatch:false,currencyMismatch:false})},
  '@/services/analytics/checkout':{captureAcceptedLicense:async()=>events.push('analytics:license'),captureCheckoutStarted:async()=>events.push('analytics:checkout')},
  '@/services/analytics/actor':{captureForUser:async()=>events.push('analytics:failure')},
  '@/lib/server-env':{
   assertStripeServerConfiguration:()=>{},
   getPaymentRuntimeConfiguration:()=>({paymentMode:'test',releaseMode:'preview',livePaymentsEnabled:false}),
   getPaymentActivityMetadata:()=>({paymentMode:'test',releaseMode:'preview',commercialRightsGranted:false})
  },
  '@/services/security/rate-limit':{consumeRateLimit:async()=>({allowed:true}),rateLimitErrorResponse:()=>null},
  '@/services/licensing/purchases':{assertAcceptedPurchase:async()=>{events.push('legal-source-check');if(!accepted)throw Error('Source/acceptance missing');return{snapshot:{amountCents:5000,currency:'USD',buyer:{userId:ids.buyer},track:{id:ids.live,title:'Fixture'},license:{id:ids.license,slug:'digital-campaign',name:'Digital'}}};}},
  '@/services/orders/checkout-recovery':{hasFrozenCheckoutAttempt:async()=>false},
  '@/services/purchase-completion/server':{preparePurchaseCompletionCheckout:async()=>({enabled:false})},
  '@/services/stripe/server':{createStripeCheckoutSession:async()=>{events.push('stripe');return{id:'cs_test_fixture',livemode:false,client_reference_id:ids.order,url:'https://checkout.stripe.com/c/pay/cs_test_fixture'};}}
 };
 return{events,mocks};
}
const request=()=>new Request('https://fixture.invalid/api/checkout',{method:'POST',headers:{'content-type':'application/json',origin:'https://fixture.invalid'},body:JSON.stringify({orderId:ids.order})});
for(const [label,opts,status] of [['anonymous',{user:null},401],['wrong owner',{owner:ids.a},403],['pending own order',{pending:true},409],['authorized buyer',{},303],['platform admin',{role:'admin',owner:ids.a},303]]) test(`agreement download: ${label}`,async()=>{
 const h=harness(opts),{handleAgreementAccess}=load('services/agreements/access.ts',h.mocks);
 const response=await handleAgreementAccess(new Request('https://fixture.invalid',{method:'POST',headers:{origin:'https://fixture.invalid'}}),ids.order,true);
 assert.equal(response.status,status);
 assert.equal(h.events.includes('sign'),status===303);
 if(status===303) assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0');
 if(status===401) assert.ok(!h.events.includes('service-client'));
});
test('forbidden agreement request denies before privileged or license retrieval',async()=>{
 const h=harness({owner:ids.a}),{handleAgreementAccess}=load('services/agreements/access.ts',h.mocks);
 assert.equal((await handleAgreementAccess(new Request('https://fixture.invalid',{method:'POST',headers:{origin:'https://fixture.invalid'}}),ids.order,true)).status,403);
 assert.ok(!h.events.includes('read:license'));assert.ok(!h.events.includes('service-client'));assert.ok(!h.events.includes('sign'));
});
for(const [label,opts,status] of [['anonymous',{user:null},401],['artist role',{role:'artist'},403],['foreign order',{owner:ids.a},404],['missing accepted source',{accepted:false},409],['own order',{},200]]) test(`checkout entry: ${label}`,async()=>{
 const h=harness({...opts,pending:true}),{POST}=load('app/api/checkout/route.ts',h.mocks);
 const response=await POST(request());assert.equal(response.status,status);
 assert.equal(h.events.includes('stripe'),status===200);
 assert.equal(h.events.includes('analytics:checkout'),status===200);
 if(status===200) assert.ok(h.events.indexOf('stripe')<h.events.indexOf('analytics:checkout')); // Accepted snapshot is immutable; checkout must not rewrite order pricing.
 if([401,403].includes(status)) assert.ok(!h.events.includes('service-client'));
 if(status===200)assert.ok(h.events.indexOf('role')<h.events.indexOf('legal-source-check')&&h.events.indexOf('legal-source-check')<h.events.indexOf('stripe'));
});
for(const action of ['updateTrackStatusAction','updateOrderStatusAction']) test(`${action} denies before privileged context retrieval`,async()=>{
 const h=harness({role:'buyer'}),actions=load('services/admin/actions.ts',h.mocks);
 const form=new FormData();form.set('trackId',ids.live);form.set('orderId',ids.order);form.set('status','approved');
 await assert.rejects(actions[action](form),/Admin access/);
 assert.ok(h.events.includes('auth'));assert.ok(!h.events.includes('service-client'));assert.ok(!h.events.some(x=>x.startsWith('read:')));
 assert.ok(!h.events.some(x=>x.startsWith('write:')));
});
test('buyer compatibility catalog delegates to the authenticated bounded marketplace RPC without privileged reads',async()=>{
 const events=[];
 const publicTrack={id:ids.live,artist_id:'public-artist-id',title:'Fixture',status:'approved',audio_file_url:'/api/marketplace/tracks/'+ids.live+'/preview',rights_holders:[{name:'Credit'}],license_options:[{active:true,price_override:50}]};
 const client={auth:{getUser:async()=>({data:{user:{id:ids.buyer}}})},rpc:async(name,args)=>{events.push({name,args});assert.equal(name,'marketplace_search');return{data:{items:[publicTrack],total:1,page:1,page_size:20,page_count:1},error:null};}};
 const authorization=load('services/auth/authorization.ts',{
  '@/services/supabase/server':{createServerSupabaseClient:async()=>client},
  '@/services/auth/user-profiles':{selectUserProfileCompat:async()=>({data:{role:'buyer'},error:null})}
 });
 // Use the real marketplace adapter and parameter validation, not a fabricated
 // replacement for the retired direct buyer_catalog_public query.
 client.rpc=async(name,args)=>{events.push({name,args});if(name==='auth_session_is_active')return{data:true,error:null};assert.equal(name,'marketplace_search');return{data:{items:[publicTrack],total:1,page:1,page_size:20,page_count:1},error:null};};
 const marketplace=load('services/buyer/marketplace.ts',{
  'server-only':{},'@/services/auth/authorization':authorization,
  '@/lib/env':{shouldUseDemoData:()=>false},
  '@/lib/buyer-marketplace':load('lib/buyer-marketplace.ts'),'./contract':{},
 });
 const {getBuyerCatalogTracks}=load('services/buyer/queries.ts',{
  '@/services/buyer/marketplace':marketplace,
  '@/services/supabase/privileged':{createPrivilegedSupabaseClient:()=>{throw Error('Privileged catalog access forbidden');}},
  '@/lib/buyer-catalog-eligibility':{isBuyerCatalogEligible}
 });
 const result=await getBuyerCatalogTracks(ids.buyer);assert.deepEqual(JSON.parse(JSON.stringify(result)),[publicTrack]);
 assert.equal(events.filter(e=>e.name==='marketplace_search').length,1);
 // Canonical user scope is checked by the real authorization adapter; the RPC
 // itself enforces the active-session database guard.
 await assert.rejects(getBuyerCatalogTracks(ids.a),/Unauthorized account scope/);
 await assert.rejects(getBuyerCatalogTracks(),/scope/);
 for(const key of ['audio_file_path','artist_user_id','approved_by','email','user_id'])assert.ok(!JSON.stringify(result).includes('"'+key+'"'));
});
