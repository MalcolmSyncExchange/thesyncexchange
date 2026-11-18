import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,ids,asActor,call,randomUUID,admin,artist,report,bind,freeze,prepare,act,balance,payment,inspected,balanced} from './helpers/accounting-fixture.mjs';
import {providerFixture} from './helpers/financial-provider-fixture.mjs';
import {database} from './helpers/artist-baseline-db.mjs';
const row=async(db,id=ids.a)=>(await artist(db,id)).orders[0];
test('System10 exact managed revenue is distinct from explicitly bound own earnings; private Buyer evidence is absent',()=>fixture(async(db,c)=>{
 const initial=await row(db);assert.equal(initial.grossMinor,'5000');assert.equal(initial.platformFeeMinor,'1000');assert.equal(initial.netProceedsMinor,'4000');assert.equal(initial.allocations.some(x=>x.attributedToYou),false);
 const receipt=await bind(db,c);assert.ok(receipt);let mine=await row(db);assert.equal(mine.allocations.find(a=>a.partyId==='master').attributedToYou,true);assert.equal(mine.allocations.find(a=>a.partyId==='master').owedMinor,'2400');
 const raw=JSON.stringify(mine);for(const secret of ['representative','sessionId','buyer@','purchaseHash":"','address','providerAccount','raw_payload'])assert.equal(raw.includes(secret),false,secret);
 assert.equal(mine.actualPaidMinor,'0');assert.equal(mine.withdrawableMinor,'0');assert.equal((await report(db)).summary.partitions[0].gross_minor,'5000');
}));
test('explicit contributor binding shows only their allocation and no sale amounts or other payees',()=>fixture(async(db,c)=>{
 assert.deepEqual((await artist(db,ids.b)).orders,[]);await bind(db,c,'publishing',ids.b);const theirs=await row(db,ids.b);assert.equal(theirs.grossMinor,null);assert.equal(theirs.platformFeeMinor,null);assert.equal(theirs.netProceedsMinor,null);assert.equal(theirs.allocations.length,1);assert.equal(theirs.allocations[0].partyId,'publishing');assert.equal(theirs.allocations[0].owedMinor,'1600');assert.equal(theirs.allocations[0].artistId,null);
}));
test('binding requests replay once, conflict fail, CAS corrections append and cannot change accepted evidence',()=>fixture(async(db,c)=>{
 const key=randomUUID(),before=(await db.query('select snapshot_hash from licensing_private.acceptances')).rows[0].snapshot_hash;
 const first=await bind(db,c,'master',ids.a,null,key);assert.equal(await bind(db,c,'master',ids.a,null,key),first);await assert.rejects(bind(db,c,'master',ids.b,null,key),/Conflicting/);await assert.rejects(bind(db,c,'master',ids.b),/Stale/);
 await bind(db,c,'master',ids.b,first);assert.equal((await row(db,ids.b)).allocations[0].attributedToYou,true);assert.equal((await row(db)).allocations.find(x=>x.partyId==='master').attributedToYou,false);
 assert.equal((await db.query('select snapshot_hash from licensing_private.acceptances')).rows[0].snapshot_hash,before);assert.equal((await db.query('select count(*)::int n from finance_private.payee_bindings')).rows[0].n,2);
 for(const [party,account] of [['not-a-payee',ids.a],['publishing',ids.buyer]])await assert.rejects(bind(db,c,party,account),/payee|Artist/);
}));
test('monthly synthetic payout lifecycle reserves, fails/releases, reschedules, completes once and reverses with balanced retained journals',()=>fixture(async(db,c)=>{
 await bind(db,c);await freeze(db,c);const key=randomUUID(),p=await prepare(db,c,{key});assert.equal(await prepare(db,c,{key}),p);await assert.rejects(prepare(db,c,{key,amount:2300}),/Conflicting/);
 assert.equal((await row(db)).payouts[0].state,'held');const scheduleKey=randomUUID();assert.equal((await act(db,p,1,'schedule',scheduleKey)).state,'scheduled');assert.equal((await act(db,p,1,'schedule',scheduleKey)).revision,2);
 assert.equal(await balance(db,c,'payable:master'),0n);assert.equal(await balance(db,c,'reserved:master'),-2400n);await assert.rejects(act(db,p,1,'hold'),/Stale/);
 await act(db,p,2,'fail');assert.equal(await balance(db,c,'payable:master'),-2400n);await act(db,p,3,'schedule');await act(db,p,4,'simulate_complete');
 assert.equal(await balance(db,c,'payout_clearing'),-2400n);assert.equal((await row(db)).payouts[0].actualPaidMinor,'0');assert.equal((await row(db)).allocations.find(a=>a.partyId==='master').owedMinor,'2400');assert.equal((await row(db)).allocations.find(a=>a.partyId==='master').simulatedCompletedMinor,'2400');
 const before=(await inspected(db,c)).expectedProvider;assert.equal((await admin(db,'reconcile_financial_order',[c.order,before])).matched,true);
 await act(db,p,5,'reverse');assert.equal(await balance(db,c,'payout_clearing'),0n);assert.equal(await balance(db,c,'payable:master'),-2400n);assert.equal((await row(db)).allocations.find(a=>a.partyId==='master').simulatedCompletedMinor,'0');
 assert.equal((await admin(db,'reconcile_financial_order',[c.order,before])).matched,true);assert.ok(await balanced(db));await assert.rejects(act(db,p,6,'reverse'),/Terminal/);
 assert.equal((await row(db)).payouts[0].history.length,6);
}));
test('payout interrupted action rolls back reservation and history atomically; retry has one effect',()=>fixture(async(db,c)=>{
 await bind(db,c);await freeze(db,c);const p=await prepare(db,c),key=randomUUID();await db.exec('begin');await act(db,p,1,'schedule',key);await db.exec('rollback');assert.equal(await balance(db,c,'reserved:master'),0n);assert.equal((await row(db)).payouts[0].revision,1);await act(db,p,1,'schedule',key);assert.equal(await balance(db,c,'reserved:master'),-2400n);
}));
test('separate preparations cannot overdraw an accepted obligation; hold/cancel release exact reservations',()=>fixture(async(db,c)=>{
 await bind(db,c);await freeze(db,c);const a=await prepare(db,c,{amount:1500}),b=await prepare(db,c,{amount:1500});await act(db,a,1,'schedule');await assert.rejects(act(db,b,1,'schedule'),/reserve|insufficient/);await act(db,a,2,'hold');await act(db,b,1,'schedule');await act(db,b,2,'cancel');assert.equal(await balance(db,c,'payable:master'),-2400n);assert.equal(await balance(db,c,'reserved:master'),0n);
}));
for(const state of ['REFUNDED','PARTIALLY_REFUNDED','DISPUTED','PAYMENT_FAILED'])test('adverse payment '+state+' dynamically holds scheduled payouts and completion cannot bypass it',()=>fixture(async(db,c)=>{
 await bind(db,c);await freeze(db,c);const p=await prepare(db,c);await act(db,p,1,'schedule');await payment(db,c,state,state==='REFUNDED'?5000:state==='PARTIALLY_REFUNDED'?1000:0);await call(db,'post_financial_order',[c.order]);
 await assert.rejects(act(db,p,2,'simulate_complete'),/held/);const report=await inspected(db,c);assert.ok(report.issues.some(x=>x.startsWith('scheduled_payout_held:')));await act(db,p,2,'hold');assert.equal(await balance(db,c,'reserved:master'),0n);assert.ok(await balanced(db));
}));
test('refund after simulated completion exposes recovery; reversal restores net payable without rewriting history',()=>fixture(async(db,c)=>{
 await bind(db,c);await freeze(db,c);const p=await prepare(db,c);await act(db,p,1,'schedule');await act(db,p,2,'simulate_complete');await payment(db,c,'REFUNDED',5000);await call(db,'post_financial_order',[c.order]);assert.equal((await row(db)).allocations.find(x=>x.partyId==='master').recoveryMinor,'2400');assert.ok((await inspected(db,c)).issues.includes('party_recovery_required'));await act(db,p,3,'reverse');assert.equal(await balance(db,c,'payable:master'),0n);assert.equal((await row(db)).allocations.find(x=>x.partyId==='master').refundAndLossMinor,'2400');assert.ok(await balanced(db));
}));
test('identity revocation holds scheduled payout and history remains visible only to original payee',()=>fixture(async(db,c)=>{
 const binding=await bind(db,c,'publishing',ids.b);await freeze(db,c);const p=await prepare(db,c,{party:'publishing',amount:1600});await act(db,p,1,'schedule');await bind(db,c,'publishing',null,binding);await assert.rejects(act(db,p,2,'simulate_complete'),/payee_identity_review/);assert.equal((await row(db,ids.b)).payouts[0].id,p);assert.equal((await row(db,ids.b)).allocations.length,0);await act(db,p,2,'cancel');
}));
test('maturity, reserve, missing policy, future schedule, expired session and insufficient funds block financial progression',()=>fixture(async(db,c)=>{
 await assert.rejects(prepare(db,c),/binding/);await bind(db,c);const p=await prepare(db,c);await assert.rejects(act(db,p,1,'schedule'),/policy/);await freeze(db,c,{reserveBps:2500});await assert.rejects(act(db,p,1,'schedule'),/reserve/);const smaller=await prepare(db,c,{amount:1800,date:new Date(Date.now()+86400000).toISOString().slice(0,10)});await act(db,smaller,1,'schedule');await assert.rejects(act(db,smaller,2,'simulate_complete'),/Due/);await assert.rejects(prepare(db,c,{amount:null}),/bounded/);
}));
test('pending and failed purchases show pending expectations without earned balances, reservation or license',()=>fixture(async(db,c)=>{
 await bind(db,c);await freeze(db,c);assert.equal((await row(db)).grossMinor,'0');assert.equal((await row(db)).allocations[0].pendingMinor,'2400');assert.equal((await row(db)).allocations[0].owedMinor,'0');const p=await prepare(db,c);await assert.rejects(act(db,p,1,'schedule'),/payment_not_posted/);await payment(db,c,'PAYMENT_FAILED');await call(db,'post_financial_order',[c.order]);assert.equal((await db.query('select count(*)::int n from finance_private.journals')).rows[0].n,0);
},{paid:false}));
test('canonical role, active Auth session, Admin MFA and direct private table isolation apply to every accounting RPC',()=>fixture(async(db,c)=>{
 for(const id of [ids.a,ids.b,ids.buyer])await asActor(db,id,async()=>{
  await assert.rejects(call(db,'accounting_admin_report',[1,20]),/Admin/);await assert.rejects(call(db,'accounting_bind_payee',[c.order,'master',ids.a,null,randomUUID(),'unauthorized','fixture']),/Admin/);await assert.rejects(call(db,'accounting_prepare_payout',[c.order,'master',1,new Date().toISOString(),randomUUID(),'fixture']),/Admin/);await assert.rejects(call(db,'accounting_act_payout',[randomUUID(),1,'schedule',randomUUID(),'unauthorized','fixture']),/Admin/);await assert.rejects(call(db,'accounting_configure_policy',[ids.live,ids.license,randomUUID(),randomUUID(),{},'fixture']),/Admin/);
  for(const table of ['payee_bindings','payout_requests','payout_events','policy_actions'])await assert.rejects(db.query('select * from finance_private.'+table),/permission/);
 });
 await asActor(db,ids.admin,()=>assert.rejects(call(db,'accounting_admin_report',[1,20]),/MFA/),'authenticated',undefined,'aal1');
 await asActor(db,ids.a,()=>assert.rejects(call(db,'accounting_artist_earnings',[1,20]),/Active/),'authenticated','');
 await asActor(db,ids.buyer,()=>assert.rejects(call(db,'accounting_artist_earnings',[1,20]),/Artist/));
 for(const role of ['anon','service_role'])await asActor(db,null,()=>assert.rejects(call(db,'accounting_admin_report',[1,20]),/permission/),role);
 for(const args of [[null,20],[1,null],[0,20],[1,51]])await assert.rejects(admin(db,'accounting_admin_report',args),/Bounded/);
}));
test('all new accounting records are append-only even for database owner and forced RLS with no API grants',()=>fixture(async(db,c)=>{
 await bind(db,c);await freeze(db,c);const p=await prepare(db,c);await act(db,p,1,'schedule');
 for(const table of ['payee_bindings','payout_requests','payout_events']){await assert.rejects(db.query('delete from finance_private.'+table),/immutable/);await assert.rejects(db.query('update finance_private.'+table+" set reference='tampered'"),/immutable/);}
 const rows=(await db.query("select relname,relrowsecurity,relforcerowsecurity from pg_class where relname in ('payee_bindings','payout_requests','payout_events','policy_actions')")).rows;assert.equal(rows.length,4);assert.ok(rows.every(x=>x.relrowsecurity&&x.relforcerowsecurity));
}));
test('new fee/tier/override and explicit payee split create a reviewed version; original accepted economics never change',()=>fixture(async(db,c)=>{
 const policy={version:'SYNTHETIC-FIN-2',sellerTier:'SYNTHETIC-PRO',currency:'USD',commissionBasis:'gross',commissionBps:1250,allocations:[{partyId:'master',bps:7000},{partyId:'publishing',bps:3000}],mode:'synthetic',feeOverride:true};
 const expected=c.review.offer,key=randomUUID(),args=[ids.live,ids.license,expected,key,policy,'SYNTHETIC approved local rate scenario'];
 const updated=await admin(db,'accounting_configure_policy',args);assert.equal(updated.reviewRequired,true);assert.equal((await admin(db,'accounting_configure_policy',args)).offerId,updated.offerId);
 const old=(await db.query('select snapshot from finance_private.books where order_id=$1',[c.order])).rows[0].snapshot;assert.equal(old.financial.platformFeeCents,1000);assert.equal(old.financial.allocations[0].amountCents,2400);
 const offer=(await db.query('select financial from licensing_private.offers where id=$1',[updated.offerId])).rows[0].financial;assert.equal(offer.commissionBps,1250);assert.equal(offer.policy.feeOverride,true);
 await assert.rejects(admin(db,'accounting_configure_policy',[ids.live,ids.license,expected,randomUUID(),{...policy,version:'NEW'},'SYNTHETIC stale']),/Stale/);
 await assert.rejects(admin(db,'accounting_configure_policy',[ids.live,ids.license,updated.offerId,randomUUID(),{...policy,version:'NEW',allocations:[{partyId:'master',bps:9999}]},'SYNTHETIC invalid']),/complete/);
 await assert.rejects(admin(db,'accounting_configure_policy',[ids.live,ids.license,updated.offerId,randomUUID(),{...policy,version:'NEW',currency:'EUR'},'SYNTHETIC invalid']),/USD/);
 assert.equal((await row(db)).platformFeeMinor,'1000');
}));
test('authenticated provider books expose earnings but cannot use simulated payout adapter or alter authenticated evidence',async()=>{
 const db=await database();try{const f=await providerFixture(db);await f.capture(f.event());await f.run();await bind(db,f.c);await freeze(db,f.c);const p=await prepare(db,f.c);await assert.rejects(act(db,p,1,'schedule'),/provider_payout_adapter_required/);assert.equal((await row(db)).allocations[0].heldMinor,'2400');assert.equal((await report(db)).orders[0].processorFeeMinor,'150');assert.equal((await db.query('select count(*)::int n from finance_private.simulation_facts')).rows[0].n,0);}finally{await db.close();}
});

