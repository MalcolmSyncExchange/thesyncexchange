import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database,ids,quote,asActor,source} from './helpers/artist-baseline-db.mjs';
import {classifyLegacyOrder} from '../lib/commerce/legacy-classifier.mjs';

const buyer2='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const order2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const digest='a'.repeat(64);
const q=quote;
const one=async(db,sql)=>(await db.query(sql)).rows[0];
const call=async(db,sql)=>(await one(db,`select ${sql} as value`)).value;
const service=(db,fn)=>asActor(db,null,fn,'service_role');
const enabled=`update commerce_private.capabilities set foundation_enabled=true,asset_preparation_enabled=true,
 receipt_generation_enabled=true,entitlement_activation_enabled=true,transaction_projection_enabled=true`;
async function setup({qa=true,paid=true}={}) {
 const db=await database();
 await db.exec(enabled);
 await db.exec(`insert into auth.users(id,email) values('${buyer2}','other@fixture.invalid');
 insert into user_profiles(id,email,role,full_name) values('${buyer2}','other@fixture.invalid','buyer','Other');
 insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents,currency) values
 ('${ids.order}','${ids.buyer}','${ids.live}','${ids.license}',5000,'USD'),
 ('${order2}','${buyer2}','${ids.live}','${ids.license}',5000,'USD')`);
 const contract=await service(db,()=>call(db,`commerce_private.freeze_contract('${ids.order}','production','acct_fixture')`));
 const other=await service(db,()=>call(db,`commerce_private.freeze_contract('${order2}','preview','acct_fixture')`));
 const asset=await service(db,()=>call(db,`commerce_private.reserve_asset('${ids.live}')`));
 await db.exec(`insert into storage.objects(bucket_id,name,version,metadata) values('purchase-assets','${asset}/master','v1','{"size":100,"mimetype":"audio/wav"}')`);
 await service(db,()=>call(db,`commerce_private.seal_asset('${asset}','${digest}',100,'audio/wav')`));
 if(qa) {
  await db.exec(`insert into commerce_private.qa_fixture_designations(asset_version_id,buyer_user_id,approval_reference) values('${asset}','${ids.buyer}','synthetic-fixture-review-1')`);
  await service(db,()=>call(db,`commerce_private.reserve_entitlement('${contract}','${asset}')`));
 }
 await db.exec(`update orders set stripe_checkout_session_id='cs_test_fixture',stripe_payment_intent_id='pi_fixture' where id='${ids.order}'`);
 const ctx={db,contract,other,asset};
 if(paid) await event(ctx);
 return ctx;
}
async function event({db,contract}, {id='evt_paid',state='PAID',type='checkout.session.completed',refund=0,amount=5000,currency='USD',account='acct_fixture',hash=digest,session='cs_test_fixture'}={}) {
 return service(db,()=>call(db,`commerce_private.record_payment_event('${contract}',${q(account)},${q(id)},${q(session)},'pi_fixture',${q(type)},${q(state)},${amount},${refund},${q(currency)},'${hash}','2026-10-02T00:00:00Z')`));
}
async function entitlement({db,contract,asset}) {
 return service(db,()=>call(db,`commerce_private.reserve_entitlement('${contract}','${asset}')`));
}
async function agreement({db}) {
 await db.exec(`insert into generated_licenses(order_id,buyer_id,track_id,license_type_id,agreement_number,status,pdf_storage_path,terms_snapshot_json)
 values('${ids.order}','${ids.buyer}','${ids.live}','${ids.license}','FIXTURE-1','generated','fixture/agreement.pdf',
 '{"payment":{"paymentMode":"test","commercialRightsGranted":false},"license":{"pricePaidCents":5000,"currency":"USD"}}')`);
}
async function claim({db},task) {
 return service(db,()=>one(db,`select * from commerce_private.claim_job(${q(task)})`));
}
async function finish({db},job,success=true,retry=false) {
 return service(db,()=>call(db,`commerce_private.finish_job('${job.id}','${job.lease_token}',${success},${retry},'fixture_failure')`));
}
async function receipt(ctx) {
 const job=await claim(ctx,'receipt_generation');
 const id=await service(ctx.db,()=>call(ctx.db,`commerce_private.prepare_receipt('${job.id}','${job.lease_token}')`));
 await ctx.db.exec(`insert into storage.objects(bucket_id,name,version,metadata) values('order-receipts','${id}/receipt.pdf','v1','{"size":40,"mimetype":"application/pdf"}')`);
 await service(ctx.db,()=>call(ctx.db,`commerce_private.seal_receipt('${job.id}','${job.lease_token}','${digest}',40)`));
 await finish(ctx,job);
 return id;
}
async function withFixture(run,options) {const ctx=await setup(options);try{await run(ctx);}finally{await ctx.db.close();}}

