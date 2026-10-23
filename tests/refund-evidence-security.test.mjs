import test from 'node:test';
import assert from 'node:assert/strict';
import {database,ids,asActor} from './helpers/artist-baseline-db.mjs';
import {providerFixture,endpoint,credential} from './helpers/financial-provider-fixture.mjs';
import {call,claimFixtureAgreement} from './helpers/purchase-legal-fixture.mjs';
import {beginDownload,finishDownload} from './helpers/secure-delivery-fixture.mjs';
const fixture=async fn=>{const db=await database();try{await fn(db);}finally{await db.close();}};
const providerRefund=(f,amount=1000)=>{
 f.state.charge.amount_refunded=amount;
 f.state.refunds=[{id:'re_review',charge:'ch_fixture',amount,currency:'usd',status:'succeeded',balance_transaction:'txn_reviewrefund'}];
 f.state.balances.set('txn_reviewrefund',{id:'txn_reviewrefund',source:'re_review',type:'refund',amount:-amount,fee:0,net:-amount,currency:'usd',created:1700000001,exchange_rate:null});
};
const paid=async db=>{const f=await providerFixture(db);await f.capture(f.event());await f.run();return f;};
const count=async(db,table)=>Number((await db.query('select count(*) n from '+table)).rows[0].n);
const assertNoCanonicalRefund=async f=>assert.equal(Number((await f.db.query("select coalesce(max(refunded_minor),0) n from commerce_private.payment_events")).rows[0].n),0);

test('IR-SEC-01 signed positive refund semantics deny new and in-flight downloads before canonical event',()=>fixture(async db=>{
 const f=await paid(db),inflight=await beginDownload(f.c);assert.equal(inflight.allowed,true);providerRefund(f);
 const original=await call(db,'read_accepted_purchase',[f.c.order]);
 await f.capture(f.event('evt_reviewupdated','charge.updated',f.state.charge));
 assert.equal((await beginDownload(f.c)).allowed,false);assert.equal(await finishDownload(f.c,inflight),false);
 assert.equal((await f.run()).retried,1);assert.equal((await beginDownload(f.c)).allowed,false);
 await assertNoCanonicalRefund(f);assert.deepEqual(await call(db,'read_accepted_purchase',[f.c.order]),original);
 assert.equal(await count(db,'generated_licenses'),1);
}));

test('IR-SEC-02 refund evidence received before order binding is enforced at later purchase assertion',()=>fixture(async db=>{
 const f=await paid(db);await db.exec("update orders set stripe_payment_intent_id=null,stripe_checkout_session_id=null");
 providerRefund(f);await f.capture(f.event('evt_reviewunbound','charge.updated',f.state.charge));
 assert.equal((await db.query("select checkout_hold from orders")).rows[0].checkout_hold,false);
 await db.exec("update orders set stripe_payment_intent_id='pi_fixture',stripe_checkout_session_id='cs_test_fixture'");
 assert.equal((await beginDownload(f.c)).allowed,false);
 await assert.rejects(db.query("select licensing_private.assert_purchase('"+f.c.order+"',true)"),/adverse/i);
 await assertNoCanonicalRefund(f);
}));

test('IR-SEC-03 old paid event API refresh retains new refund proof and holds without canonical facts',()=>fixture(async db=>{
 const f=await paid(db);const outstanding=await beginDownload(f.c);
 await f.capture(f.event('evt_reviewrefresh'));providerRefund(f);
 assert.equal((await f.run()).retried,1);
 assert.equal((await beginDownload(f.c)).allowed,false);assert.equal(await finishDownload(f.c,outstanding),false);await assertNoCanonicalRefund(f);
 const proof=(await db.query("select detail from finance_private.provider_alerts where code='authenticated_adverse_provider_evidence'")).rows[0].detail;
 assert.equal(proof.rejectedProof.charge.refunded,1000);assert.match(proof.proofHash,/^[a-f0-9]{64}$/);
 const ops=await f.operations();assert.doesNotMatch(JSON.stringify(ops),/rejectedProof|proofHash|raw_body|credential_scope/);
 assert.equal(await count(db,'finance_private.journals'),2);
}));

