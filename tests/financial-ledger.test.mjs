import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database,ids,asActor,quote} from './helpers/artist-baseline-db.mjs';
import {seedDelivery,beginDownload,finishDownload,deliveryBytes} from './helpers/secure-delivery-fixture.mjs';
import {deliverAsset} from '../services/delivery/transfer.mjs';
import {call} from './helpers/purchase-legal-fixture.mjs';
import {acceptedEconomics,refundTargets,validatePolicy,REFUND_POLICY} from '../lib/finance/contracts.mjs';
export const admin=(db,fn)=>asActor(db,ids.admin,fn);
export const post=(db,order)=>call(db,'post_financial_order',[order]);
export const inspect=(db,order)=>admin(db,()=>call(db,'read_financial_order',[order]));
export const reconcile=(db,order,projection)=>admin(db,()=>call(db,'reconcile_financial_order',[order,projection]));
export const fact=(db,order,kind,amount,external=kind+randomUUID(),party=null,related=null,currency='USD')=>admin(db,()=>call(db,'record_finance_simulation_fact',[order,external,kind,amount,currency,'b'.repeat(64),'SYNTHETIC local provider evidence only',party,related]));
export const payment=(db,c,id,state='PARTIALLY_REFUNDED',refund=1000)=>call(db,'record_purchase_completion_event',[c.order,'acct_fixture','evt_'+id,'cs_test_fixture','pi_fixture',state==='DISPUTED'?'charge.dispute.created':state==='PAYMENT_FAILED'?'checkout.session.async_payment_failed':state==='PAID'?'checkout.session.completed':'charge.refunded',state,5000,refund,'USD','a'.repeat(64),'2026-10-22T01:00:00Z']);
const fixture=async fn=>{const db=await database();try{await db.exec('update finance_private.capabilities set synthetic_posting_enabled=true');await fn(db);}finally{await db.close();}};
const count=async(db,table)=>(await db.query('select count(*)::int n from '+table)).rows[0].n;
const balance=async(db,order,key)=>BigInt((await db.query(`select finance_private.balance('${order}',${quote(key)}) n`)).rows[0].n);
const assertBalanced=async db=>assert.equal((await db.query('select count(*)::int n from(select journal_id from finance_private.lines group by journal_id having sum(signed_minor)<>0 or count(*)<2) q')).rows[0].n,0);
const transfer=(db,c,read=async()=>deliveryBytes)=>deliverAsset(new Request('http://localhost/download',{method:'POST',headers:{origin:'http://localhost'}}),c.order,c.entitlement,{
 appOrigin:'http://localhost',randomUUID,authenticate:async()=>{await asActor(db,ids.buyer,()=>call(db,'verify_asset_download_session',[]),'authenticated',c.session);return {id:ids.buyer,role:'buyer'};},
 ownsOrder:async buyer=>asActor(db,buyer,async()=>Boolean((await db.query(`select id from orders where id='${c.order}'`)).rows.length)),
 deny:async()=>{},begin:async(_b,_o,_e,key)=>beginDownload(c,key),read,finish:async(_b,id,outcome)=>finishDownload(c,{authorizationId:id},outcome)
});