test('capabilities default OFF; no legacy rows generated; original enum unchanged',async()=>{
 const db=await database();try{
 const flags=await one(db,'select * from commerce_private.capabilities');
 assert.deepEqual(Object.values(flags),[true,false,false,false,false,false]);
 await assert.rejects(service(db,()=>call(db,`commerce_private.reserve_asset('${ids.live}')`)),/disabled/);
 for(const table of ['order_delivery_contracts','order_asset_entitlements','order_receipts','artist_transaction_records'])
  assert.equal((await one(db,`select count(*)::int as n from public.${table}`)).n,0);
 assert.deepEqual((await db.query("select enumlabel from pg_enum where enumtypid='public.order_status'::regtype order by enumsortorder")).rows.map(r=>r.enumlabel),['pending','paid','fulfilled','refunded']);
 }finally{await db.close();}
});
test('migration replay fails closed rather than silently accepting drift',async()=>{
 const db=await database();try{await assert.rejects(db.exec(source('supabase/migrations/20261002045900_purchase_completion_foundation.sql')),/already exists/);await db.exec('rollback');}finally{await db.close();}
});
test('Buyer reads only own safe metadata; cross-buyer, Artist, Admin and anon denied',()=>withFixture(async ctx=>{
 const {db}=ctx;await entitlement(ctx);await receipt(ctx);
 for(const table of ['order_delivery_contracts','order_asset_entitlements','order_receipts']) {
  await asActor(db,ids.buyer,async()=>{
   const rows=(await db.query(`select * from public.${table}`)).rows;assert.equal(rows.length,1,table);assert.equal(rows[0].buyer_user_id,ids.buyer);
   assert.ok(!Object.keys(rows[0]).some(k=>/path|email|billing|snapshot|secret/.test(k)));
  });
  await asActor(db,buyer2,async()=>{
   assert.equal((await db.query(`select * from public.${table} where buyer_user_id='${ids.buyer}'`)).rows.length,0);
  });
  for(const actor of [ids.a,ids.admin]) await asActor(db,actor,async()=>assert.equal((await db.query(`select * from public.${table}`)).rows.length,0));
  await asActor(db,null,()=>assert.rejects(db.query(`select * from public.${table}`),/permission denied/),'anon');
 }
}));
test('No ordinary client or canonical Admin can write commerce or execute workers',()=>withFixture(async({db,contract})=>{
 for(const actor of [ids.buyer,buyer2,ids.a,ids.admin]) await asActor(db,actor,async()=>{
  for(const table of ['asset_versions','payment_events','fulfillment_jobs','contract_context','capabilities','qa_fixture_designations'])
   await assert.rejects(db.query(`select * from commerce_private.${table}`),/permission denied/);
  for(const table of ['order_delivery_contracts','order_asset_entitlements','order_receipts','artist_transaction_records'])
   await assert.rejects(db.exec(`delete from public.${table}`),/permission denied/);
  await assert.rejects(call(db,`commerce_private.security_hold('${contract}','forged')`),/permission denied/);
 });
 await service(db,async()=>{
  await assert.rejects(db.exec('update commerce_private.capabilities set foundation_enabled=true'),/permission denied/);
  await assert.rejects(db.exec('delete from commerce_private.payment_events'),/permission denied/);
  await assert.rejects(db.exec('delete from commerce_private.qa_fixture_designations'),/permission denied/);
  await assert.rejects(db.exec('update public.order_receipts set state=\'ready\''),/permission denied/);
 });
}));
test('Artist projections retain seller at purchase and contain no Buyer billing/identity',()=>withFixture(async ctx=>{
 await finish(ctx,await claim(ctx,'transaction_projection'));
 await ctx.db.exec(`update tracks set artist_user_id='${ids.b}' where id='${ids.live}'`);
 await asActor(ctx.db,ids.a,async()=>{
  const rows=(await ctx.db.query('select * from artist_transaction_records')).rows;assert.equal(rows.length,1);
  assert.equal(rows[0].seller_user_id,ids.a);assert.equal(rows[0].payable_earnings_calculated,false);
  assert.ok(!Object.keys(rows[0]).some(k=>/buyer|billing|email|payment_intent|path/.test(k)));
 });
 for(const actor of [ids.b,ids.buyer,ids.admin]) await asActor(ctx.db,actor,async()=>assert.equal((await ctx.db.query('select * from artist_transaction_records')).rows.length,0));
}));
test('Event retries and distinct paid events produce exactly one set of logical jobs',()=>withFixture(async ctx=>{
 const first=await event(ctx);assert.equal(await event(ctx),first);
 await event(ctx,{id:'evt_async',type:'checkout.session.async_payment_succeeded'});
 assert.equal((await one(ctx.db,'select count(*)::int n from commerce_private.payment_events')).n,2);
 assert.equal((await one(ctx.db,'select count(*)::int n from commerce_private.fulfillment_jobs')).n,4);
 await assert.rejects(event(ctx,{hash:'b'.repeat(64)}),/Conflicting duplicate/);
 await assert.rejects(ctx.db.exec(`insert into commerce_private.fulfillment_jobs(contract_id,task,revision,event_id) select contract_id,task,revision,event_id from commerce_private.fulfillment_jobs limit 1`),/duplicate key/);
}));
test('Payment binding rejects wrong account, order/session, live identity, amount and currency',()=>withFixture(async ctx=>{
 for(const overrides of [{account:'acct_other'},{session:'cs_live_fake'},{amount:1},{currency:'EUR'}])
  await assert.rejects(event(ctx,{id:'evt_bad',...overrides}),/relationship mismatch/);
 await assert.rejects(event(ctx,{id:'evt_bad',state:'REFUNDED',type:'charge.refunded',refund:1}),/Incompatible/);
 assert.equal((await one(ctx.db,'select count(*)::int n from commerce_private.payment_events')).n,1);
}));
test('Asset source and file identities survive catalog detachment, service-role overwrite and delete',()=>withFixture(async({db,asset})=>{
 await db.exec(`update tracks set audio_file_path=null where id='${ids.live}'`);
 for(const change of ["delete from storage.objects where bucket_id='track-audio'",`update storage.objects set version='v2' where name='${asset}/master'`,
 `update storage.objects set metadata='{}' where name='${asset}/master'`,`delete from storage.objects where name='${asset}/master'`])
  await assert.rejects(service(db,()=>db.exec(change)),/immutable|foreign key/);
 await assert.rejects(db.exec(`update commerce_private.asset_versions set sha256='${'b'.repeat(64)}' where id='${asset}'`),/Immutable/);
 await assert.rejects(db.exec(`delete from commerce_private.asset_versions where id='${asset}'`),/retained/);
 await assert.rejects(service(db,()=>call(db,`commerce_private.seal_asset('${asset}','${'b'.repeat(64)}',100,'audio/wav')`)),/mismatch/);
}));
test('New private buckets deny object enumeration even if a broad permissive policy exists',()=>withFixture(async({db})=>{
 assert.deepEqual((await db.query("select id,public from storage.buckets where id in ('purchase-assets','order-receipts') order by id")).rows,
 [{id:'order-receipts',public:false},{id:'purchase-assets',public:false}]);
 await db.exec('create policy dangerous_future_policy on storage.objects for all to authenticated,anon using(true) with check(true)');
 await assert.rejects(service(db,()=>db.exec("update storage.buckets set public=true where id='purchase-assets'")),/must remain private/);
 for(const actor of [ids.buyer,ids.a,ids.admin]) await asActor(db,actor,async()=>{
  assert.equal((await db.query("select * from storage.objects where bucket_id='purchase-assets'")).rows.length,0);
  await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values('purchase-assets','forged')"),/row-level security/);
 });
}));
test('Real catalog TEST order gets no master entitlement even when paid and all flags enabled',()=>withFixture(async ctx=>{
 await agreement(ctx);
 await assert.rejects(entitlement(ctx),/synthetic/);
 await assert.rejects(ctx.db.exec(`insert into order_asset_entitlements(contract_id,order_id,buyer_user_id,asset_version_id)
 values('${ctx.contract}','${ids.order}','${ids.buyer}','${ctx.asset}')`),/Real-catalog TEST/);
 assert.equal((await one(ctx.db,'select count(*)::int n from order_asset_entitlements')).n,0);
 const receiptId=await receipt(ctx);assert.ok(receiptId);
},{qa:false}));
test('Synthetic designation is specific to both buyer and asset; no commercial rights',()=>withFixture(async ctx=>{
 const id=await entitlement(ctx);assert.equal(await entitlement(ctx),id);
 await assert.rejects(service(ctx.db,()=>call(ctx.db,`commerce_private.reserve_entitlement('${ctx.other}','${ctx.asset}')`)),/synthetic/);
 await assert.rejects(ctx.db.exec(`update order_asset_entitlements set commercial_rights_granted=true where id='${id}'`),/immutable/i);
 await assert.rejects(ctx.db.exec(`update order_delivery_contracts set payment_mode='live' where id='${ctx.contract}'`),/Immutable/);
 await assert.rejects(ctx.db.exec(`insert into order_asset_entitlements(contract_id,order_id,buyer_user_id,asset_version_id)
 values('${ctx.contract}','${ids.order}','${buyer2}','${ctx.asset}')`),/foreign key|duplicate key/);
}));
test('Activation requires verified paid evidence, exact TEST agreement and active capability',()=>withFixture(async ctx=>{
 await entitlement(ctx);const job=await claim(ctx,'entitlement_activation');
 await assert.rejects(finish(ctx,job),/prerequisites/);
 await agreement(ctx);
 await ctx.db.exec('update commerce_private.capabilities set entitlement_activation_enabled=false');
 await assert.rejects(finish(ctx,job),/disabled/);
 await ctx.db.exec('update commerce_private.capabilities set entitlement_activation_enabled=true');
 await finish(ctx,job);
 const row=await one(ctx.db,'select state,commercial_rights_granted from order_asset_entitlements');
 assert.deepEqual(row,{state:'active',commercial_rights_granted:false});
 await assert.rejects(finish(ctx,job),/Stale worker lease/);
}));
test('Worker retries are leased, fenced, bounded and logically idempotent',()=>withFixture(async ctx=>{
 const job=await claim(ctx,'transaction_projection');assert.equal(await claim(ctx,'transaction_projection'),undefined);
 await ctx.db.exec(`update commerce_private.fulfillment_jobs set lease_until=now()-interval '1 second' where id='${job.id}'`);
 const retry=await claim(ctx,'transaction_projection');assert.notEqual(retry.lease_token,job.lease_token);
 await assert.rejects(finish(ctx,job),/Stale/);await finish(ctx,retry);
 assert.equal((await one(ctx.db,'select count(*)::int n from artist_transaction_records')).n,1);
 const failed=await claim(ctx,'asset_preparation');await finish(ctx,failed,false,true);
 assert.equal(await claim(ctx,'asset_preparation'),undefined);
 await ctx.db.exec(`update commerce_private.fulfillment_jobs set available_at=now(),attempts=4 where id='${failed.id}'`);
 const last=await claim(ctx,'asset_preparation');await finish(ctx,last,false,true);
 const row=await one(ctx.db,`select state,retryable,attempts from commerce_private.fulfillment_jobs where id='${last.id}'`);
 assert.deepEqual(row,{state:'failed',retryable:false,attempts:5});
}));
test('Delivery predicate rechecks canonical buyer, feature gate and QA revocation after activation',()=>withFixture(async ctx=>{
 const id=await entitlement(ctx);await agreement(ctx);await finish(ctx,await claim(ctx,'entitlement_activation'));
 const allowed=buyer=>service(ctx.db,()=>call(ctx.db,`commerce_private.can_deliver('${id}','${buyer}')`));
 assert.equal(await allowed(ids.buyer),true);assert.equal(await allowed(buyer2),false);assert.equal(await allowed(ids.a),false);
 await ctx.db.exec('update commerce_private.capabilities set foundation_enabled=false');assert.equal(await allowed(ids.buyer),false);
 await ctx.db.exec('update commerce_private.capabilities set foundation_enabled=true');
 await ctx.db.exec(`update commerce_private.qa_fixture_designations set revoked_at=now() where asset_version_id='${ctx.asset}'`);
 assert.equal(await allowed(ids.buyer),false);assert.equal((await one(ctx.db,'select state from order_asset_entitlements')).state,'suspended');
 await assert.rejects(ctx.db.exec('update commerce_private.qa_fixture_designations set revoked_at=null'),/immutable/);
}));
test('Retirement suspends existing access; existing file bytes remain immutable',()=>withFixture(async ctx=>{
 await agreement(ctx);await finish(ctx,await claim(ctx,'entitlement_activation'));
 await ctx.db.exec(`update commerce_private.asset_versions set retired_at=now() where id='${ctx.asset}'`);
 assert.equal((await one(ctx.db,'select state from order_asset_entitlements')).state,'suspended');
 await assert.rejects(ctx.db.exec(`update commerce_private.asset_versions set retired_at=null where id='${ctx.asset}'`),/Immutable/);
}));
test('Refunds/disputes block active access; stale paid events cannot restore it; receipt/agreement preserved',()=>withFixture(async ctx=>{
 await entitlement(ctx);await agreement(ctx);await finish(ctx,await claim(ctx,'entitlement_activation'));
 const original=await receipt(ctx);
 await event(ctx,{id:'evt_partial',state:'PARTIALLY_REFUNDED',type:'charge.refunded',refund:100});
 assert.equal((await one(ctx.db,'select state from order_asset_entitlements')).state,'suspended');
 await event(ctx,{id:'evt_latepaid'});
 assert.equal((await one(ctx.db,`select state from commerce_private.order_states where contract_id='${ctx.contract}'`)).state,'PARTIALLY_REFUNDED');
 await event(ctx,{id:'evt_dispute',state:'DISPUTED',type:'charge.dispute.created'});
 await event(ctx,{id:'evt_refund',state:'REFUNDED',type:'charge.refunded',refund:5000});
 assert.equal((await one(ctx.db,'select state from order_asset_entitlements')).state,'revoked');
 await service(ctx.db,()=>call(ctx.db,`commerce_private.security_hold('${ctx.contract}','review_required')`));
 await event(ctx,{id:'evt_paidagain'});
 assert.equal((await one(ctx.db,`select state from commerce_private.order_states where contract_id='${ctx.contract}'`)).state,'SECURITY_HOLD');
 assert.equal((await one(ctx.db,`select state from order_receipts where id='${original}'`)).state,'ready');
 assert.equal((await one(ctx.db,'select status from generated_licenses')).status,'generated');
}));
test('PAYMENT_FAILED has no receipt job and no activation; no historical contract freeze',()=>withFixture(async ctx=>{
 await event(ctx,{id:'evt_failed',state:'PAYMENT_FAILED',type:'checkout.session.async_payment_failed'});
 assert.deepEqual((await ctx.db.query('select task from commerce_private.fulfillment_jobs')).rows,[{task:'transaction_projection'}]);
 await assert.rejects(service(ctx.db,()=>call(ctx.db,`commerce_private.freeze_contract('${ids.order}','production','acct_other')`)),/conflict|mismatch/);
},{paid:false}));
test('Receipt facts/artifacts and purchase history resist mutation or cascading parent deletion',()=>withFixture(async ctx=>{
 const id=await receipt(ctx);
 await assert.rejects(ctx.db.exec(`update order_receipts set amount_minor=1 where id='${id}'`),/immutable/);
 await assert.rejects(ctx.db.exec(`delete from order_receipts where id='${id}'`),/retained/);
 await assert.rejects(service(ctx.db,()=>ctx.db.exec(`update storage.objects set version='v2' where name='${id}/receipt.pdf'`)),/immutable/);
 await assert.rejects(ctx.db.exec(`delete from orders where id='${ids.order}'`),/foreign key/);
 await assert.rejects(ctx.db.exec(`delete from auth.users where id='${ids.buyer}'`),/foreign key/);
}));
test('Foundation is disconnected from deployed application; no signed URL/download/Stripe code introduced',()=>{
 for(const path of ['app/api/webhooks/stripe/route.ts','services/stripe/server.ts','services/storage/track-assets.ts'])
  assert.doesNotMatch(source(path),/commerce_private|order_asset_entitlements|order_delivery_contracts/);
 const sql=readFileSync(new URL('../supabase/migrations/20261002045900_purchase_completion_foundation.sql',import.meta.url),'utf8');
 assert.doesNotMatch(sql,/createSignedUrl|STRIPE_SECRET|create invoice|alter type public.order_status/i);
});
test('Read-only legacy classifier fails closed and distinguishes all four classes',()=>{
 assert.equal(classifyLegacyOrder({status:'pending'}).classification,'DO_NOT_BACKFILL');
 assert.equal(classifyLegacyOrder({status:'fulfilled'}).classification,'INCOMPLETE');
 const paid={status:'fulfilled',has_paid_at:true,has_payment_intent:true,agreement_status:'generated',has_agreement_path:true};
 assert.equal(classifyLegacyOrder(paid).classification,'AMBIGUOUS');
 const complete={...paid,test_session:true,payment_classification:{paymentMode:'test',commercialRightsGranted:false},snapshot_order_matches:true,
 snapshot_buyer_matches:true,snapshot_track_matches:true,amount_cents:5000,snapshot_amount:'5000',currency:'USD',snapshot_currency:'USD',verified_payment_evidence:true,
 frozen_seller_rights:true,frozen_asset_version:true};
 assert.equal(classifyLegacyOrder(complete).classification,'SAFE_TO_MAP');
 assert.equal(classifyLegacyOrder({...complete,snapshot_amount:'1'}).classification,'DO_NOT_BACKFILL');
 assert.equal(classifyLegacyOrder(complete).masterEntitlement,'DENIED');
});
test('Payment and contract records are immutable even for the database owner',()=>withFixture(async ctx=>{
 await assert.rejects(ctx.db.exec("update commerce_private.payment_events set amount_minor=1"),/Immutable/);
 await assert.rejects(ctx.db.exec("delete from commerce_private.payment_events"),/Immutable/);
 await assert.rejects(ctx.db.exec("update commerce_private.contract_context set rights_snapshot='[]'"),/Immutable/);
 await assert.rejects(ctx.db.exec("delete from commerce_private.state_history"),/Immutable/);
}));
test('Revoked agreement readiness and canonical role change immediately fail delivery predicate',()=>withFixture(async ctx=>{
 const id=await entitlement(ctx);await agreement(ctx);await finish(ctx,await claim(ctx,'entitlement_activation'));
 const allowed=()=>service(ctx.db,()=>call(ctx.db,`commerce_private.can_deliver('${id}','${ids.buyer}')`));
 assert.equal(await allowed(),true);
 await ctx.db.exec("update generated_licenses set status='failed'");assert.equal(await allowed(),false);
 await ctx.db.exec("update generated_licenses set status='generated'");
 await ctx.db.exec(`update user_profiles set role='artist' where id='${ids.buyer}'`);assert.equal(await allowed(),false);
}));
