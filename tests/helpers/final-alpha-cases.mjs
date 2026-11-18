// Synthetic local integration only. Provider identity and byte transport have separate browser/native suites.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {published} from './catalog-management-fixture.mjs';
import {seedDelivery,beginDownload,finishDownload} from './secure-delivery-fixture.mjs';
import {call,terms,financial} from './purchase-legal-fixture.mjs';
import {ids,asActor} from './artist-baseline-db.mjs';
import {balanced,payment,bind,freeze,prepare as payout,act} from './accounting-fixture.mjs';
import * as analytics from './analytics-system-fixture.mjs';
import * as notices from './notifications-fixture.mjs';
import {admin} from './sec-fixture.mjs';
const scalar=async(db,sql,args=[]) => (await db.query(sql,args)).rows[0].n;
async function prepare(db,paid=true){
 await db.exec("insert into storage.buckets(id,name,public) values('rights-evidence','rights-evidence',false) on conflict do nothing");
 const catalog=await published(db);
 // Publication has already sealed its original manifest. A different reviewed deliverable set needs a new offer, never an overwrite.
 const offer=await call(db,'publish_licensing_offer',[ids.admin,ids.live,ids.license,catalog.rights.rights,terms,financial,'SYNTHETIC integrated deliverable review']);
 const ctx=await seedDelivery(db,{paid,review:{offer,rights:catalog.rights.rights,evidence:catalog.rights.id}});
 await db.exec('update finance_private.capabilities set synthetic_posting_enabled=true');
 return {...ctx,catalog};
}
export function register(factory,label){
 test(label+' approved source/rights/catalog → acceptance/payment/license/delivery → accounting/SEC',()=>factory(async db=>{
  const c=await prepare(db);
  const accepted=(await db.query('select snapshot_hash from licensing_private.acceptances where order_id=$1',[c.order])).rows[0].snapshot_hash;
  assert.ok(accepted);assert.equal(await scalar(db,'select count(*)::int n from generated_licenses where order_id=$1',[c.order]),1);
  assert.equal(await scalar(db,'select count(*)::int n from order_asset_entitlements where order_id=$1 and asset_version_id=$2',[c.order,c.excluded]),0);
  const d=await beginDownload(c);assert.equal(d.allowed,true);assert.equal(await finishDownload(c,d),true);
  assert.equal(await call(db,'record_asset_transfer',[ids.buyer,d.authorizationId,'started',0]),true);
  assert.equal(await call(db,'record_asset_transfer',[ids.buyer,d.authorizationId,'stream_exhausted',100]),true);
  await assert.rejects(beginDownload(c,randomUUID(),ids.b),/Canonical buyer/);
  await call(db,'post_financial_order',[c.order]);const n=await scalar(db,'select count(*)::int n from finance_private.journals');assert.ok(n>0);
  await call(db,'post_financial_order',[c.order]);assert.equal(await scalar(db,'select count(*)::int n from finance_private.journals'),n);assert.ok(await balanced(db));
  await admin(db,()=>call(db,'accounting_admin_report',[1,20]));
  await asActor(db,ids.buyer,()=>assert.rejects(call(db,'accounting_admin_report',[1,20]),/Admin/));
  assert.equal((await db.query('select snapshot_hash from licensing_private.acceptances where order_id=$1',[c.order])).rows[0].snapshot_hash,accepted);
 }));
 test(label+' unpaid/failed checkout cannot issue a license, deliver bytes or book revenue',()=>factory(async db=>{
  const c=await prepare(db,false);assert.equal((await beginDownload(c)).allowed,false);
  await db.query("update orders set status='paid',paid_at=clock_timestamp() where id=$1",[c.order]);
  await assert.rejects(call(db,'claim_order_agreement_job',[c.order]));
  await db.query("update orders set stripe_checkout_session_id='cs_test_fixture',stripe_payment_intent_id='pi_fixture' where id=$1",[c.order]);
  await payment(db,c,'PAYMENT_FAILED');await call(db,'post_financial_order',[c.order]);
  assert.equal(await scalar(db,'select count(*)::int n from generated_licenses'),0);assert.equal(await scalar(db,'select count(*)::int n from finance_private.journals'),0);assert.equal((await beginDownload(c)).allowed,false);
 }));
 test(label+' analytics/email retries and adverse payment recovery preserve the original contract and balanced ledger',()=>factory(async db=>{
  const c=await prepare(db);await call(db,'post_financial_order',[c.order]);
  const original=(await db.query('select snapshot_hash from licensing_private.acceptances where order_id=$1',[c.order])).rows[0].snapshot_hash;
  assert.equal(await analytics.collect(db),0);assert.equal(await notices.collect(db),0);
  await analytics.enable(db);await notices.enable(db);assert.ok(await analytics.collect(db)>0);assert.ok(await notices.collect(db)>0);
  const a=await analytics.claim(db);assert.ok(a);await call(db,'fail_analytics_event',[a.id,a.lease_id,'configuration_error',null]);
  const n=await notices.claim(db);assert.ok(n);assert.equal(await notices.finish(db,n,'transient',null),true);
  for(const [state,refund]of [['PARTIALLY_REFUNDED',1000],['DISPUTED',1000]]){
   await payment(db,c,state,refund);await call(db,'post_financial_order',[c.order]);const journals=await scalar(db,'select count(*)::int n from finance_private.journals');await call(db,'post_financial_order',[c.order]);assert.equal(await scalar(db,'select count(*)::int n from finance_private.journals'),journals);assert.ok(await balanced(db));assert.equal((await beginDownload(c)).allowed,false);
  }
  assert.equal(await scalar(db,'select count(*)::int n from generated_licenses'),1);
  assert.equal((await db.query('select snapshot_hash from licensing_private.acceptances where order_id=$1',[c.order])).rows[0].snapshot_hash,original);
 }));
 for(const zone of ['Pacific/Pago_Pago','Pacific/Kiritimati'])test(label+' payout fixture follows database calendar in '+zone,()=>factory(async db=>{
  await db.query("select set_config('TimeZone',$1,false)",[zone]);
  const c=await prepare(db);await call(db,'post_financial_order',[c.order]);
  await bind(db,c);await freeze(db,c);const id=await payout(db,c);
  const dates=(await db.query('select scheduled_for::text due,current_date::text today from finance_private.payout_requests where id=$1',[id])).rows[0];assert.equal(dates.due,dates.today);
  await act(db,id,1,'schedule');await act(db,id,2,'simulate_complete');assert.ok(await balanced(db));
 }));

}
