import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
import * as payment from '../lib/payment-mode.mjs';
import {digest} from '../lib/finance/provider-events.mjs';

function load(path,dependencies,env){
  const loaded={exports:{}};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
  }).outputText,{module:loaded,exports:loaded.exports,process:{env},require:name=>{
    assert.ok(Object.hasOwn(dependencies,name),'Unmocked dependency '+name);return dependencies[name];
  }});
  return loaded.exports;
}
const baseline={SUPABASE_SERVICE_ROLE_KEY:'sb_secret_SYNTHETIC',STRIPE_SECRET_KEY:'rk_test_SYNTHETIC',
  STRIPE_WEBHOOK_SECRET:'whsec_SYNTHETIC',NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:'pk_test_SYNTHETIC',
  STRIPE_ACCOUNT_ID:'acct_SyntheticFixture',SYNC_EXCHANGE_PAYMENT_MODE:'test',
  SYNC_EXCHANGE_PRODUCTION_TEST_ENABLED:'true',SYNC_EXCHANGE_FINANCIAL_INGESTION_ENABLED:'true',
  SYNC_EXCHANGE_FINANCIAL_WORKER_ENABLED:'true',TSE_FINANCE_ENDPOINT_ID:'00000000-0000-4000-8000-000000000001'};
function harness(patch={},target='production'){
  const env={...baseline,...patch},effects=[];
  const appEnv={env:{stripePublishableKey:env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY},getDeploymentTarget:()=>target,
    getPublicEnvironmentDiagnostics:()=>({issues:[],errors:[],warnings:[]})};
  const server=load('lib/server-env.ts',{'@/lib/env':appEnv,'@/lib/payment-mode.mjs':payment},env);
  const client={rpc:async(name,args)=>{effects.push({name,args});return {data:{state:'captured'},error:null};}};
  const ingestion=load('services/finance/ingestion.ts',{'server-only':{},stripe:class{
    constructor(key,options){assert.match(key,/^(sk|rk)_test_/);assert.equal(options.maxNetworkRetries,0);effects.push('test-client');}
  },'@/lib/env':appEnv,'@/lib/server-env':server,
  '@/lib/finance/provider-events.mjs':{digest,verifyFinancialWebhook(raw,signature){
    assert.equal(raw,'synthetic-raw-body');if(signature!=='valid')throw Error('signature_invalid');
    return {summary:{eventId:'evt_SYNTHETIC',livemode:false}};
  }},'@/services/supabase/admin':{createAdminSupabaseClient:()=>{effects.push('admin-client');return client;}},
  '@/services/finance/worker.mjs':{runFinancialWorker:async worker=>{await worker.claim();return {state:'synthetic-worker'};}}},env);
  return {ingestion,effects,server};
}
test('production TEST financial admission and worker use real configuration gates without provider network calls',async()=>{
  const h=harness();assert.equal((await h.ingestion.captureFinancialWebhook('synthetic-raw-body','valid')).state,'captured');
  assert.equal((await h.ingestion.processFinancialQueue()).state,'synthetic-worker');
  const calls=h.effects.filter(x=>typeof x==='object');
  assert.deepEqual(calls.map(x=>x.name),['ingest_financial_provider_event','claim_financial_provider_job']);
  assert.equal(calls[0].args.p_raw,'synthetic-raw-body');
  assert.equal(calls[0].args.p_credential,digest(baseline.STRIPE_SECRET_KEY));
  assert.equal(calls[0].args.p_endpoint,baseline.TSE_FINANCE_ENDPOINT_ID);
});
test('production TEST rejects missing opt-in, live keys/mode, account, endpoint, webhook and feature flags before privileged client creation',async()=>{
  for(const patch of [
    {SYNC_EXCHANGE_PRODUCTION_TEST_ENABLED:undefined},{SYNC_EXCHANGE_PRODUCTION_TEST_ENABLED:'false'},
    {SYNC_EXCHANGE_PRODUCTION_TEST_ENABLED:'yes'},{SYNC_EXCHANGE_PAYMENT_MODE:'live',STRIPE_SECRET_KEY:'sk_live_SYNTHETIC',NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:'pk_live_SYNTHETIC'},
    {STRIPE_SECRET_KEY:'rk_live_SYNTHETIC'},{NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:'pk_live_SYNTHETIC'},
    {STRIPE_ACCOUNT_ID:''},{TSE_FINANCE_ENDPOINT_ID:''},{STRIPE_WEBHOOK_SECRET:''},
    {SYNC_EXCHANGE_FINANCIAL_INGESTION_ENABLED:'false'},{SYNC_EXCHANGE_FINANCIAL_WORKER_ENABLED:'false'}
  ]){
    const h=harness(patch);await assert.rejects(h.ingestion.processFinancialQueue());assert.deepEqual(h.effects,[],JSON.stringify(patch));
  }
});
test('production TEST forged webhook never reaches financial RPC and ingestion flag stays dormant by default',async()=>{
  const forged=harness();await assert.rejects(forged.ingestion.captureFinancialWebhook('synthetic-raw-body','forged'),/signature_invalid/);
  assert.equal(forged.effects.filter(x=>typeof x==='object').length,0);
  const dormant=harness({SYNC_EXCHANGE_FINANCIAL_INGESTION_ENABLED:undefined});
  await assert.rejects(dormant.ingestion.captureFinancialWebhook('synthetic-raw-body','valid'),/financial_processing_disabled/);
  assert.deepEqual(dormant.effects,[]);
});

test('production TEST build validation refuses live keys and malformed opt-in before deployment',()=>{
  const env={PATH:process.env.PATH,...baseline,CONTEXT:'production',NETLIFY:'true',
    NEXT_PUBLIC_APP_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_SYNTHETIC'};
  const validate=patch=>spawnSync(process.execPath,['scripts/validate-env.mjs'],{cwd:new URL('../',import.meta.url),env:{...env,...patch},encoding:'utf8'});
  assert.equal(validate({}).status,0);
  for(const patch of [{SYNC_EXCHANGE_PRODUCTION_TEST_ENABLED:'yes'},
    {SYNC_EXCHANGE_PAYMENT_MODE:'live',STRIPE_SECRET_KEY:'sk_live_SYNTHETIC',NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:'pk_live_SYNTHETIC'}]){
    const result=validate(patch);assert.equal(result.status,1);assert.match(result.stderr,/Production testing requires/);
  }
});
test('production Checkout display gate defaults closed and accepts only explicit true without disabling webhook runtime',()=>{
 for(const value of [undefined,'false','TRUE',' true ','yes']){const h=harness({SYNC_EXCHANGE_MARKETPLACE_CHECKOUT_ENABLED:value});assert.equal(h.server.getPaymentDisplayConfiguration().checkoutAvailable,false);assert.equal(h.server.getPaymentRuntimeConfiguration().paymentMode,'test');}
 assert.equal(harness({SYNC_EXCHANGE_MARKETPLACE_CHECKOUT_ENABLED:'true'}).server.getPaymentDisplayConfiguration().checkoutAvailable,true);
 assert.equal(harness({},'preview').server.getPaymentDisplayConfiguration().checkoutAvailable,true);
});
