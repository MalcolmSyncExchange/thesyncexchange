import {canonical,exact,fail,identity,normalizeProviderEvent} from '../../lib/finance/provider-events.mjs';

// Read-only Stripe API surface. Never creates a charge/refund/transfer or payout.
export async function readProviderEvidence(job,stripe){
 const account=await stripe.accounts.retrieve();if(account.id!==job.account)fail('provider_account_mismatch');
 const event=normalizeProviderEvent(await stripe.events.retrieve(job.event.id));
 if(canonical(event)!==canonical(job.event))fail('provider_event_conflict',{providerEvent:event});
 let pi=event.paymentIntent,chargeId=event.charge;
 if(!chargeId&&pi){const intent=await stripe.paymentIntents.retrieve(pi);if(intent.id!==pi||intent.livemode!==false)fail('provider_binding_mismatch');chargeId=identity(intent.latest_charge);}
 const result={schemaVersion:'TSE-PROVIDER-1',account:job.account,event,paymentIntent:pi,charge:null,balances:[],disputes:[]};
 if(!chargeId)return result;
 const charge=await stripe.charges.retrieve(chargeId);
 if(charge.id!==chargeId||charge.livemode!==false||!identity(charge.payment_intent)||(pi&&identity(charge.payment_intent)!==pi))fail('provider_binding_mismatch');
 pi=identity(charge.payment_intent);result.paymentIntent=pi;
 result.charge={id:charge.id,paymentIntent:pi,amount:exact(charge.amount),refunded:exact(charge.amount_refunded),currency:String(charge.currency).toUpperCase(),paid:charge.paid===true};
 const seen=new Set();
 const balance=async(ref,kind,sourceId)=>{
  const id=identity(ref);if(!id)fail('provider_details_pending');
  const b=await stripe.balanceTransactions.retrieve(id);
  const economic={id:b.id,source:identity(b.source),type:b.type,amount:b.amount,fee:b.fee,net:b.net,currency:b.currency};
  if(b.id!==id||!/^txn_[A-Za-z0-9]+$/.test(id)||identity(b.source)!==sourceId||b.exchange_rate!=null||String(b.currency).toUpperCase()!==result.charge.currency)fail('unsupported_provider_balance',{balance:economic});
  if(!['charge','refund','adjustment'].includes(b.type)||((kind==='charge'||kind==='refund')&&b.type!==kind))fail('unsupported_provider_balance');
  exact(b.amount,{negative:true});exact(b.fee,{negative:true});exact(b.net,{negative:true});exact(b.created);
  if(BigInt(b.amount)-BigInt(b.fee)!==BigInt(b.net))fail('invalid_balance_arithmetic',{balance:economic});
  if(seen.has(id))fail('duplicate_balance_identity');seen.add(id);
  result.balances.push({id,kind,source:sourceId,type:b.type,amount:b.amount,fee:b.fee,net:b.net,currency:result.charge.currency,created:b.created});
 };
 if(charge.paid)await balance(charge.balance_transaction,'charge',charge.id);
 let after,refunded=0n;
 for(let page=0;page<10;page++){
  const refunds=await stripe.refunds.list({charge:charge.id,limit:100,...(after?{starting_after:after}:{})});
  for(const r of refunds.data){if(identity(r.charge)!==charge.id||r.currency.toUpperCase()!==result.charge.currency)fail('provider_binding_mismatch');
   if(r.status==='succeeded'){refunded+=BigInt(exact(r.amount));await balance(r.balance_transaction,'refund',r.id);}}
  if(!refunds.has_more)break;if(!refunds.data.length||page===9)fail('provider_pagination_limit');after=refunds.data.at(-1).id;
 }
 if(refunded!==BigInt(result.charge.refunded))fail('provider_details_pending');
 // List all charge disputes, not merely the event's latest object. This makes
 // partial/refund/paid jobs reconcile the same complete financial evidence.
 const disputes=await stripe.disputes.list({charge:charge.id,limit:100});if(disputes.has_more)fail('provider_pagination_limit');
 for(const entry of disputes.data){
  const d=await stripe.disputes.retrieve(entry.id);
  if(d.livemode!==false||identity(d.charge)!==charge.id||(d.payment_intent&&identity(d.payment_intent)!==pi)||d.currency.toUpperCase()!==result.charge.currency)fail('provider_binding_mismatch');
  const amount=exact(d.amount);if(amount<=0||amount>charge.amount)fail('unsupported_provider_balance');
  result.disputes.push({id:d.id,amount,status:d.status});
  for(const b of d.balance_transactions)await balance(b,'dispute',d.id);
 }
 result.balances.sort((a,b)=>a.created-b.created||a.id.localeCompare(b.id));result.disputes.sort((a,b)=>a.id.localeCompare(b.id));
 return result;
}
