import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {database} from './helpers/artist-baseline-db.mjs';
import {providerFixture,endpoint,credential,signing,secret} from './helpers/financial-provider-fixture.mjs';
import {call} from './helpers/purchase-legal-fixture.mjs';
import {verifyFinancialWebhook} from '../lib/finance/provider-events.mjs';
import {authorizeFinancialWorker} from '../lib/finance/worker-auth.mjs';
function load(path,dependencies,env){
 const loadedModule={exports:{}};const compiled=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(compiled,{module:loadedModule,exports:loadedModule.exports,Buffer,Request,Response,TextDecoder,console:{warn(){},info(){},error(){}},process:{env},require:name=>{assert.ok(Object.hasOwn(dependencies,name),'Unmocked '+name);return dependencies[name];}});return loadedModule.exports;
}
async function harness(db,{captureFailure=false,enabled=true}={}){
 const f=await providerFixture(db),effects=[];
 const deps={
  'node:crypto':{createHash},'next/cache':{revalidatePath(){}},'next/server':{NextResponse:{json:Response.json}},stripe:{},
  '@/lib/server-env':{hasStripeWebhookEnv:true,serverEnv:{stripeWebhookSecret:secret},assertStripeServerConfiguration(){},assertStripeRuntimeObject(_s,o){if(o.livemode!==false)throw Error('mode');},getServerEnvironmentDiagnostics:()=>({})},
  '@/lib/maintenance-mode.mjs':{resolveMaintenanceMode:()=>({blocksApplication:false})},'@/lib/monitoring':{reportOperationalError(){},reportOperationalEvent(){}},
  '@/services/gate-d/server':{routeGateDWebhook:async()=>({route_code:'ordinary'}),recordGateDVerifiedPayment:async()=>{},requestGateDRevocation:async()=>{},runGateDAcceptanceJobs:async()=>{}},
  '@/services/stripe/server':{getStripeServerClient:()=>f.signingClient,syncOrderFromStripeSession:async()=>effects.push('ordinary-paid'),expireOrderCheckout:async()=>effects.push('ordinary-expired'),markOrderCheckoutSessionPaymentFailed:async()=>effects.push('ordinary-failed'),markOrderRefundedByPaymentIntent:async()=>{effects.push('ordinary-refund');return {id:f.c.order};},recordOrderDisputeByPaymentIntent:async()=>{effects.push('ordinary-dispute');return {id:f.c.order};}},
  '@/services/finance/ingestion':{captureFinancialWebhook:async(raw,signature)=>{effects.push('finance');if(captureFailure)throw Error('database unavailable');const {summary}=verifyFinancialWebhook(raw,signature,secret,f.signingClient);return call(db,'ingest_financial_provider_event',[endpoint,credential,signing,raw,summary]);}}
 };
 const route=load('app/api/webhooks/stripe/route.ts',deps,{SYNC_EXCHANGE_FINANCIAL_INGESTION_ENABLED:enabled?'true':'false'});
 const send=(e=f.event(),valid=true)=>{const raw=typeof e==='string'?e:JSON.stringify(e);const signature=f.signingClient.webhooks.generateTestHeaderString({payload:raw,secret});return route.POST(new Request('http://localhost/api/webhooks/stripe',{method:'POST',body:raw,headers:{'stripe-signature':valid?signature:signature+'bad'}}));};
 return {...f,send,effects};
}
const fixture=async fn=>{const db=await database();try{await fn(db);}finally{await db.close();}};
test('actual webhook route verifies raw HMAC before capture, keeps finance dormant by default and preserves ordinary processing',()=>fixture(async db=>{
 const h=await harness(db,{enabled:false});assert.equal((await h.send()).status,200);assert.deepEqual(h.effects,['ordinary-paid']);
}));
test('actual webhook route durably captures supported signed events before ordinary processing and rejects forged signatures',()=>fixture(async db=>{
 const h=await harness(db);assert.equal((await h.send(h.event(),false)).status,400);assert.deepEqual(h.effects,[]);
 assert.equal((await h.send()).status,200);assert.deepEqual(h.effects,['finance','ordinary-paid']);assert.equal((await db.query('select count(*)::int n from finance_private.provider_events')).rows[0].n,1);
}));
test('financial admission outage still runs PK07 adverse handling and returns 500 for provider retry',()=>fixture(async db=>{
 const h=await harness(db,{captureFailure:true});const e=h.event('evt_refundRoute','charge.refunded',{...h.state.charge,amount_refunded:1000});
 assert.equal((await h.send(e)).status,500);assert.deepEqual(h.effects,['finance','ordinary-refund']);
}));
test('enabled route enforces bounded body before any provider or database side effect',()=>fixture(async db=>{
 const h=await harness(db);const e={...h.event(),padding:'x'.repeat(262144)};assert.equal((await h.send(e)).status,413);assert.deepEqual(h.effects,[]);
}));
test('worker HTTP endpoint checks dedicated bearer before invoking processing and redacts failures',async()=>{
 let calls=0;const key='SYNTHETIC-worker-key-'.repeat(3);
 const route=load('app/api/internal/finance/worker/route.ts',{'next/server':{NextResponse:{json:Response.json}},'@/lib/finance/worker-auth.mjs':{authorizeFinancialWorker},'@/services/finance/ingestion':{processFinancialQueue:async()=>{calls++;throw Error('secret provider failure');}}},{TSE_FINANCE_WORKER_SECRET:key});
 assert.equal((await route.POST(new Request('http://localhost/worker',{method:'POST'}))).status,401);assert.equal(calls,0);
 const response=await route.POST(new Request('http://localhost/worker',{method:'POST',headers:{authorization:'Bearer '+key}}));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/secret provider failure/);assert.equal(calls,1);
});
