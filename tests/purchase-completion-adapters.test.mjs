import test from 'node:test';
import assert from 'node:assert/strict';

import {asActor,database,ids,quote} from './helpers/artist-baseline-db.mjs';

const digest='b'.repeat(64);
const call=async(db,sql)=>(await db.query(`select ${sql} as value`)).rows[0].value;
const one=async(db,sql)=>(await db.query(sql)).rows[0];
const service=(db,fn)=>asActor(db,null,fn,'service_role');

async function setup({qa=false}={}) {
 const db=await database();
 await db.exec(`update commerce_private.capabilities set foundation_enabled=true,payment_adapter_enabled=true;
  insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents,currency)
  values('${ids.order}','${ids.buyer}','${ids.live}','${ids.license}',5000,'USD')`);
 let asset=null;
 if(qa) {
  await db.exec('update commerce_private.capabilities set asset_preparation_enabled=true');
  asset=await service(db,()=>call(db,`commerce_private.reserve_asset('${ids.live}')`));
  await db.exec(`insert into storage.objects(bucket_id,name,version,metadata)
    values('purchase-assets','${asset}/master','v1','{"size":100,"mimetype":"audio/wav"}')`);
  await service(db,()=>call(db,`commerce_private.seal_asset('${asset}','${digest}',100,'audio/wav')`));
  await db.exec(`insert into commerce_private.qa_fixture_designations(asset_version_id,buyer_user_id,approval_reference)
    values('${asset}','${ids.buyer}','phase2b-reviewed-synthetic-fixture')`);
  await db.exec('update commerce_private.capabilities set asset_preparation_enabled=false');
 }
 return {db,asset};
}

async function prepare(db) {
 return service(db,()=>one(db,`select * from public.prepare_purchase_completion_checkout('${ids.order}','preview','acct_fixture')`));
}

async function record(db,{event='evt_phase2bpaid',type='checkout.session.completed',state='PAID',amount=5000,refunded=0,currency='USD',session='cs_test_phase2b',intent='pi_phase2b'}={}) {
 return service(db,()=>call(db,`public.record_purchase_completion_event('${ids.order}','acct_fixture',${quote(event)},${session===null?'null':quote(session)},${quote(intent)},${quote(type)},${quote(state)},${amount},${refunded},${quote(currency)},'${digest}','2026-10-02T20:00:00Z')`));
}

async function withFixture(run,options) {
 const ctx=await setup(options);try{await run(ctx);}finally{await ctx.db.close();}
}

test('Phase 2B adapter defaults OFF and ordinary users cannot execute its public RPC boundary',async()=>{
 const db=await database();try{
  assert.equal((await one(db,'select payment_adapter_enabled from commerce_private.capabilities')).payment_adapter_enabled,false);
  await db.exec(`insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents,currency)
    values('${ids.order}','${ids.buyer}','${ids.live}','${ids.license}',5000,'USD')`);
  await assert.rejects(service(db,()=>one(db,`select * from public.prepare_purchase_completion_checkout('${ids.order}','preview','acct_fixture')`)),/disabled/);
  for(const actor of [ids.buyer,ids.a,ids.admin]) await asActor(db,actor,()=>assert.rejects(
    db.query(`select * from public.prepare_purchase_completion_checkout('${ids.order}','preview','acct_fixture')`),/permission denied/
  ));
 }finally{await db.close();}
});

test('real-catalog TEST checkout freezes one contract before Stripe and never grants a master entitlement',()=>withFixture(async({db})=>{
 const first=await prepare(db);const second=await prepare(db);
 assert.equal(first.contract_id,second.contract_id);
 assert.equal(first.synthetic_qa,false);assert.equal(first.entitlement_id,null);assert.equal(first.asset_version_id,null);
 assert.equal((await one(db,'select count(*)::int n from order_delivery_contracts')).n,1);
 assert.equal((await one(db,'select count(*)::int n from order_asset_entitlements')).n,0);
 assert.deepEqual(await one(db,'select payment_mode,commercial_rights_granted,deployment_environment from order_delivery_contracts'),
  {payment_mode:'test',commercial_rights_granted:false,deployment_environment:'preview'});
}));

test('synthetic QA checkout resolves only the exact approved immutable asset and reserves a pending entitlement',()=>withFixture(async({db,asset})=>{
 const result=await prepare(db);
 assert.equal(result.synthetic_qa,true);assert.equal(result.asset_version_id,asset);assert.ok(result.entitlement_id);
 assert.deepEqual(await one(db,'select state,reason_code,commercial_rights_granted from order_asset_entitlements'),
  {state:'pending',reason_code:'awaiting_verification',commercial_rights_granted:false});
 assert.equal((await one(db,'select entitlement_activation_enabled from commerce_private.capabilities')).entitlement_activation_enabled,false);
},{qa:true}));

test('verified TEST payment is idempotent and creates one logical job set with immutable TEST facts',()=>withFixture(async({db})=>{
 const contract=await prepare(db);
 await db.exec(`update orders set stripe_checkout_session_id='cs_test_phase2b',stripe_payment_intent_id='pi_phase2b' where id='${ids.order}'`);
 const first=await record(db);const replay=await record(db);
 assert.equal(first,replay);
 assert.equal((await one(db,'select count(*)::int n from commerce_private.payment_events')).n,1);
 assert.equal((await one(db,'select count(*)::int n from commerce_private.fulfillment_jobs')).n,2);
 assert.deepEqual(await one(db,'select state,revision from commerce_private.order_states'),{state:'PAID',revision:1});
 assert.equal((await one(db,`select commercial_rights_granted from order_delivery_contracts where id='${contract.contract_id}'`)).commercial_rights_granted,false);
}));

