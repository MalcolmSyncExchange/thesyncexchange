import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database,ids,asActor,quote} from './helpers/artist-baseline-db.mjs';
import {providerFixture} from './helpers/financial-provider-fixture.mjs';
import {call} from './helpers/purchase-legal-fixture.mjs';
import {beginDownload} from './helpers/secure-delivery-fixture.mjs';
import {readProviderEvidence} from '../services/finance/provider-reader.mjs';
const fixture=async fn=>{const db=await database();try{await fn(db);}finally{await db.close();}};
const balance=async(db,order,account)=>BigInt((await db.query(`select finance_private.balance('${order}',${quote(account)}) n`)).rows[0].n);
const count=async(db,table)=>Number((await db.query('select count(*) n from '+table)).rows[0].n);
const admin=(db,fn)=>asActor(db,ids.admin,fn);
const report=(f)=>admin(f.db,()=>call(f.db,'read_financial_order',[f.c.order]));
const zeroSum=async db=>assert.equal(await count(db,'(select journal_id from finance_private.lines group by journal_id having sum(signed_minor)<>0) q'),0);

test('IR-ACC-01 independent rational oracle: irregular cumulative refunds, stale delivery and final cent conservation',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());await f.run();
 const accepted=(await call(db,'read_accepted_purchase',[f.c.order])).snapshot;
 const components=[['platform_revenue',1000n],['payable:master',2400n],['payable:publishing',1600n]];
 assert.equal(accepted.amountCents,5000);
 // Explicit independent expected amounts; never call production refundTargets or copy expectedProvider.
 for(const refund of [1,2,7,19,2223,4999,5000]){
  await f.payment('evt_irrefund'+refund,'charge.refunded',refund===5000?'REFUNDED':'PARTIALLY_REFUNDED',refund);
  await call(db,'post_financial_order',[f.c.order]);
  let reversed=0n;
  for(const [account,original] of components){const target=original*BigInt(refund)/5000n;reversed+=target;assert.equal(await balance(db,f.c.order,account),-original+target);}
  assert.equal(await balance(db,f.c.order,'refund_rounding'),BigInt(refund)-reversed);
  assert.equal(await balance(db,f.c.order,'clearing'),4850n-BigInt(refund));await zeroSum(db);
 }
 await f.payment('evt_irstale','charge.refunded','PARTIALLY_REFUNDED',1);await call(db,'post_financial_order',[f.c.order]);
 assert.equal(await balance(db,f.c.order,'clearing'),-150n);
 assert.equal((await beginDownload(f.c)).allowed,false);
}));

test('IR-ACC-02 fully refunded nonrefundable fee is platform expense, not seller debt',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());await f.run();await f.refund(5000);await f.run();
 assert.equal(await balance(db,f.c.order,'processor_fees'),150n);assert.equal(await balance(db,f.c.order,'clearing'),-150n);
 for(const a of ['platform_revenue','payable:master','payable:publishing'])assert.equal(await balance(db,f.c.order,a),0n);
 assert.equal((await report(f)).matched,true);await zeroSum(db);
}));

for(const fee of [300,6000])test('IR-ACC-03 dispute debit/fee/return/credit conserves net expense at fee '+fee,()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());await f.run();
 const d={id:'dp_independent',livemode:false,charge:'ch_fixture',payment_intent:'pi_fixture',amount:5000,currency:'usd',status:'won',balance_transactions:['txn_irdebit','txn_irreturn']};
 f.state.disputes=[d];
 f.state.balances.set('txn_irdebit',{id:'txn_irdebit',source:d.id,type:'adjustment',amount:-5000,fee,net:-5000-fee,currency:'usd',created:1700000001,exchange_rate:null});
 f.state.balances.set('txn_irreturn',{id:'txn_irreturn',source:d.id,type:'adjustment',amount:5000,fee:-fee,net:5000+fee,currency:'usd',created:1700000002,exchange_rate:null});
 await f.payment('evt_irdispute','charge.dispute.created','DISPUTED');await f.capture(f.event('evt_irdispute','charge.dispute.closed',d));await f.run();
 assert.equal(await balance(db,f.c.order,'clearing'),4850n);assert.equal(await balance(db,f.c.order,'processor_fees'),150n);
 assert.equal(await balance(db,f.c.order,'dispute_receivable'),0n);assert.equal(await balance(db,f.c.order,'payable:master'),-2400n);
 assert.equal((await beginDownload(f.c)).allowed,false);assert.equal((await report(f)).matched,true);await zeroSum(db);
}));

test('IR-ACC-04 negative-party recovery after settled payout remains an exception, not unexplained balancing',()=>fixture(async db=>{
 const f=await providerFixture(db);await call(db,'post_financial_order',[f.c.order]);
 const policy={synthetic:true,version:'ALPHA-SYNTHETIC',tier:'independent',approvalReference:'SYNTHETIC REVIEW ONLY',commissionBasis:'gross',maturitySeconds:0,reserveBps:0,refundPolicy:'proportional-floor-suspense-v1'};
 await admin(db,()=>call(db,'freeze_finance_simulation_policy',[f.c.order,policy]));
 const fact=(kind,amount,related=null)=>admin(db,()=>call(db,'record_finance_simulation_fact',[f.c.order,randomUUID(),kind,amount,'USD','b'.repeat(64),'Independent synthetic review','master',related]));
 const reserved=await fact('payout_reserve',2400);await fact('payout_settle',2400,reserved);
 await f.payment('evt_irafterpayout','charge.refunded','REFUNDED',5000);await call(db,'post_financial_order',[f.c.order]);
 assert.equal(await balance(db,f.c.order,'payable:master'),2400n);assert.ok((await report(f)).issues.includes('party_recovery_required'));await zeroSum(db);
}));

