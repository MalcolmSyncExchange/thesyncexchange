import Stripe from 'stripe';
import {ids,asActor} from './artist-baseline-db.mjs';
import {seedDelivery} from './secure-delivery-fixture.mjs';
import {call} from './purchase-legal-fixture.mjs';
import {digest,normalizeProviderEvent,verifyFinancialWebhook} from '../../lib/finance/provider-events.mjs';
import {runFinancialWorker} from '../../services/finance/worker.mjs';
export const endpoint='abababab-abab-4bab-8bab-abababababab',credential=digest('sk_test_SYNTHETIC_FINANCE'),secret='whsec_SYNTHETIC_FINANCE',signing=digest(secret);
export async function providerFixture(db,{paid=true}={}){
 const c=await seedDelivery(db,{paid});
 await db.exec(`update finance_private.capabilities set synthetic_posting_enabled=true,ingestion_enabled=true,worker_enabled=true;
 insert into finance_private.provider_endpoints(id,account,credential_scope,signing_scope,enabled) values('${endpoint}','acct_fixture','${credential}','${signing}',true)`);
 if(!paid)await db.exec(`update orders set stripe_checkout_session_id='cs_test_fixture',stripe_payment_intent_id='pi_fixture' where id='${c.order}'`);
 const signingClient=new Stripe('sk_test_SYNTHETIC_FINANCE');
 const state={account:'acct_fixture',events:new Map(),charge:{id:'ch_fixture',livemode:false,payment_intent:'pi_fixture',amount:5000,amount_refunded:0,currency:'usd',paid,balance_transaction:paid?'txn_charge':null},refunds:[],disputes:[],balances:new Map([['txn_charge',{id:'txn_charge',source:'ch_fixture',type:'charge',amount:5000,fee:150,net:4850,currency:'usd',created:1700000000,exchange_rate:null}]]),calls:[]};
 const copy=x=>structuredClone(x);
 const read=(name,fn)=>async(...args)=>{state.calls.push(name);return copy(fn(...args));};
 const stripe={webhooks:signingClient.webhooks,accounts:{retrieve:read('account',()=>({id:state.account}))},events:{retrieve:read('event',id=>{if(!state.events.has(id))throw Error('SYNTHETIC provider unavailable');return state.events.get(id);})},
 paymentIntents:{retrieve:read('intent',id=>({id,livemode:false,latest_charge:state.charge.id}))},charges:{retrieve:read('charge',()=>state.charge)},refunds:{list:read('refunds',()=>({data:state.refunds,has_more:false}))},
 disputes:{list:read('disputes',()=>({data:state.disputes,has_more:false})),retrieve:read('dispute',id=>state.disputes.find(d=>d.id===id))},balanceTransactions:{retrieve:read('balance',id=>{if(!state.balances.has(id))throw Error('SYNTHETIC missing balance');return state.balances.get(id);})}};
 const event=(id='evt_providerPaid',type='checkout.session.completed',object=null)=>({id,type,created:1700000000,livemode:false,data:{object:object||{id:'cs_test_fixture',livemode:false,client_reference_id:c.order,payment_intent:'pi_fixture',amount_total:5000,currency:'usd',payment_status:paid?'paid':'unpaid'}}});
 const capture=async input=>{state.events.set(input.id,copy(input));const raw=JSON.stringify(input),signature=signingClient.webhooks.generateTestHeaderString({payload:raw,secret});const {summary}=verifyFinancialWebhook(raw,signature,secret,stripe);
  return call(db,'ingest_financial_provider_event',[endpoint,credential,signing,raw,summary]);};
 const claim=()=>call(db,'claim_financial_provider_job',[endpoint,credential]);
 const complete=(id,token,proof)=>call(db,'finish_financial_provider_job',[endpoint,id,token,proof]);
 const fail=(id,token,code,terminal,rejected={})=>call(db,'fail_financial_provider_job',[endpoint,id,token,code,terminal,rejected]);
 const run=(overrides={})=>runFinancialWorker({claim,complete,fail,stripe,limit:10,...overrides});
 const operations=()=>asActor(db,ids.admin,()=>call(db,'read_financial_provider_operations',[]));
 const due=()=>db.exec("update finance_private.provider_jobs set next_at=clock_timestamp()-interval '1 second' where state='retry'");
 const payment=(id,type,state,refunded=0)=>call(db,'record_purchase_completion_event',[c.order,'acct_fixture',id,'cs_test_fixture','pi_fixture',type,state,5000,refunded,'USD','a'.repeat(64),'2026-10-22T01:00:00Z']);
 const refund=async(amount,id='evt_refund')=>{
  state.charge.amount_refunded=amount;state.refunds=[{id:'re_fixture',charge:'ch_fixture',amount,currency:'usd',status:'succeeded',balance_transaction:'txn_refund'}];
  state.balances.set('txn_refund',{id:'txn_refund',source:'re_fixture',type:'refund',amount:-amount,fee:0,net:-amount,currency:'usd',created:1700000001,exchange_rate:null});
  await payment(id,'charge.refunded',amount===5000?'REFUNDED':'PARTIALLY_REFUNDED',amount);return capture(event(id,'charge.refunded',state.charge));
 };
 return {db,c,state,stripe,signingClient,event,capture,claim,complete,fail,run,operations,due,payment,refund};
}