test('IR-SEC-04 authenticated API dispute absent from canonical stream holds and preserves proof',()=>fixture(async db=>{
 const f=await paid(db);await f.capture(f.event('evt_reviewdiscovery'));
 const d={id:'dp_review',livemode:false,charge:'ch_fixture',payment_intent:'pi_fixture',amount:5000,currency:'usd',status:'needs_response',balance_transactions:['txn_reviewdispute']};
 f.state.disputes=[d];f.state.balances.set('txn_reviewdispute',{id:'txn_reviewdispute',source:d.id,type:'adjustment',amount:-5000,fee:150,net:-5150,currency:'usd',created:1700000001,exchange_rate:null});
 assert.equal((await f.run()).retried,1);assert.equal((await beginDownload(f.c)).allowed,false);
 assert.equal(await count(db,"(select 1 from commerce_private.payment_events where payment_state='DISPUTED') q"),0);
 assert.equal(await count(db,"(select 1 from finance_private.provider_alerts where code='authenticated_adverse_provider_evidence') q"),1);
 assert.equal(await count(db,'finance_private.journals'),2);
}));

test('IR-SEC-05 pending agreement issuance denies signed semantic refund with no issued license',()=>fixture(async db=>{
 const f=await providerFixture(db,{paid:false});await claimFixtureAgreement(db,f.c.order);
 await f.payment('evt_reviewpaid','checkout.session.completed','PAID');
 await db.query("select licensing_private.assert_purchase('"+f.c.order+"',true)");
 providerRefund(f);f.state.charge.paid=true;await f.capture(f.event('evt_reviewbeforelicense','charge.updated',f.state.charge));
 await assert.rejects(db.query("select licensing_private.assert_purchase('"+f.c.order+"',true)"),/adverse|held|hold/i);
 await assert.rejects(call(db,'claim_order_agreement_job',[f.c.order]),/adverse|held|hold|eligible/i);
 assert.equal(await count(db,'generated_licenses'),0);
}));

test('IR-SEC-06 canonical refund recovery posts original economics once and never clears the access hold',()=>fixture(async db=>{
 const f=await paid(db);providerRefund(f);await f.capture(f.event('evt_reviewlater','charge.updated',f.state.charge));await f.run();
 await f.payment('evt_reviewcanonical','charge.refunded','PARTIALLY_REFUNDED',1000);await f.due();assert.equal((await f.run()).posted,1);
 assert.equal((await beginDownload(f.c)).allowed,false);assert.equal(await count(db,"(select 1 from finance_private.journals where kind='refund') q"),1);
 assert.equal(await count(db,'generated_licenses'),1);
}));

test('IR-SEC-07 supported zero-refund charge update preserves valid entitlement',()=>fixture(async db=>{
 const f=await paid(db);await f.capture(f.event('evt_reviewzero','charge.updated',f.state.charge));
 assert.equal((await beginDownload(f.c)).allowed,true);assert.equal((await f.run()).posted,1);
 assert.equal((await beginDownload(f.c)).allowed,true);
}));

test('IR-SEC-08 pure predicate remains private and ordinary actors cannot post or mutate adverse evidence',()=>fixture(async db=>{
 const f=await paid(db);
 for(const [who,role] of [[ids.buyer,'authenticated'],[ids.a,'authenticated'],['','anon']])await asActor(db,who,async()=>{
  await assert.rejects(db.query("select finance_private.adverse_provider_summary('charge.updated','{}')"),/permission/);
  await assert.rejects(call(db,'claim_financial_provider_job',[endpoint,credential]),/permission/);
  await assert.rejects(db.exec("delete from finance_private.provider_alerts"),/permission/);
 },role);
}));

test('IR-SEC-09 API refund hold precedes a missing canonical PAID fact and blocks pending issuance',()=>fixture(async db=>{
 const f=await providerFixture(db,{paid:false});await claimFixtureAgreement(db,f.c.order);
 f.state.charge.paid=true;f.state.charge.balance_transaction='txn_charge';providerRefund(f);
 await f.capture(f.event('evt_reviewmissingpaid'));
 assert.equal((await db.query('select checkout_hold from orders')).rows[0].checkout_hold,false);
 assert.equal((await f.run()).retried,1);
 assert.equal((await db.query('select checkout_hold from orders')).rows[0].checkout_hold,true);
 await assert.rejects(db.query("select licensing_private.assert_purchase('"+f.c.order+"',true)"),/adverse|hold|held/i);
 assert.equal(await count(db,'generated_licenses'),0);await assertNoCanonicalRefund(f);
}));
