import {enable as enableSyntheticAnalytics} from './helpers/analytics-system-fixture.mjs';
// Local-only integration: real Stripe HMAC verification, webhook/payment code,
// immutable evidence and durable outbox SQL. No provider or hosted DB requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash, webcrypto} from 'node:crypto';
import ts from 'typescript';
import Stripe from 'stripe';
import {database, asActor, ids, source} from './helpers/artist-baseline-db.mjs';
import * as pricing from '../services/orders/checkout-pricing.ts';
import * as config from '../lib/analytics/config.ts';
import * as schema from '../lib/analytics/schema.ts';
import {assertStripeObjectMode, buildPaymentClassification} from '../lib/payment-mode.mjs';

const secret='whsec_local_fixture_only';
const stripe=new Stripe('sk_test_local_fixture_only');
const migration='supabase/migrations/20261010060000_analytics_verified_purchase_evidence.sql';
const service=(db,fn)=>asActor(db,null,fn,'service_role');
const plain=value=>JSON.parse(JSON.stringify(value));
function load(path,stubs,variables={}) {
 const loadedModule={exports:{}};
 vm.runInNewContext(ts.transpileModule(source(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  module:loadedModule,exports:loadedModule.exports,Request,Response,URL,Error,Buffer,TextDecoder,AbortSignal,crypto:webcrypto,
  process:{env:variables},fetch(){throw Error('Network forbidden');},console:{warn(){},error(){},info(){}},
  require(name){assert.ok(Object.hasOwn(stubs,name),`Unmocked dependency: ${name}`);return stubs[name];}
 },{filename:path});
 return loadedModule.exports;
}
function deferred(run) {
 return {abortSignal(){return this;},then(resolve,reject){return run().then(resolve,reject);}};
}
// Narrow PostgREST-shaped adapter backed by real in-memory PostgreSQL. All
// payment/outbox SQL runs with the same service_role as the application.
function clientFor(db,controls) {
 const identifier=value=>{assert.match(value,/^[a-z_][a-z0-9_]*$/);return `"${value}"`;};
 const result=async run=>{try{return {data:await run(),error:null};}catch(error){return {data:null,error};}};
 return {
  rpc(name,args){return deferred(()=>result(async()=>{
   controls.calls.push(name);
   if(name==='enqueue_analytics_event'&&controls.enqueueFails)throw Error('injected enqueue failure');
   const params=Object.entries(args);
   const sql=`public.${identifier(name)}(${params.map(([key],i)=>`${identifier(key)} => $${i+1}`).join(',')})`;
   const scalar=['record_purchase_completion_event','enqueue_analytics_event','complete_analytics_event','fail_analytics_event','analytics_delivery_allowed'].includes(name);
   const {rows}=await db.query(scalar?`select ${sql} as value`:`select * from ${sql}`,params.map(([,v])=>v));
   return scalar?rows[0].value:rows;
  }));},
  from(table){
   assert.ok(['orders','track_license_options','order_activity_log','analytics_outbox'].includes(table),table);
   const where=[];let fields='*',operation='select',values;
   const execute=()=>result(async()=>{
    const params=[];
    const bind=value=>{params.push(value);return `$${params.length}`;};
    const predicate=()=>where.map(([key,value])=>`${identifier(key)}=${bind(value)}`).join(' and ');
    let sql;
    if(operation==='insert')sql=`insert into public.${identifier(table)}(${Object.keys(values).map(identifier).join(',')}) values(${Object.values(values).map(bind).join(',')}) returning *`;
    else if(operation==='update')sql=`update public.${identifier(table)} set ${Object.entries(values).map(([key,value])=>`${identifier(key)}=${bind(value)}`).join(',')} where ${predicate()} returning *`;
    else sql=`select * from public.${identifier(table)} where ${predicate()||'true'}`;
    const rows=(await db.query(sql,params)).rows;
    if(operation==='select'&&fields.includes('tracks (')){
     controls.catalogReads++;
     for(const row of rows){
      row.tracks=(await db.query('select id,title,slug,status from tracks where id=$1',[row.track_id])).rows[0];
      row.license_types=(await db.query('select id,name,slug,active,default_price_cents from license_types where id=$1',[row.license_type_id])).rows[0];
     }
    }
    if(operation==='select'&&table==='track_license_options'){
     controls.catalogReads++;
     for(const row of rows)row.license_types=(await db.query('select id,name,slug,active,default_price_cents from license_types where id=$1',[row.license_type_id])).rows[0];
    }
    return rows;
   });
   const q={select(columns){fields=columns;return q;},eq(key,value){where.push([key,value]);return q;},update(input){operation='update';values=input;return q;},insert(input){operation='insert';values=input;return q;},abortSignal(){return q;},
    async maybeSingle(){const r=await execute();assert.ok(!r.data||r.data.length<=1);return {...r,data:r.data?.[0]||null};},
    then(resolve,reject){return execute().then(resolve,reject);}};
   return q;
  }
 };
}
async function harness({buyer=ids.buyer}={}) {
 const db=await database();await enableSyntheticAnalytics(db);
 const controls={calls:[],catalogReads:0,enqueueFails:false,sent:[],gate:'ordinary',gateCalls:[]};
 try {
  if(buyer!==ids.buyer)await db.query("insert into auth.users(id,email) values($1,'qa@fixture.invalid');",[buyer]);
  if(buyer!==ids.buyer)await db.query("insert into user_profiles(id,email,role,full_name) values($1,'qa@fixture.invalid','buyer','Local QA')",[buyer]);
  await enableSyntheticAnalytics(db,[buyer]);
  await db.exec('update commerce_private.capabilities set foundation_enabled=true,payment_adapter_enabled=true');
  await db.query(`insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents,currency)
   values($1,$2,$3,$4,5000,'USD')`,[ids.order,buyer,ids.live,ids.license]);
  await service(db,()=>db.query("select * from prepare_purchase_completion_checkout($1,'preview','acct_fixture')",[ids.order]));
  await db.query("update orders set stripe_checkout_session_id='cs_test_retryfixture' where id=$1",[ids.order]);
  const client=clientFor(db,controls);
  const environment={env:{demoMode:false,appUrl:'https://staging.invalid'},getDeploymentTarget:()=> 'preview'};
  const serverEnv={
   hasStripeWebhookEnv:true,serverEnv:{stripeWebhookSecret:secret,stripeSecretKey:'sk_test_local_fixture_only'},
   assertStripeServerConfiguration(){},getServerEnvironmentDiagnostics:()=>({deploymentTarget:'preview'}),
   getPurchaseCompletionAdapterConfiguration:()=>({enabled:true,requested:true,providerAccount:'acct_fixture'}),
   getPaymentRuntimeConfiguration:()=>({paymentMode:'test',releaseMode:'preview'}),
   getPaymentActivityMetadata:()=>buildPaymentClassification('test','preview'),
   assertStripeRuntimeObject(context,input){assertStripeObjectMode({context,paymentMode:'test',...input});return buildPaymentClassification('test','preview');}
  };
  const common={'server-only':{},'@/lib/env':environment,'@/lib/server-env':serverEnv,'@/services/supabase/admin':{createAdminSupabaseClient:()=>client}};
  const compatibility={isMissingColumnError:()=>false,isMissingRelationError:()=>false,warnSchemaFallbackOnce(){}};
  const completion=load('services/purchase-completion/server.ts',common);
  const activity=load('services/orders/activity.ts',{'@/services/supabase/schema-compat':compatibility});
  const payments=load('services/stripe/server.ts',{
   ...common,
   '@/services/orders/fulfillment-recovery':load('services/orders/fulfillment-recovery.ts',{'node:crypto':{createHash}}),
   '@/services/orders/checkout-recovery':{expireCheckoutAttempt:async()=>{},recoverableCheckout:async()=>{throw Error('Unexpected session creation');}},
   stripe:{default:Stripe},'@/services/orders/activity':activity,'@/services/orders/checkout-pricing':pricing,
   '@/services/purchase-completion/server':completion,'@/services/supabase/schema-compat':compatibility,
   '@/services/agreements/server':{generateAgreementArtifactForOrder:async()=>{controls.calls.push('agreement');}}
  });
  const analytics=load('services/analytics/server.ts',{
   ...common,'@/lib/analytics/config':config,'@/lib/analytics/schema':schema,
   '@/lib/analytics/retry':{nextRetryAt:()=>new Date(Date.now()+60000).toISOString()},
   '@/lib/analytics/transport':{sendEvent:async(_config,row)=>{controls.sent.push(plain(row));return {kind:'accepted',meaning:'ingestion_only'};}}
  },{ANALYTICS_ENABLED:'true',POSTHOG_HOST:'https://us.i.posthog.com',POSTHOG_PREVIEW_TOKEN:'phc_localfixtureonly'});
  const purchase=load('services/analytics/purchase.ts',{...common,'./server':analytics});
  const route=load('app/api/webhooks/stripe/route.ts',{
   ...common,'node:crypto':{createHash},'next/cache':{revalidatePath(){}},'next/server':{NextResponse:{json:Response.json}},
   '@/lib/monitoring':{reportOperationalError(){},reportOperationalEvent(){}},'@/lib/maintenance-mode.mjs':{resolveMaintenanceMode:()=>({blocksApplication:false})},
   '@/services/stripe/server':payments,'@/services/analytics/purchase':purchase,
   '@/services/gate-d/server':{
    routeGateDWebhook:async()=>({route_code:controls.gate,order_id:ids.order,grant_id:ids.order}),
    recordGateDVerifiedPayment:async()=>controls.gateCalls.push('verified'),
    runGateDAcceptanceJobs:async()=>controls.gateCalls.push('jobs'),requestGateDRevocation:async()=>{}
   }
  });
  const event={id:'evt_retryfixture',object:'event',type:'checkout.session.completed',created:1791580000,livemode:false,
   data:{object:{id:'cs_test_retryfixture',object:'checkout.session',created:1791580000,livemode:false,
    client_reference_id:ids.order,payment_status:'paid',payment_intent:'pi_retryfixture',amount_total:5000,currency:'usd',
    metadata:{orderId:ids.order,buyerUserId:buyer,trackId:ids.live,licenseTypeId:ids.license},customer_details:{email:'private@fixture.invalid'}}}};
  const sign=input=>{const body=JSON.stringify(input);return {body,signature:stripe.webhooks.generateTestHeaderString({payload:body,secret})};};
  const send=async({body,signature})=>{const response=await service(db,()=>route.POST(new Request('https://staging.invalid/api/webhooks/stripe',{method:'POST',headers:{'stripe-signature':signature},body})));controls.lastResponse=await response.clone().json();return response;};
  const rows=async()=> (await db.query('select * from analytics_outbox')).rows;
  const proof=(eventId=event.id,account='acct_fixture')=>service(db,()=>db.query('select * from get_analytics_verified_purchase($1,$2,$3)',[ids.order,account,eventId]));
  return {db,controls,event,sign,send,rows,proof,purchase,deliver:id=>service(db,()=>analytics.deliverEvent(id))};
 } catch(error){await db.close();throw error;}
}
async function withHarness(run,options){const h=await harness(options);try{await run(h);}finally{await h.db.close();}}
async function assertOnePurchase(h) {
 let rows=await h.rows();rows=rows.filter(x=>x.event==='purchase_verified');assert.equal(rows.length,1);await h.deliver(rows[0].id);rows=(await h.rows()).filter(x=>x.event==='purchase_verified');assert.equal(rows[0].event,'purchase_verified');
 assert.equal(rows[0].dedupe_key,`purchase:${ids.order}`);assert.ok(rows[0].delivered_at);
 assert.equal(rows[0].actor_id,ids.buyer);assert.equal(rows[0].environment,'preview');assert.equal(rows[0].is_test,true);
 assert.deepEqual(rows[0].properties,{order_id:ids.order,track_id:ids.live,license_type:'digital-campaign',payment_mode:'test'});
 assert.equal((await h.db.query('select count(*)::int n from commerce_private.payment_events')).rows[0].n,1);
 assert.equal((await h.proof()).rows[0].amount_minor,5000);assert.equal((await h.proof()).rows[0].currency,'USD');
 assert.equal(h.controls.sent.length,1);
 for(const forbidden of ['private@','email','rights_snapshot','license_snapshot','payment_intent','checkout_session','amount_minor','currency','agreement','storage','filename'])assert.ok(!JSON.stringify(h.controls.sent).includes(forbidden),forbidden);
 return plain(rows[0]);
}

test('A: initial signed payment persists verified evidence before one durable purchase event',()=>withHarness(async h=>{
 assert.equal((await h.proof()).rows.length,0);
 assert.equal((await h.send(h.sign(h.event))).status,200,JSON.stringify(h.controls.lastResponse));
 await assertOnePurchase(h);
 assert.ok(h.controls.calls.indexOf('record_purchase_completion_event')<h.controls.calls.indexOf('get_analytics_verified_purchase'));
 assert.equal(h.controls.catalogReads,0,'signed payment retention uses immutable order facts; licensing independently verifies current rights');
 assert.ok(h.controls.calls.indexOf('record_verified_checkout_payment')<h.controls.calls.indexOf('agreement'),'signed payment is durable before rights-sensitive issuance');
}));
for(const [label,sql] of [
 ['B: price changes',`update track_license_options set price_cents=9500 where track_id='${ids.live}'`],
 ['C: approval removed',`update tracks set status='rejected' where id='${ids.live}'`],
 ['D: price and approval change',`update track_license_options set price_cents=9500 where track_id='${ids.live}'; update tracks set status='rejected' where id='${ids.live}'`],
 ['license eligibility and slug change',`update track_license_options set active=false where track_id='${ids.live}'; update license_types set active=false,slug='changed-after-purchase' where id='${ids.license}'`]
])test(`${label}: SAME signed webhook succeeds with exactly one logical event`,()=>withHarness(async h=>{
 const signed=h.sign(h.event);assert.equal((await h.send(signed)).status,200);
 const original=await assertOnePurchase(h);const reads=h.controls.catalogReads;
 await h.db.exec(sql);
 assert.equal((await h.send(signed)).status,200);assert.equal((await h.send(signed)).status,200);
 assert.deepEqual(await assertOnePurchase(h),original);assert.equal(h.controls.catalogReads,reads,'retry never re-reads catalog');
}));

test('enqueue failure after verified payment recovers after catalog drift without backfill or duplicate',()=>withHarness(async h=>{
 const signed=h.sign(h.event);h.controls.enqueueFails=true;
 assert.equal((await h.send(signed)).status,200);assert.equal((await h.rows()).length,0);assert.equal((await h.proof()).rows.length,1);
 const reads=h.controls.catalogReads;
 await h.db.exec(`update track_license_options set price_cents=9500 where track_id='${ids.live}'; update tracks set status='rejected' where id='${ids.live}'`);
 h.controls.enqueueFails=false;assert.equal((await h.send(signed)).status,200);assert.equal((await h.send(signed)).status,200);
 await assertOnePurchase(h);assert.equal(h.controls.catalogReads,reads);
}));

for(const [label,change,expected] of [
 ['E: invalid signature',()=>{},400],
 ['F: new payment amount mismatch',e=>{e.data.object.amount_total=1;},500],
 ['G: new payment currency mismatch',e=>{e.data.object.currency='eur';},500],
 ['H: wrong session',e=>{e.data.object.id='cs_test_wrong';},500],
 ['H: wrong order',e=>{e.data.object.client_reference_id=ids.draft;},500],
 ['live mode',e=>{e.livemode=true;e.data.object.livemode=true;},400],
 ['Connect account',e=>{e.account='acct_connected';},400]
])test(`${label} cannot produce purchase evidence or analytics`,()=>withHarness(async h=>{
 change(h.event);const signed=h.sign(h.event);if(label.startsWith('E:'))signed.signature='t=1,v1=invalid';
 assert.equal((await h.send(signed)).status,expected);assert.equal((await h.rows()).length,0);
 assert.equal((await h.db.query('select count(*)::int n from commerce_private.payment_events')).rows[0].n,0);
 assert.equal((await h.db.query('select status,paid_at from orders where id=$1',[ids.order])).rows[0].paid_at,null);
 assert.equal(h.controls.sent.length,0);
}));

test('I: Gate D webhook branch never invokes ordinary purchase evidence or analytics',()=>withHarness(async h=>{
 h.controls.gate='gate_d';assert.equal((await h.send(h.sign(h.event))).status,200,JSON.stringify(h.controls.lastResponse));
 assert.deepEqual(h.controls.gateCalls,['verified','jobs']);assert.equal((await h.rows()).length,0);
 assert.ok(!h.controls.calls.includes('get_analytics_verified_purchase'));assert.ok(!h.controls.calls.includes('record_purchase_completion_event'));
}));

test('evidence RPC is idempotently installable, role restricted, immutable and rejects unverified/misbound evidence',()=>withHarness(async h=>{
 await h.db.exec(source(migration));
 for(const [role,actor] of [['anon',null],['authenticated',ids.buyer],['authenticated',ids.admin]])await asActor(h.db,actor,()=>assert.rejects(
  h.db.query('select * from get_analytics_verified_purchase($1,$2,$3)',[ids.order,'acct_fixture',h.event.id]),/permission denied/),role);
 await service(h.db,async()=>{
  await h.db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
  await assert.rejects(h.db.query('select * from get_analytics_verified_purchase($1,$2,$3)',[ids.order,'acct_fixture',h.event.id]),/Service role required/);
 });
 assert.equal((await h.proof()).rows.length,0);
 await service(h.db,()=>assert.rejects(h.purchase.recordVerifiedPurchase(ids.order,h.event.data.object,h.event.id),/not_persisted/));
 assert.equal((await h.send(h.sign(h.event))).status,200,JSON.stringify(h.controls.lastResponse));
 assert.equal((await h.proof('evt_unknown')).rows.length,0);assert.equal((await h.proof(h.event.id,'acct_other')).rows.length,0);
 for(const sql of ["update order_delivery_contracts set amount_minor=1","update commerce_private.contract_context set license_snapshot='{}'","update commerce_private.payment_events set amount_minor=1"])await assert.rejects(h.db.exec(sql),/immutable/i);
 await h.db.exec(`update user_profiles set role='artist' where id='${ids.buyer}'`);assert.equal((await h.proof()).rows.length,0);
}));

test('a paid order without persisted signature evidence cannot produce purchase analytics',()=>withHarness(async h=>{
 await h.db.exec("update orders set status='paid',paid_at=now(),stripe_payment_intent_id='pi_retryfixture'");
 assert.equal((await h.proof()).rows.length,0);
 await service(h.db,()=>assert.rejects(h.purchase.recordVerifiedPurchase(ids.order,h.event.data.object,h.event.id),/not_persisted/));
 assert.equal((await h.rows()).length,0);assert.equal(h.controls.sent.length,0);
}));

test('I: evidence projection excludes any retained Gate D grant, even if ordinary evidence also exists',()=>withHarness(async h=>{
 assert.equal((await h.send(h.sign(h.event))).status,200,JSON.stringify(h.controls.lastResponse));assert.equal((await h.proof()).rows.length,1);
 // A real retained grant row is enough to exclude this order. No trigger, RLS,
 // constraint or capability is disabled for this in-memory adversarial fixture.
 await h.db.exec(`insert into commerce_private.asset_versions(id,track_id,source_object_id,source_bucket,source_path,source_version)
  select '${ids.draft}',t.id,s.id,'track-audio',t.audio_file_path,s.version from tracks t join storage.objects s on s.name=t.audio_file_path where t.id='${ids.live}';
  insert into commerce_private.acceptance_grants(buyer_user_id,order_id,seller_user_id,track_id,license_type_id,asset_version_id,amount_minor,currency,provider_account,approval_reference,operator_reference)
  values('${h.event.data.object.metadata.buyerUserId}','${ids.order}','${ids.a}','${ids.live}','${ids.license}','${ids.draft}',5000,'USD','acct_fixture','local-fixture','local-fixture');`);
 assert.equal((await h.proof()).rows.length,0);
 await service(h.db,()=>assert.rejects(h.purchase.recordVerifiedPurchase(ids.order,h.event.data.object,h.event.id),/not_persisted/));
 assert.equal((await h.rows()).length,1);
},{buyer:'8ffc95e8-0e8f-428e-ac26-925d6bc98fcd'}));
