import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database,asActor,ids,quote} from './helpers/artist-baseline-db.mjs';
import {providerFixture,endpoint,credential,secret,signing} from './helpers/financial-provider-fixture.mjs';
import {call} from './helpers/purchase-legal-fixture.mjs';
import {beginDownload} from './helpers/secure-delivery-fixture.mjs';
import {normalizeProviderEvent,verifyFinancialWebhook} from '../lib/finance/provider-events.mjs';
import {authorizeFinancialWorker} from '../lib/finance/worker-auth.mjs';
import {readProviderEvidence} from '../services/finance/provider-reader.mjs';
const fixture=async fn=>{const db=await database();try{await fn(db);}finally{await db.close();}};
const count=async(db,table)=>Number((await db.query('select count(*) n from finance_private.'+table)).rows[0].n);
const bal=async(db,id,key)=>BigInt((await db.query(`select finance_private.balance('${id}',${quote(key)}) n`)).rows[0].n);
const report=(db,id)=>asActor(db,ids.admin,()=>call(db,'read_financial_order',[id]));
const balanced=async db=>assert.equal((await db.query('select count(*)::int n from(select journal_id from finance_private.lines group by journal_id having sum(signed_minor)<>0) q')).rows[0].n,0);

test('real Stripe HMAC verification rejects tampering, old signatures, missing signature and oversized evidence before admission',()=>fixture(async db=>{
 const f=await providerFixture(db),e=f.event(),raw=JSON.stringify(e),header=f.signingClient.webhooks.generateTestHeaderString({payload:raw,secret});
 assert.equal(verifyFinancialWebhook(raw,header,secret,f.stripe).summary.id,e.id);
 for(const [body,sig]of [[raw+' ',header],[raw,''],[raw,f.signingClient.webhooks.generateTestHeaderString({payload:raw,secret,timestamp:Math.floor(Date.now()/1000)-1000})],['x'.repeat(262145),header]])assert.throws(()=>verifyFinancialWebhook(body,sig,secret,f.stripe));
 assert.throws(()=>normalizeProviderEvent({...e,account:'acct_external'}),/account_or_mode/);assert.throws(()=>normalizeProviderEvent({...e,livemode:true}),/account_or_mode/);
 assert.throws(()=>normalizeProviderEvent({...e,data:{object:{...e.data.object,amount_total:0.5}}}),/malformed/);
 assert.equal(await count(db,'provider_events'),0);
}));
test('dedicated worker authentication rejects missing, weak, forged and oversized bearer values',()=>{
 const s='fixture-worker-secret-'.repeat(3);assert.equal(authorizeFinancialWorker('Bearer '+s,s),true);
 for(const [h,k]of [[null,s],['Bearer wrong',s],['Bearer weak','weak'],['Bearer '+s+'x',s],['Bearer '+'x'.repeat(513),s]])assert.equal(authorizeFinancialWorker(h,k),false);
});
test('authenticated event is immutable, keeps original raw body and ID, and is pending without posting',()=>fixture(async db=>{
 const f=await providerFixture(db),e=f.event();const result=await f.capture(e);assert.equal(result.state,'pending');
 const row=(await db.query('select event_id,raw_body,summary from finance_private.provider_events')).rows[0];assert.equal(row.event_id,e.id);assert.equal(row.raw_body,JSON.stringify(e));assert.equal(row.summary.paymentIntent,'pi_fixture');
 assert.equal(await count(db,'journals'),0);await assert.rejects(db.exec("update finance_private.provider_events set event_type='forged'"),/immutable/);
 await assert.rejects(db.exec('delete from finance_private.provider_events'),/immutable/);
}));
test('signature plus provider account/API evidence posts exactly original earnings, actual fee, and automatic reconciliation',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());const run=await f.run();assert.equal(run.posted,1);
 assert.equal(await bal(db,f.c.order,'clearing'),4850n);assert.equal(await bal(db,f.c.order,'processor_fees'),150n);assert.equal(await bal(db,f.c.order,'platform_revenue'),-1000n);assert.equal(await bal(db,f.c.order,'payable:master'),-2400n);
 const r=await report(db,f.c.order);assert.equal(r.matched,true);assert.deepEqual(r.issues,[]);assert.equal((await beginDownload(f.c)).allowed,true);
 assert.equal(await count(db,'provider_reconciliations'),1);await balanced(db);
}));
test('duplicate delivery and different events for the same balance transaction never duplicate earnings or fees',()=>fixture(async db=>{
 const f=await providerFixture(db),e=f.event();await f.capture(e);await f.run();assert.equal((await f.capture(e)).duplicate,true);
 await f.capture(f.event('evt_chargeAlso','charge.succeeded',f.state.charge));await f.run();await f.run();
 assert.equal(await count(db,'provider_balances'),1);assert.equal(await count(db,'provider_effects'),1);assert.equal(await count(db,'journals'),2);assert.equal(await bal(db,f.c.order,'processor_fees'),150n);await balanced(db);
}));
test('same provider event ID with conflicting signed body retains both and prevents further processing',()=>fixture(async db=>{
 const f=await providerFixture(db),e=f.event();await f.capture(e);const conflict={...e,data:{object:{...e.data.object,amount_total:6000}}};
 assert.equal((await f.capture(conflict)).state,'conflict');assert.equal(await count(db,'provider_events'),1);assert.equal(await count(db,'provider_conflicts'),1);
 assert.equal((await f.run()).claimed,0);assert.equal((await beginDownload(f.c)).allowed,false);assert.ok((await f.operations()).alerts.some(x=>x.code==='provider_event_conflict'));
}));
test('partial and full refund proofs reverse original allocations while actual nonrefunded processor fees remain',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());await f.run();await f.refund(1000);await f.run();
 assert.equal(await bal(db,f.c.order,'clearing'),3850n);assert.equal((await beginDownload(f.c)).allowed,false);
 // New economic refund identity, not destructive revision of the original.
 f.state.charge.amount_refunded=5000;f.state.refunds.push({id:'re_final',charge:'ch_fixture',amount:4000,currency:'usd',status:'succeeded',balance_transaction:'txn_refundfinal'});
 f.state.balances.set('txn_refundfinal',{id:'txn_refundfinal',source:'re_final',type:'refund',amount:-4000,fee:0,net:-4000,currency:'usd',created:1700000002,exchange_rate:null});
 await f.payment('evt_full','charge.refunded','REFUNDED',5000);await f.capture(f.event('evt_full','charge.refunded',f.state.charge));await f.run();
 assert.equal(await bal(db,f.c.order,'payable:master'),0n);assert.equal(await bal(db,f.c.order,'platform_revenue'),0n);assert.equal(await bal(db,f.c.order,'clearing'),-150n);assert.equal((await report(db,f.c.order)).matched,true);await balanced(db);
}));
test('out-of-order refund before the paid job imports complete current evidence without reactivating access',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.refund(5000);await f.capture(f.event());await f.run();assert.equal((await report(db,f.c.order)).matched,true);assert.equal(await bal(db,f.c.order,'payable:publishing'),0n);assert.equal((await beginDownload(f.c)).allowed,false);await balanced(db);
}));
test('failed payment posts no earnings and cannot create license or authorized delivery',()=>fixture(async db=>{
 const f=await providerFixture(db,{paid:false});await f.payment('evt_failed','checkout.session.async_payment_failed','PAYMENT_FAILED');
 await f.capture(f.event('evt_failed','checkout.session.async_payment_failed'));await f.run();assert.equal(await count(db,'journals'),0);
 assert.equal((await db.query('select count(*)::int n from generated_licenses')).rows[0].n,0);assert.equal((await beginDownload(f.c)).allowed,false);assert.equal((await report(db,f.c.order)).matched,true);
}));
for(const outcome of ['won','lost'])test(`actual dispute ${outcome} imports debit/fee/outcome once and retains the access hold`,()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());await f.run();
 const d={id:'dp_fixture',livemode:false,charge:'ch_fixture',payment_intent:'pi_fixture',amount:5000,currency:'usd',status:outcome,balance_transactions:[{id:'txn_disputedebit'}]};f.state.disputes=[d];
 f.state.balances.set('txn_disputedebit',{id:'txn_disputedebit',source:d.id,type:'adjustment',amount:-5000,fee:150,net:-5150,currency:'usd',created:1700000001,exchange_rate:null});
 if(outcome==='won'){d.balance_transactions.push({id:'txn_disputereturn'});f.state.balances.set('txn_disputereturn',{id:'txn_disputereturn',source:d.id,type:'adjustment',amount:5000,fee:0,net:5000,currency:'usd',created:1700000002,exchange_rate:null});}
 await f.payment('evt_dispute','charge.dispute.created','DISPUTED');await f.capture(f.event('evt_dispute','charge.dispute.closed',d));await f.run();
 assert.equal(await bal(db,f.c.order,'dispute_receivable'),0n);assert.equal(await bal(db,f.c.order,'processor_fees'),300n);assert.equal((await report(db,f.c.order)).matched,true);assert.equal((await beginDownload(f.c)).allowed,false);await balanced(db);
}));
test('pending canonical binding is durable and recovers after interrupted ordinary webhook processing',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());await db.exec(`update orders set stripe_payment_intent_id=null where id='${f.c.order}'`);
 assert.equal((await f.run()).retried,1);assert.equal((await f.operations()).jobs[0].last_code,'canonical_binding_pending');
 await db.exec(`update orders set stripe_payment_intent_id='pi_fixture' where id='${f.c.order}'`);await f.due();assert.equal((await f.run()).posted,1);assert.equal((await report(db,f.c.order)).matched,true);
}));
test('provider unavailable uses bounded exponential backoff and dead-letter alert with audited operator retry',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());f.state.events.clear();
 for(let i=1;i<=8;i++){const r=await f.run();assert.equal(i===8?r.dead:r.retried,1);const j=(await f.operations()).jobs[0];assert.equal(j.attempt,i);if(i<8){const seconds=(await db.query("select extract(epoch from next_at-updated_at)::int s from finance_private.provider_jobs")).rows[0].s;assert.equal(seconds,5*2**(i-1));await f.due();}}
 const ops=await f.operations();assert.equal(ops.jobs[0].state,'dead');assert.ok(ops.alerts.length>0);const args=[ops.jobs[0].id,randomUUID(),'retry','SYNTHETIC provider restored','fixture-evidence'];
 const action=()=>asActor(db,ids.admin,()=>call(db,'act_on_financial_provider_job',args));assert.equal(await action(),await action());
 f.state.events.set(f.event().id,f.event());assert.equal((await f.run()).posted,1);await balanced(db);
}));
test('stale worker cannot finish after lease recovery; interruption leaves no financial effect',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());const first=await f.claim(),proof=await readProviderEvidence(first,f.stripe);
 await db.exec("update finance_private.provider_jobs set lease_until=clock_timestamp()-interval '1 second'");const second=await f.claim();assert.notEqual(second.token,first.token);
 assert.equal((await f.complete(first.id,first.token,proof)).state,'stale');assert.equal(await count(db,'journals'),0);
 assert.equal((await f.complete(second.id,second.token,proof)).state,'posted');assert.equal(await count(db,'journals'),2);
}));
test('unknown commit acknowledgment replays without duplicate provider balance or journal',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());const r=await f.run({complete:async(...args)=>{await f.complete(...args);throw Error('SYNTHETIC acknowledgment lost');}});
 assert.equal(r.uncertain,1);assert.equal((await f.run()).claimed,0);assert.equal(await count(db,'journals'),2);assert.equal(await count(db,'provider_balances'),1);
}));
test('database failure before completion leaves proof queued and original balances unmodified until retry',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());const r=await f.run({complete:async()=>{throw Error('SYNTHETIC database connection failed');}});assert.equal(r.retried,1);assert.equal(await count(db,'journals'),0);
 await f.due();assert.equal((await f.run()).posted,1);assert.equal((await report(db,f.c.order)).matched,true);
}));
test('provider account, event mismatch, currency conversion and malformed arithmetic fail closed',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());f.state.account='acct_wrong';assert.equal((await f.run()).dead,1);assert.equal(await count(db,'journals'),0);
 f.state.account='acct_fixture';await f.capture(f.event('evt_new'));f.state.balances.get('txn_charge').net=999;assert.equal((await f.run()).dead,1);assert.equal(await count(db,'journals'),0);
}));
test('conflicting immutable API economic evidence survives failed posting in a private alert and suspends access',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());await f.run();f.state.balances.get('txn_charge').fee=151;f.state.balances.get('txn_charge').net=4849;
 await f.capture(f.event('evt_conflictingApi'));assert.equal((await f.run()).dead,1);assert.equal(await bal(db,f.c.order,'processor_fees'),150n);assert.equal((await beginDownload(f.c)).allowed,false);
 assert.equal((await db.query("select count(*)::int n from finance_private.provider_alerts where detail ? 'rejectedProof'")).rows[0].n,1);
}));
test('unsupported signed event is retained without queueing financial effects; no silent discard',()=>fixture(async db=>{
 const f=await providerFixture(db);const r=await f.capture({id:'evt_unsupported',type:'payout.paid',created:1700000000,livemode:false,data:{object:{}}});assert.equal(r.state,'unsupported');assert.equal((await f.run()).claimed,0);assert.equal(await count(db,'journals'),0);
}));
test('provider-backed book rejects Admin synthetic facts and unauthorized inbox/worker/operations access',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());await f.run();
 await assert.rejects(asActor(db,ids.admin,()=>call(db,'record_finance_simulation_fact',[f.c.order,'fake-fee','processor_fee',1,'USD','a'.repeat(64),'SYNTHETIC prohibited mixing',null,null])),/cannot accept simulated/);
 for(const role of ['anon','authenticated'])await asActor(db,ids.buyer,async()=>{
  await assert.rejects(call(db,'claim_financial_provider_job',[endpoint,credential]),/permission/);await assert.rejects(db.query('select * from finance_private.provider_events'),/permission/);
 },role);
 for(const actor of [ids.a,ids.buyer])await asActor(db,actor,()=>assert.rejects(call(db,'read_financial_provider_operations',[]),/Admin/));
 const ops=await f.operations();assert.doesNotMatch(JSON.stringify(ops),/raw_body|credential_scope|signing_scope|proofHash|sk_test|whsec|lease_token/);
}));
test('operator reconciliation refresh resolves a temporary discrepancy without replacing earlier evidence',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());await f.run();
 await db.exec(`update order_asset_entitlements set state='suspended' where order_id='${f.c.order}'`);
 const job=(await f.operations()).jobs[0];const refresh=()=>asActor(db,ids.admin,()=>call(db,'act_on_financial_provider_job',[job.id,randomUUID(),'reconcile','SYNTHETIC refresh after review','fixture-refresh']));
 await refresh();await f.run();assert.ok((await report(db,f.c.order)).issues.includes('delivery_entitlement_pending'));assert.equal((await f.operations()).currentExceptions.length,1);
 await db.exec(`update order_asset_entitlements set state='active' where order_id='${f.c.order}'`);await refresh();await f.run();
 assert.equal(await count(db,'provider_reconciliations'),3);assert.equal(await count(db,'journals'),2);assert.equal((await report(db,f.c.order)).matched,true);assert.equal((await f.operations()).currentExceptions.length,0);
}));
test('different raw serialization of the same economic event retains another signed delivery without false conflict',()=>fixture(async db=>{
 const f=await providerFixture(db),e=f.event();await f.capture(e);const raw=JSON.stringify(e,null,2);
 const result=await call(db,'ingest_financial_provider_event',[endpoint,credential,signing,raw,normalizeProviderEvent(e)]);
 assert.equal(result.duplicate,true);assert.equal(result.state,'pending');assert.equal(await count(db,'provider_deliveries'),2);assert.equal(await count(db,'provider_conflicts'),0);assert.equal((await f.run()).posted,1);
}));
test('an unbalanced posting is rolled back, alerted and recoverable after the database fault is removed',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());
 await db.exec(`create function public.fixture_finance_fault() returns trigger language plpgsql as $$begin if new.account='platform_revenue' then new.signed_minor:=new.signed_minor+1;end if;return new;end$$;
 create trigger fixture_finance_fault before insert on finance_private.lines for each row execute function public.fixture_finance_fault()`);
 assert.equal((await f.run()).dead,1);assert.equal(await count(db,'journals'),0);assert.equal(await count(db,'provider_fetches'),0);
 const ops=await f.operations();assert.ok(ops.alerts.some(x=>x.code==='unbalanced_journal'));
 await db.exec('drop trigger fixture_finance_fault on finance_private.lines');
 await asActor(db,ids.admin,()=>call(db,'act_on_financial_provider_job',[ops.jobs[0].id,randomUUID(),'retry','SYNTHETIC database fault removed','fixture-review']));
 assert.equal((await f.run()).posted,1);assert.equal((await report(db,f.c.order)).matched,true);await balanced(db);
}));
for(const bad of ['event','currency','source'])test(`provider ${bad} contradiction is quarantined before any financial effect`,()=>fixture(async db=>{
 const f=await providerFixture(db),event=f.event();await f.capture(event);
 if(bad==='event')f.state.events.get(event.id).data.object.amount_total=6000;
 if(bad==='currency')f.state.balances.get('txn_charge').exchange_rate=1.1;
 if(bad==='source')f.state.balances.get('txn_charge').source='ch_wrong';
 assert.equal((await f.run()).dead,1);assert.equal(await count(db,'journals'),0);assert.equal(await count(db,'provider_balances'),0);
 if(bad==='event'){assert.equal((await beginDownload(f.c)).allowed,false);assert.ok((await db.query("select detail from finance_private.provider_alerts where detail ? 'rejectedProof'")).rows.length>0);}
}));
test('disabled ingestion and wrong endpoint credentials cannot admit or claim evidence',()=>fixture(async db=>{
 const f=await providerFixture(db),event=f.event(),raw=JSON.stringify(event),summary=normalizeProviderEvent(event);
 await db.exec('update finance_private.capabilities set ingestion_enabled=false');await assert.rejects(f.capture(event),/disabled/);
 await db.exec('update finance_private.capabilities set ingestion_enabled=true');await assert.rejects(call(db,'ingest_financial_provider_event',[endpoint,'0'.repeat(64),signing,raw,summary]),/context mismatch/);
 assert.equal(await count(db,'provider_events'),0);await f.capture(event);await assert.rejects(call(db,'claim_financial_provider_job',[endpoint,'0'.repeat(64)]),/scope mismatch/);
}));
test('exhausted interrupted lease reaches dead letter instead of remaining permanently leased',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());await f.claim();
 await db.exec("update finance_private.provider_jobs set attempt=8,lease_until=clock_timestamp()-interval '1 second'");assert.equal(await f.claim(),null);
 const ops=await f.operations();assert.equal(ops.jobs[0].state,'dead');assert.ok(ops.alerts.some(x=>x.code==='dead_letter'));assert.equal(await count(db,'journals'),0);
}));
test('automatic reconciliation refresh preserves event and journal identities after fulfillment changes',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());await f.run();
 await db.exec("update finance_private.provider_jobs set updated_at=clock_timestamp()-interval '6 minutes'");assert.equal((await f.run()).posted,1);
 assert.equal(await count(db,'provider_events'),1);assert.equal(await count(db,'journals'),2);assert.equal(await count(db,'provider_reconciliations'),2);
}));
test('a signed dispute before canonical order binding fences later issuance and delivery without waiting for the worker',()=>fixture(async db=>{
 const f=await providerFixture(db),order=f.c.order;
 await db.exec(`update orders set stripe_payment_intent_id=null where id='${order}'`);
 const d={id:'dp_early',livemode:false,charge:'ch_fixture',payment_intent:'pi_fixture',amount:5000,currency:'usd',status:'needs_response'};
 await f.capture(f.event('evt_earlydispute','charge.dispute.funds_withdrawn',d));
 await db.exec(`update orders set stripe_payment_intent_id='pi_fixture' where id='${order}'`);
 await assert.rejects(call(db,'assert_accepted_purchase',[order]),/adverse financial evidence/);assert.equal((await beginDownload(f.c)).allowed,false);
 assert.equal(await count(db,'journals'),0);assert.equal((await f.operations()).counts.pending,1);
}));
test('credential rotation retains immutable ingress identity while an approved same-account endpoint recovers pending work',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());const rotated='cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';
 await assert.rejects(db.exec(`update finance_private.provider_endpoints set credential_scope='${'c'.repeat(64)}'`),/immutable/);
 await db.exec(`update finance_private.provider_endpoints set enabled=false;insert into finance_private.provider_endpoints(id,account,credential_scope,signing_scope,enabled) values('${rotated}','acct_fixture','${'c'.repeat(64)}','${'d'.repeat(64)}',true)`);
 const job=await call(db,'claim_financial_provider_job',[rotated,'c'.repeat(64)]),proof=await readProviderEvidence(job,f.stripe);
 assert.equal((await call(db,'finish_financial_provider_job',[rotated,job.id,job.token,proof])).state,'posted');
 assert.equal((await db.query('select endpoint_id from finance_private.provider_events')).rows[0].endpoint_id,endpoint);assert.equal((await report(db,f.c.order)).matched,true);
}));
test('actual refund fee credits are posted separately from principal and reconcile to provider net',()=>fixture(async db=>{
 const f=await providerFixture(db);await f.capture(f.event());await f.run();await f.refund(1000);
 f.state.balances.get('txn_refund').fee=-25;f.state.balances.get('txn_refund').net=-975;
 assert.equal((await f.run()).posted,1);assert.equal(await bal(db,f.c.order,'processor_fees'),125n);assert.equal(await bal(db,f.c.order,'clearing'),3875n);
 assert.equal((await report(db,f.c.order)).matched,true);await balanced(db);
}));
