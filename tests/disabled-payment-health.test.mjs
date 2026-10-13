import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as capabilities from '../lib/admin-v2/payment-readiness.ts';
import * as paymentMode from '../lib/payment-mode.mjs';
import * as maintenance from '../lib/maintenance-mode.mjs';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function load(file,imports,raw={}){const loadedModule={exports:{}};vm.runInNewContext(ts.transpileModule(source(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:loadedModule,exports:loadedModule.exports,process:{env:raw},AbortSignal,require:n=>{if(Object.hasOwn(imports,n))return imports[n];throw Error('Unexpected import '+n);}});return loadedModule.exports;}
const off=()=>Object.fromEntries(Object.keys(capabilities.CAPABILITY_LABELS).map(k=>[k,false]));
const pure=load('lib/health/payment-readiness.ts',{'@/lib/admin-v2/payment-readiness':capabilities});
function harness(options={}){
 const raw={SYNC_EXCHANGE_PAYMENT_MODE:'test',SUPABASE_SERVICE_ROLE_KEY:'unit-only-not-a-real-credential',SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED:'false',SYNC_EXCHANGE_BILLING_PORTAL_ENABLED:'false',ANALYTICS_ENABLED:'false',...options.raw};
 const target=options.target||'preview';const appEnv={env:{demoMode:false,stripePublishableKey:raw.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,appUrl:'https://unit.invalid'},getDeploymentTarget:()=>target,getMissingCoreEnvKeys:()=>options.missingCore||[],getPublicEnvironmentDiagnostics:()=>({deploymentTarget:target,issues:options.issues||[]}),hasSupabaseEnv:true};
 const server=load('lib/server-env.ts',{'@/lib/env':appEnv,'@/lib/payment-mode.mjs':paymentMode},raw);
 const calls=[];const query={select(){return this;},limit(){return this;},eq(){return this;},in(){return this;},maybeSingle(){return this;},then(resolve){resolve({data:['digital-campaign','broadcast','exclusive-buyout'].map(slug=>({slug})),error:null});}};
 const client={from:()=>query,storage:{listBuckets:async()=>({data:['avatars','cover-art','track-audio','track-previews',...(options.noAgreements?[]:['agreements'])].map(name=>({name})),error:null})},rpc(name,args){calls.push(name);assert.equal(name,'get_admin_purchase_capabilities');assert.deepEqual(Object.keys(args),[]);return {abortSignal(signal){assert.ok(signal instanceof AbortSignal);if(options.throwRpc)throw Error('private transport detail');return Promise.resolve(options.rpc||{data:[off()],error:null});}};}};
 const clients={createAdminSupabaseClient:()=>options.noClient?null:client};
 const payment=load('services/health/payment-readiness.ts',{'server-only':{},'@/lib/server-env':server,'@/lib/health/payment-readiness':pure,'@/services/supabase/admin':clients},raw);
 const common={'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},'@/lib/env':appEnv,'@/lib/server-env':server,'@/lib/maintenance-mode.mjs':maintenance,'@/lib/health/payment-readiness':pure,'@/services/health/payment-readiness':payment,'@/services/supabase/admin':clients};
 const config=load('app/api/health/config/route.ts',common,raw);
 const schema=load('services/supabase/schema-compat.ts',{},raw);
 const readiness=load('app/api/health/readiness/route.ts',{...common,'@/lib/storage':{storageBuckets:{avatars:'avatars',coverArt:'cover-art',trackAudio:'track-audio',trackPreviews:'track-previews',agreements:'agreements'}},'@/services/supabase/schema-compat':schema},raw);
 return {config,readiness,server,payment,calls};
}
test('credential-free preview with six OFF capabilities reports payment disabled and healthy application',async()=>{
 const h=harness();const c=await h.config.GET();assert.equal(c.status,200);const cfg=await c.json();assert.equal(cfg.paymentReadiness.status,'disabled');assert.equal(cfg.missingOperational.length,3);assert.deepEqual(cfg.blockingOperational,[]);
 const r=await h.readiness.GET();assert.equal(r.status,200);const body=await r.json();assert.equal(body.status,'healthy');assert.equal(body.ok,true);assert.equal(body.domains.webhook.status,'disabled');assert.equal(body.domains.purchaseFlow.status,'disabled');assert.equal(body.livePaymentsEnabled,false);
 assert.throws(()=>h.server.assertStripeServerConfiguration('Checkout'),/missing/);assert.throws(()=>h.server.assertStripeServerConfiguration('Webhook',{requireWebhook:true}),/missing/);
 assert.ok(h.calls.every(n=>n==='get_admin_purchase_capabilities'));assert.doesNotMatch(JSON.stringify(body),/unit-only-not-a-real-credential|private transport/);
});
test('missing agreements bucket still blocks readiness when payments are disabled',async()=>{const r=await harness({noAgreements:true}).readiness.GET();assert.equal(r.status,503);const b=await r.json();assert.deepEqual(b.storage.missingBuckets,['agreements']);assert.equal(b.domains.storage.status,'blocked');assert.equal(b.paymentReadiness.status,'disabled');});
for(const key of Object.keys(off()))test('enabled capability keeps strict missing-credential health gate: '+key,async()=>{const row={...off(),[key]:true};const h=harness({rpc:{data:[row],error:null}});assert.equal((await h.config.GET()).status,500);assert.equal((await h.readiness.GET()).status,503);});
for(const [name,options] of Object.entries({missing:{rpc:{data:[],error:null}},malformed:{rpc:{data:[{...off(),foundation_enabled:'false'}],error:null}},duplicate:{rpc:{data:[off(),off()],error:null}},denied:{rpc:{data:null,error:{message:'private error'}}},timeout:{throwRpc:true},noServiceClient:{noClient:true}}))test('unknown capabilities fail closed: '+name,async()=>{const h=harness(options);assert.equal((await h.config.GET()).status,500);assert.equal((await h.payment.getHealthPaymentReadiness()).status,'unknown');});
for(const options of [{target:'production'},{target:'local'},{raw:{SYNC_EXCHANGE_PAYMENT_MODE:'live'}},{raw:{SYNC_EXCHANGE_PAYMENT_MODE:undefined}},{raw:{SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED:'true'}},{raw:{SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED:undefined}},{raw:{SYNC_EXCHANGE_BILLING_PORTAL_ENABLED:'true'}},{raw:{SYNC_EXCHANGE_BILLING_PORTAL_ENABLED:undefined}},{raw:{STRIPE_SECRET_KEY:'sk_test_fixture'}},{raw:{STRIPE_WEBHOOK_SECRET:'whsec_fixture'}},{raw:{NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:'pk_test_fixture'}}])test('exception excluded for production, invalid/requested flags, and partial credentials '+JSON.stringify(options),async()=>{const h=harness(options);assert.equal((await h.config.GET()).status,500);assert.equal(h.calls.length,0);});
test('core/service-role configuration and maintenance remain mandatory',async()=>{for(const options of [{missingCore:['NEXT_PUBLIC_SUPABASE_URL']},{raw:{SUPABASE_SERVICE_ROLE_KEY:undefined}},{raw:{SYNC_EXCHANGE_MAINTENANCE_MODE:'cutover'}},{raw:{SYNC_EXCHANGE_MAINTENANCE_MODE:'invalid'}}]){const h=harness(options);const r=await h.config.GET();if(options.raw?.SYNC_EXCHANGE_MAINTENANCE_MODE==='cutover')assert.equal((await r.json()).maintenanceMode,'cutover');else assert.equal(r.status,500);}});
test('configured test payments retain original strict readiness path',async()=>{const h=harness({raw:{STRIPE_SECRET_KEY:'sk_test_fixture',NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:'pk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture'}});assert.equal((await h.config.GET()).status,200);assert.equal((await h.payment.getHealthPaymentReadiness()).status,'required');assert.equal(h.calls.length,0);});