test('synthetic QA payment creates four jobs while all delivery/worker capabilities remain OFF',()=>withFixture(async({db})=>{
 await prepare(db);
 await db.exec(`update orders set stripe_checkout_session_id='cs_test_phase2b',stripe_payment_intent_id='pi_phase2b' where id='${ids.order}'`);
 await record(db);
 assert.deepEqual((await db.query('select task from commerce_private.fulfillment_jobs order by task')).rows.map(r=>r.task),
  ['asset_preparation','entitlement_activation','receipt_generation','transaction_projection']);
 const flags=await one(db,'select asset_preparation_enabled,receipt_generation_enabled,entitlement_activation_enabled,transaction_projection_enabled from commerce_private.capabilities');
 assert.deepEqual(flags,{asset_preparation_enabled:false,receipt_generation_enabled:false,entitlement_activation_enabled:false,transaction_projection_enabled:false});
 await assert.rejects(service(db,()=>one(db,"select * from public.claim_purchase_completion_job('entitlement_activation')")),/disabled/);
},{qa:true}));

test('amount, currency, provider, environment and cross-order bindings fail closed',()=>withFixture(async({db})=>{
 await prepare(db);
 await assert.rejects(service(db,()=>one(db,`select * from public.prepare_purchase_completion_checkout('${ids.order}','production','acct_wrong')`)),/context mismatch/);
 await db.exec(`update orders set stripe_checkout_session_id='cs_test_phase2b',stripe_payment_intent_id='pi_phase2b' where id='${ids.order}'`);
 await assert.rejects(record(db,{event:'evt_badamount',amount:1}),/relationship mismatch/);
 await assert.rejects(record(db,{event:'evt_badcurrency',currency:'EUR'}),/relationship mismatch/);
 await assert.rejects(record(db,{event:'evt_badsession',session:'cs_test_other'}),/relationship mismatch/);
 await assert.rejects(record(db,{event:'evt_badintent',intent:'pi_other'}),/PaymentIntent mismatch/);
 assert.equal((await one(db,'select count(*)::int n from commerce_private.payment_events')).n,0);
}));

test('hold preserves verified payment facts and refunds/disputes suspend or revoke without duplicate history',()=>withFixture(async({db})=>{
 await prepare(db);
 await db.exec(`update orders set stripe_checkout_session_id='cs_test_phase2b',stripe_payment_intent_id='pi_phase2b' where id='${ids.order}'`);
 await service(db,()=>call(db,`public.hold_purchase_completion('${ids.order}','risk_review')`));
 await record(db);
 assert.deepEqual(await one(db,'select state,payment_received_event_id is not null as paid from commerce_private.order_states'),{state:'SECURITY_HOLD',paid:true});
 await record(db,{event:'evt_refund',type:'charge.refunded',state:'REFUNDED',refunded:5000,session:null});
 assert.equal((await one(db,'select state from commerce_private.order_states')).state,'SECURITY_HOLD');
 assert.equal((await one(db,'select count(*)::int n from commerce_private.payment_events')).n,2);
}));

test('a signed partial dispute is bound to the immutable purchase amount and suspends delivery',()=>withFixture(async({db})=>{
 await prepare(db);
 await db.exec(`update orders set stripe_checkout_session_id='cs_test_phase2b',stripe_payment_intent_id='pi_phase2b' where id='${ids.order}'`);
 await record(db);
 await record(db,{event:'evt_partialdispute',type:'charge.dispute.created',state:'DISPUTED',amount:1000,session:null});
 assert.deepEqual(await one(db,"select state,revision from commerce_private.order_states"),{state:'DISPUTED',revision:2});
 assert.deepEqual(await one(db,"select amount_minor,refunded_minor from commerce_private.payment_events where provider_event_id='evt_partialdispute'"),
  {amount_minor:5000,refunded_minor:0});
 await assert.rejects(record(db,{event:'evt_overdispute',type:'charge.dispute.created',state:'DISPUTED',amount:5001,session:null}),/dispute amount\/currency mismatch/);
}));

test('receipt snapshot and seller projection are backend-only, TEST-classified and omit buyer billing identity',()=>withFixture(async({db})=>{
 await prepare(db);
 await db.exec(`update orders set stripe_checkout_session_id='cs_test_phase2b',stripe_payment_intent_id='pi_phase2b' where id='${ids.order}';
  update commerce_private.capabilities set receipt_generation_enabled=true,transaction_projection_enabled=true`);
 await record(db);
 const receiptJob=await service(db,()=>one(db,"select * from public.claim_purchase_completion_job('receipt_generation')"));
 const receipt=await service(db,()=>call(db,`public.prepare_purchase_completion_receipt('${receiptJob.id}','${receiptJob.lease_token}')`));
 assert.deepEqual(await one(db,`select document_kind,payment_mode,commercial_rights_granted,state from order_receipts where id='${receipt}'`),
  {document_kind:'test_receipt',payment_mode:'test',commercial_rights_granted:false,state:'pending'});
 const projectionJob=await service(db,()=>one(db,"select * from public.claim_purchase_completion_job('transaction_projection')"));
 await service(db,()=>call(db,`public.finish_purchase_completion_job('${projectionJob.id}','${projectionJob.lease_token}',true,false,null)`));
 const projection=await one(db,'select * from artist_transaction_records');
 assert.equal(projection.payment_mode,'test');assert.equal(projection.payable_earnings_calculated,false);
 assert.ok(!Object.keys(projection).some(key=>/buyer|billing|email|payout/.test(key)));
}));