test('IR-ACC-05 second-admin restatement preserves economic balances and immutable original journal',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());await f.run();
 const second='aaaa0000-1111-4111-8111-000000000001';
 await db.exec(`insert into auth.users(id,email) values('${second}','second@independent.invalid');insert into user_profiles(id,email,role,full_name) values('${second}','second@independent.invalid','admin','Synthetic independent approver')`);
 const before=(await report(f)).balances;
 const journal=(await db.query("select id from finance_private.journals where kind='purchase'")).rows[0].id;
 const proposal=await admin(db,()=>call(db,'propose_finance_restatement',[journal,randomUUID(),'Independent exact restatement review','SYNTHETIC-IR']));
 await assert.rejects(admin(db,()=>call(db,'approve_finance_restatement',[proposal])),/separate|different|proposer|independent/i);
 const approval=()=>asActor(db,second,()=>call(db,'approve_finance_restatement',[proposal]));
 await approval();await approval();assert.deepEqual((await report(f)).balances,before);assert.equal(await count(db,'finance_private.correction_approvals'),1);
 await assert.rejects(db.exec(`delete from finance_private.journals where id='${journal}'`),/immutable/);await zeroSum(db);
}));

test('IR-ACC-06 cross-currency proof posts no foreign obligation and preserves rejected immutable evidence',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());f.state.balances.get('txn_charge').currency='eur';
 assert.equal((await f.run()).dead,1);assert.equal(await count(db,'finance_private.journals'),0);
 assert.equal(await count(db,'finance_private.provider_events'),1);assert.equal(await count(db,'finance_private.provider_balances'),0);
}));

test('IR-ACC-07 authenticated dispute fee exceeding sale posts exact provider cash and expense',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());await f.run();
 const d={id:'dp_irlargefee',livemode:false,charge:'ch_fixture',payment_intent:'pi_fixture',amount:5000,currency:'usd',status:'lost',balance_transactions:['txn_irlargefee']};
 f.state.disputes=[d];f.state.balances.set('txn_irlargefee',{id:'txn_irlargefee',source:d.id,type:'adjustment',amount:-5000,fee:6000,net:-11000,currency:'usd',created:1700000001,exchange_rate:null});
 await f.payment('evt_irlargefee','charge.dispute.created','DISPUTED');await f.capture(f.event('evt_irlargefee','charge.dispute.closed',d));
 const job=await f.claim();const proof=await readProviderEvidence(job,f.stripe);assert.equal(proof.balances.find(b=>b.id==='txn_irlargefee').net,-11000);
 const result=await f.complete(job.id,job.token,proof);assert.equal(result.state,'posted');
 assert.equal(await balance(db,f.c.order,'processor_fees'),6150n);assert.equal(await balance(db,f.c.order,'clearing'),-6150n);
 assert.equal(await balance(db,f.c.order,'dispute_receivable'),0n);
 for(const account of ['platform_revenue','payable:master','payable:publishing'])assert.equal(await balance(db,f.c.order,account),0n);
 assert.equal((await report(f)).matched,true);await zeroSum(db);
 assert.equal((await beginDownload(f.c)).allowed,false);
 console.log(JSON.stringify({case:'IR-ACC-07',validProviderAmount:-5000,validProviderFee:6000,validProviderNet:-11000,completion:result,accountedFee:6150,clearingMinor:-6150,unbalancedJournals:0}));
}));

test('IR-ACC-08 independent commission boundary table and ordered residual allocation use exact minor units',()=>fixture(async db=>{
 const f=await providerFixture(db,{paid:false});
 const {terms,newQuote}=await import('./helpers/purchase-legal-fixture.mjs');
 const cases=[
  {rate:0,fee:0,master:33,publishing:68},
  {rate:50,fee:1,master:33,publishing:67},
  {rate:1500,fee:15,master:28,publishing:58},
  {rate:3333,fee:34,master:22,publishing:45},
  {rate:10000,fee:101,master:0,publishing:0}
 ];
 await db.exec("update track_license_options set price_cents=101 where track_id='"+ids.live+"' and license_type_id='"+ids.license+"'");
 for(const c of cases){
  const economics={commissionBps:c.rate,policyVersion:'IR-SYNTHETIC',approvalReference:'IR-SYNTHETIC-NOT-COMMERCIAL',allocations:[{partyId:'master',bps:3333},{partyId:'publishing',bps:6667}]};
  const offer=await call(db,'publish_licensing_offer',[ids.admin,ids.live,ids.license,f.c.review.rights,terms,economics,'Independent synthetic rounding review']);
  await call(db,'review_license_deliverables',[ids.admin,offer,[{assetVersionId:f.c.master,label:'Synthetic reviewed source'}],'Independent immutable delivery review']);
  const q=await newQuote(db);assert.equal(q.schedule.amountCents,101);assert.equal(q.schedule.financial.platformFeeCents,c.fee);
  assert.deepEqual(q.schedule.financial.allocations.map(x=>x.amountCents),[c.master,c.publishing]);
  assert.equal(c.fee+c.master+c.publishing,101);
 }
}));

test('IR-ACC-09 fee and net remain exact safe integers despite independent-gross fee support',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());const job=await f.claim();
 const proof=await readProviderEvidence(job,f.stripe);proof.balances[0].fee=9007199254740992;proof.balances[0].net=5000-proof.balances[0].fee;
 const result=await f.complete(job.id,job.token,proof);assert.equal(result.state,'dead');assert.equal(result.code,'invalid_balance_arithmetic');
 assert.equal(await count(db,'finance_private.journals'),0);assert.equal(await count(db,'finance_private.provider_balances'),0);
}));