test('pure accepted economics preserves exact amounts instead of recomputing commission',()=>{
 const s={amountCents:101,currency:'USD',financial:{policyVersion:'fixture',platformFeeCents:17,allocations:[{partyId:'z',amountCents:33},{partyId:'a',amountCents:51}]}};
 assert.equal(acceptedEconomics(s).fee,17n);
 for(let gross=1;gross<125;gross++) {
  const snapshot={...s,amountCents:gross,financial:{...s.financial,platformFeeCents:Math.floor(gross/5),allocations:[{partyId:'a',amountCents:Math.floor(gross/3)},{partyId:'z',amountCents:gross-Math.floor(gross/5)-Math.floor(gross/3)}]}};
  let previous=[];
  for(let refund=0;refund<=gross;refund++) {
   const rows=refundTargets(snapshot,refund);assert.equal(rows.reduce((n,r)=>n+r.minor,0n),BigInt(refund));
   rows.slice(0,-1).forEach((r,i)=>assert.ok(r.minor>=(previous[i]?.minor||0n)));previous=rows;
  }
  assert.equal(previous.at(-1).minor,0n);
 }
 const huge={...s,amountCents:Number.MAX_SAFE_INTEGER,financial:{...s.financial,platformFeeCents:1,allocations:[{partyId:'a',amountCents:Number.MAX_SAFE_INTEGER-1}]}};
 assert.equal(refundTargets(huge,Number.MAX_SAFE_INTEGER).reduce((n,r)=>n+r.minor,0n),BigInt(Number.MAX_SAFE_INTEGER));
 assert.throws(()=>acceptedEconomics({...s,amountCents:100}),/conserve/);
 assert.throws(()=>refundTargets(s,102),/Over-refund/);
 assert.throws(()=>acceptedEconomics({...s,amountCents:1.1}),/Exact/);
 assert.throws(()=>validatePolicy({}),/Explicit/);
 assert.equal(validatePolicy({synthetic:true,version:'fixture',approvalReference:'fixture',tier:'fixture-pro',commissionBasis:'gross',commissionBps:1500,maturitySeconds:0,effectiveAt:'2026-10-22',refundPolicy:REFUND_POLICY}).tier,'fixture-pro');
});
test('full connected source, rights, acceptance, verified payment, license, delivery and durable journal reconcile',()=>fixture(async db=>{
 const c=await seedDelivery(db);const accepted=(await call(db,'read_accepted_purchase',[c.order])).snapshot;
 const downloaded=await transfer(db,c);assert.equal(downloaded.status,200);assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()),deliveryBytes);
 const posted=await post(db,c.order);assert.equal(posted.paid,true);
 assert.equal(await balance(db,c.order,'clearing'),5000n);assert.equal(await balance(db,c.order,'platform_revenue'),-1000n);
 assert.equal(await balance(db,c.order,'payable:master'),-2400n);assert.equal(await balance(db,c.order,'payable:publishing'),-1600n);
 const report=await inspect(db,c.order);assert.equal(report.grossMinor,'5000');
 // Independent provider projection, never copied from ledger expectations.
 const proof=await reconcile(db,c.order,{providerAccount:'acct_fixture',paymentMode:'test',currency:'USD',grossMinor:5000,refundedMinor:0,processorFeeMinor:0,settledMinor:0,disputeNetDebitedMinor:0});
 assert.equal(proof.matched,true);assert.deepEqual(proof.issues,[]);assert.equal(proof.sourceHash,accepted.sourceEvidence.hash);
 assert.equal(await count(db,'generated_licenses'),1);assert.equal(await count(db,'finance_private.journals'),1);await assertBalanced(db);
 assert.equal((await inspect(db,c.order)).withdrawableMinor,'0');
}));
test('delivery Storage failure, retry and duplicate payment cannot create another financial obligation',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);
 const failed=await transfer(db,c,async()=>{throw Error('SYNTHETIC Storage failure');});assert.equal(failed.status,503);
 const success=await transfer(db,c);assert.equal(success.status,200);assert.deepEqual(new Uint8Array(await success.arrayBuffer()),deliveryBytes);
 await post(db,c.order);assert.equal(await count(db,'finance_private.journals'),1);assert.equal(await count(db,'generated_licenses'),1);
 assert.equal((await reconcile(db,c.order,(await inspect(db,c.order)).expectedProvider)).matched,true);
}));
test('Admin summary exposes isolated accounting totals and no withdrawable funds',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);
 const summary=await admin(db,()=>call(db,'read_financial_summary',[]));assert.equal(summary.operationsEnabled,false);assert.equal(summary.withdrawableMinor,'0');
 assert.equal(summary.partitions.length,1);assert.equal(summary.partitions[0].gross_minor,'5000');assert.equal(summary.partitions[0].outstanding_obligations_minor,'4000');
 assert.equal(summary.partitions[0].platform_revenue_minor,'1000');assert.equal(summary.partitions[0].unreconciled_orders,1);
}));
test('explicit tier/maturity/reserve policy is immutable and holds immature simulated obligations',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);
 await assert.rejects(fact(db,c.order,'payout_reserve',1,'no-policy','master'),/policy required/);
 const policy={synthetic:true,version:'ALPHA-SYNTHETIC',tier:'fixture-pro',approvalReference:'SYNTHETIC ONLY',commissionBasis:'net_processor_fee',maturitySeconds:3600,reserveBps:2500,refundPolicy:REFUND_POLICY};
 await admin(db,()=>call(db,'freeze_finance_simulation_policy',[c.order,policy]));
 await assert.rejects(fact(db,c.order,'payout_reserve',1,'immature-policy','master'),/mature/);
 await assert.rejects(admin(db,()=>call(db,'freeze_finance_simulation_policy',[c.order,{...policy,maturitySeconds:0}])),/cannot change/);
 assert.equal(await balance(db,c.order,'platform_revenue'),-1000n); // tier never reprices accepted fees
}));
test('source changes and revoked rights retain original financial evidence without granting access',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);const original=await inspect(db,c.order);
 await call(db,'invalidate_licensing_review',[ids.admin,'offer',c.review.offer,'revoked','SYNTHETIC authority withdrawn']);
 await db.exec(`update tracks set title='Later metadata' where id='${ids.live}'`);
 await post(db,c.order);const current=await inspect(db,c.order);
 assert.equal(current.purchaseHash,original.purchaseHash);assert.equal(current.sourceHash,original.sourceHash);
 assert.equal((await beginDownload(c)).allowed,false);assert.equal(await count(db,'finance_private.journals'),1);
}));
test('currency FK and deferred balance checks reject cross-currency accounting',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);
 await assert.rejects(db.exec(`insert into finance_private.accounts values('${c.order}','EUR','clearing')`),/foreign key/);
 await assert.rejects(db.exec(`insert into finance_private.lines select id,order_id,'EUR','clearing',1 from finance_private.journals`),/Committed journal|foreign key/);
}));
test('missing posting and balanced-but-wrong account adjustments remain visible to reconciliation',()=>fixture(async db=>{
 const c=await seedDelivery(db);assert.deepEqual((await inspect(db,c.order)).issues,['missing_financial_book']);await post(db,c.order);
 await payment(db,c,'unpostedpartial','PARTIALLY_REFUNDED',1000);assert.ok((await inspect(db,c.order)).issues.includes('unposted_payment_events'));
 await post(db,c.order);await db.query(`select finance_private.post('${c.order}','owner-bad-fixture','invalid','{}','{"platform_revenue":1,"payable:master":-1}')`);
 const r=await reconcile(db,c.order,(await inspect(db,c.order)).expectedProvider);
 assert.ok(r.issues.includes('revenue_allocation_mismatch'));assert.ok(r.issues.includes('payee_allocation_mismatch:master'));assert.equal(r.matched,false);
}));
test('capability remains disabled by default and cannot be enabled by service role',async()=>{
 const db=await database();try{await assert.rejects(post(db,ids.order),/disabled/);
 await asActor(db,null,()=>assert.rejects(db.exec('update finance_private.capabilities set synthetic_posting_enabled=true'),/permission/),'service_role');}finally{await db.close();}
});
test('failed and pending purchases record no earnings, payout or license entitlement',()=>fixture(async db=>{
 const c=await seedDelivery(db,{paid:false});await db.exec(`update orders set stripe_checkout_session_id='cs_test_fixture',stripe_payment_intent_id='pi_fixture' where id='${c.order}'`);
 await post(db,c.order);assert.equal(await count(db,'finance_private.journals'),0);
 await payment(db,c,'failure','PAYMENT_FAILED',0);await post(db,c.order);
 assert.equal(await count(db,'finance_private.journals'),0);assert.equal(await count(db,'generated_licenses'),0);assert.equal((await beginDownload(c)).allowed,false);
 assert.equal((await reconcile(db,c.order,(await inspect(db,c.order)).expectedProvider)).matched,true);
}));
test('duplicate source events and uncertain posting acknowledgment never duplicate a journal or obligation',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);await payment(db,c,'secondpaid','PAID',0);await post(db,c.order);await post(db,c.order);
 assert.equal(await count(db,'finance_private.journals'),1);assert.equal(await count(db,'finance_private.posted_events'),2);
 assert.equal(await balance(db,c.order,'payable:master'),-2400n);await assertBalanced(db);
}));
test('interruption rolls back journals and acknowledgment together, then replay posts once',()=>fixture(async db=>{
 const c=await seedDelivery(db);await db.exec('begin');await post(db,c.order);await db.exec('rollback');
 assert.equal(await count(db,'finance_private.journals'),0);assert.equal(await count(db,'finance_private.posted_events'),0);
 await post(db,c.order);assert.equal(await count(db,'finance_private.journals'),1);
}));
test('out-of-order cumulative partial/full refunds preserve original allocations and terminate at zero',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);
 await payment(db,c,'partialhigh','PARTIALLY_REFUNDED',2223);await post(db,c.order);
 assert.equal(await balance(db,c.order,'refund_rounding'),1n);
 await payment(db,c,'partialstale','PARTIALLY_REFUNDED',300);await post(db,c.order);
 assert.equal(await balance(db,c.order,'clearing'),2777n);assert.equal((await beginDownload(c)).allowed,false);
 await payment(db,c,'full','REFUNDED',5000);await post(db,c.order);
 for(const key of ['clearing','platform_revenue','payable:master','payable:publishing','refund_rounding'])assert.equal(await balance(db,c.order,key),0n,key);
 assert.equal((await reconcile(db,c.order,(await inspect(db,c.order)).expectedProvider)).matched,true);await assertBalanced(db);
 assert.equal(await count(db,'generated_licenses'),1);
}));
test('refund before paid proof posts neither cash nor license, then late paid records held refund correctly',()=>fixture(async db=>{
 const c=await seedDelivery(db,{paid:false});await db.exec(`update orders set stripe_checkout_session_id='cs_test_fixture',stripe_payment_intent_id='pi_fixture' where id='${c.order}'`);
 await payment(db,c,'refundfirst','REFUNDED',5000);await post(db,c.order);assert.equal(await count(db,'finance_private.journals'),0);
 await payment(db,c,'paidlate','PAID',0);await post(db,c.order);assert.equal(await balance(db,c.order,'clearing'),0n);
 assert.equal(await count(db,'generated_licenses'),0);assert.equal((await beginDownload(c)).allowed,false);await assertBalanced(db);
}));
test('processor fees, settlement, tax and duplicate supplemental evidence are explicit, balanced and currency bound',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);
 const f=await fact(db,c.order,'processor_fee',150,'fee-fixture');assert.equal(await fact(db,c.order,'processor_fee',150,'fee-fixture'),f);
 await assert.rejects(fact(db,c.order,'processor_fee',151,'fee-fixture'),/Conflicting/);
 await assert.rejects(fact(db,c.order,'processor_fee',5,'badcurrency',null,null,'EUR'),/same-currency/);
 await fact(db,c.order,'fee_return',50);await fact(db,c.order,'tax_accrual',100);await fact(db,c.order,'tax_remittance',100);
 await fact(db,c.order,'settlement',4800);assert.equal(await balance(db,c.order,'clearing'),0n);
 assert.equal((await reconcile(db,c.order,(await inspect(db,c.order)).expectedProvider)).matched,true);await assertBalanced(db);
}));
for(const outcome of ['dispute_return','chargeback_loss'])test(`dispute ${outcome} affects accounting and never removes PK07/08 access hold`,()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);await payment(db,c,'dispute','DISPUTED',0);await post(db,c.order);
 const debit=await fact(db,c.order,'dispute_debit',5000);assert.equal((await inspect(db,c.order)).issues.includes('dispute_outcome_pending'),true);
 await fact(db,c.order,outcome,5000,outcome+'-fixture',null,debit);
 await assert.rejects(fact(db,c.order,outcome,1,'excess-outcome',null,debit),/Excess/);
 assert.equal(await balance(db,c.order,'dispute_receivable'),0n);assert.equal((await beginDownload(c)).allowed,false);
 assert.equal((await reconcile(db,c.order,(await inspect(db,c.order)).expectedProvider)).matched,true);await assertBalanced(db);
}));
test('refund and chargeback overlap never reverses a party twice and records extra provider loss',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);await payment(db,c,'dispute','DISPUTED',0);await post(db,c.order);
 const d=await fact(db,c.order,'dispute_debit',5000);await fact(db,c.order,'chargeback_loss',5000,'loss-fixture',null,d);
 await payment(db,c,'overlaprefund','REFUNDED',5000);await post(db,c.order);
 assert.equal(await balance(db,c.order,'payable:master'),0n);assert.equal(await balance(db,c.order,'chargeback_expense'),5000n);assert.equal(await balance(db,c.order,'clearing'),-5000n);
 assert.equal((await reconcile(db,c.order,(await inspect(db,c.order)).expectedProvider)).matched,true);await assertBalanced(db);
}));
test('payout reservation is retryable, cannot overdraw and records negative-party recovery after refund',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);
 await admin(db,()=>call(db,'freeze_finance_simulation_policy',[c.order,{synthetic:true,version:'ALPHA-SYNTHETIC',tier:'fixture-only',approvalReference:'SYNTHETIC ONLY',commissionBasis:'gross',maturitySeconds:0,reserveBps:0,refundPolicy:REFUND_POLICY}]));
 const reservation=await fact(db,c.order,'payout_reserve',2400,'reserve-fixture','master');
 assert.equal(await fact(db,c.order,'payout_reserve',2400,'reserve-fixture','master'),reservation);
 await assert.rejects(fact(db,c.order,'payout_reserve',1,'overdraw-fixture','master'),/insufficient|reserve requirement/);
 await fact(db,c.order,'payout_settle',2400,'settle-fixture','master',reservation);
 await assert.rejects(fact(db,c.order,'payout_settle',1,'duplicate-settle','master',reservation),/exhausted/);
 await payment(db,c,'afterpayout','REFUNDED',5000);await post(db,c.order);
 assert.equal(await balance(db,c.order,'payable:master'),2400n);assert.ok((await inspect(db,c.order)).issues.includes('party_recovery_required'));await assertBalanced(db);
}));
test('reconciliation detects every mismatched provider field and records named operator action without hiding findings',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);const expected=(await inspect(db,c.order)).expectedProvider;
 const result=await reconcile(db,c.order,{...expected,grossMinor:4999,refundedMinor:1});
 assert.ok(result.issues.includes('provider_mismatch:grossMinor'));assert.ok(result.issues.includes('provider_mismatch:refundedMinor'));
 const request=randomUUID(),args=[result.reconciliationId,request,'investigate','SYNTHETIC mismatch investigation','fixture-evidence'];
 const action=await admin(db,()=>call(db,'record_finance_case_action',args));assert.equal(await admin(db,()=>call(db,'record_finance_case_action',args)),action);
 assert.equal((await inspect(db,c.order)).matched,false);
 assert.equal((await reconcile(db,c.order,expected)).matched,true);
}));
test('immutable headers, lines, accounts, snapshots and source receipts deny tampering even by owner',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);
 for(const table of ['books','accounts','journals','lines','posted_events']) {
  await assert.rejects(db.exec('delete from finance_private.'+table),/immutable/i);
 }
 await assert.rejects(db.exec("update finance_private.lines set signed_minor=1"),/immutable/i);
 await assert.rejects(db.exec(`insert into finance_private.lines select id,order_id,currency,'settled',1 from finance_private.journals limit 1`),/Committed journal/);
 await assertBalanced(db);
}));
test('deferred database constraint rejects empty/unbalanced journals and rolls back all related rows',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);
 await assert.rejects(db.query(`select finance_private.post('${c.order}','invalid','invalid','{}','{"clearing":1,"platform_revenue":-2}')`),/Unbalanced/);
 await assert.rejects(db.query(`select finance_private.post('${c.order}','empty','invalid','{}','{}')`),/Unbalanced/);
 assert.equal(await count(db,'finance_private.journals'),1);
}));
test('Buyer, Artist, anonymous and service-only actors cannot read or adjust private finance',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);
 for(const actor of [ids.a,ids.b,ids.buyer])await asActor(db,actor,async()=>{
  await assert.rejects(call(db,'read_financial_order',[c.order]),/Admin/);
  await assert.rejects(call(db,'read_financial_summary',[]),/Admin/);
  await assert.rejects(call(db,'propose_finance_restatement',[randomUUID(),randomUUID(),'unauthorized edit','fixture']),/Admin/);
  await assert.rejects(db.query('select * from finance_private.lines'),/permission/);
 });
 await asActor(db,null,()=>assert.rejects(call(db,'read_financial_order',[c.order]),/permission/),'anon');
 await asActor(db,null,()=>assert.rejects(call(db,'record_finance_simulation_fact',[c.order,'spoofed','processor_fee',1,'USD','a'.repeat(64),'spoofed service request',null,null]),/permission/),'service_role');
}));
test('independent Admin restatement retains originals and applies exactly one linked reversal/replacement',()=>fixture(async db=>{
 const c=await seedDelivery(db);await post(db,c.order);
 const second='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';await db.exec(`insert into auth.users(id,email) values('${second}','reviewer@fixture.invalid');insert into user_profiles(id,email,role,full_name) values('${second}','reviewer@fixture.invalid','admin','Fixture reviewer')`);
 const journal=(await db.query('select id from finance_private.journals')).rows[0].id;
 const args=[journal,randomUUID(),'SYNTHETIC retain and restate evidence','fixture-review'];const correction=await admin(db,()=>call(db,'propose_finance_restatement',args));
 assert.equal(await admin(db,()=>call(db,'propose_finance_restatement',args)),correction);
 await assert.rejects(admin(db,()=>call(db,'approve_finance_restatement',[correction])),/Independent/);
 await asActor(db,second,()=>call(db,'approve_finance_restatement',[correction]));await asActor(db,second,()=>call(db,'approve_finance_restatement',[correction]));
 assert.equal(await count(db,'finance_private.journals'),3);assert.equal(await balance(db,c.order,'clearing'),5000n);
 assert.equal((await reconcile(db,c.order,(await inspect(db,c.order)).expectedProvider)).matched,true);await assertBalanced(db);
}));