test('financial tier and override integrate with System07 contract and immutable quote pricing after fresh source review',async()=>{
 const db=await database();try{await db.exec("insert into storage.buckets(id,name,public) values('rights-evidence','rights-evidence',false)");const {setupContract,quotePurchase}=await import('./helpers/licensing-system-fixture.mjs'),{ensureSourceReview}=await import('./helpers/immutable-source-fixture.mjs');const x=await setupContract(db),old=await quotePurchase(db);
 const policy={version:'SYNTHETIC-COMMISSION-2',sellerTier:'SYNTHETIC-TIER-2',currency:'USD',commissionBasis:'gross',commissionBps:1250,allocations:[{partyId:'master',bps:7000},{partyId:'publishing',bps:3000}],mode:'synthetic',feeOverride:true};
 const update=await admin(db,'accounting_configure_policy',[ids.live,ids.license,x.offer,randomUUID(),policy,'SYNTHETIC contractual commission approval']);await assert.rejects(quotePurchase(db),/source|catalog|review|license/i);await ensureSourceReview(db,update.offerId);const q=await quotePurchase(db);assert.equal(q.schedule.amountCents,5500);assert.equal(q.schedule.financial.platformFeeCents,688);assert.equal(q.schedule.financial.allocations[0].amountCents,3368);assert.equal(q.schedule.financial.allocations[1].amountCents,1444);assert.equal(q.schedule.financial.policy.sellerTier,'SYNTHETIC-TIER-2');assert.equal(q.schedule.pricingEvidence.policy.commissionBps,1250);assert.equal(old.schedule.financial.platformFeeCents,1100);
 }finally{await db.close();}
});

test('reconciliation detects balanced but wrong outbound clearing and reserved accounts independently',()=>fixture(async(db,c)=>{
 await db.query('select finance_private.post($1,$2,$3,$4,$5)',[c.order,'SYNTHETIC-wrong-clearing','synthetic_integrity_probe',{}, {payout_clearing:1,chargeback_expense:-1}]);assert.ok((await inspected(db,c)).issues.includes('payout_clearing_mismatch'));
 await db.query('select finance_private.post($1,$2,$3,$4,$5)',[c.order,'SYNTHETIC-wrong-reserved','synthetic_integrity_probe',{}, {'reserved:master':-1,'payable:master':1}]);assert.ok((await inspected(db,c)).issues.includes('payout_reserved_mismatch:master'));assert.ok(await balanced(db));
}));
test('contractual revocation during a scheduled payout holds completion without changing frozen economics',()=>fixture(async(db,c)=>{
 await bind(db,c);await freeze(db,c);const p=await prepare(db,c);await act(db,p,1,'schedule');await admin(db,'license_lifecycle_command',[c.order,0,randomUUID(),'revoke','SYNTHETIC license investigation','SYNTHETIC legal authority']);await assert.rejects(act(db,p,2,'simulate_complete'),/rights_or_legal_hold/);assert.equal((await row(db)).allocations[0].allocatedMinor,'2400');await act(db,p,2,'cancel');assert.ok(await balanced(db));
}));

test('payee binding authority follows insertion sequence even when wall clock timestamps tie or move backward',()=>fixture(async(db,c)=>{
 const first=await bind(db,c);const old=(await db.query('select * from finance_private.payee_bindings where id=$1',[first])).rows[0];
 const id=randomUUID();await db.query("insert into finance_private.payee_bindings(id,order_id,party_id,artist_id,previous_id,request_id,actor_id,reason,reference,created_at) values($1,$2,'master',$3,$4,$5,$6,'SYNTHETIC backwards-clock fixture','SYNTHETIC exact identity', $7::timestamptz-interval '1 day')",[id,c.order,ids.b,first,randomUUID(),ids.admin,old.created_at]);
 assert.equal((await row(db,ids.b)).allocations[0].attributedToYou,true);await assert.rejects(bind(db,c,'master',null,first),/Stale/);await bind(db,c,'master',null,id);assert.deepEqual((await artist(db,ids.b)).orders,[]);
}));
