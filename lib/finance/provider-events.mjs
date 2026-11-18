import {createHash} from 'node:crypto';
export const supportedEvents=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','charge.succeeded','charge.updated','charge.refunded','charge.dispute.created','charge.dispute.updated','charge.dispute.closed','charge.dispute.funds_withdrawn','charge.dispute.funds_reinstated']);
export class FinancialEvidenceError extends Error {constructor(code){super(code);this.code=code;}}
export const fail=(code,evidence)=>{const error=new FinancialEvidenceError(code);if(evidence)error.evidence=evidence;throw error;};
export const identity=x=>typeof x==='string'?x:x?.id;
export const exact=(n,{negative=false}={})=>{if(!Number.isSafeInteger(n)||(!negative&&n<0))fail('malformed_evidence');return n;};
export function normalizeProviderEvent(e){
 if(!e||!/^evt_[A-Za-z0-9]+$/.test(e.id)||typeof e.type!=='string'||e.type.length>120||e.livemode!==false||e.account!=null)fail('unsupported_account_or_mode');
 exact(e.created);if(e.created<=0)fail('malformed_evidence');
 const base={id:e.id,type:e.type,created:e.created,livemode:false};
 if(!supportedEvents.has(e.type))return {...base,supported:false};
 const o=e.data?.object;if(!o||o.livemode!==false)fail('malformed_evidence');
 const session=e.type.startsWith('checkout.'),dispute=e.type.startsWith('charge.dispute.');
 const pi=identity(o.payment_intent)||null;
 if(pi!==null&&!/^pi_[A-Za-z0-9]+$/.test(pi))fail('malformed_evidence');
 if(!new RegExp(session?'^cs_test_[A-Za-z0-9]+$':dispute?'^(dp|du)_[A-Za-z0-9]+$':'^ch_[A-Za-z0-9]+$').test(o.id))fail('malformed_evidence');
 const amount=exact(session?o.amount_total:o.amount),currency=String(o.currency||'').toUpperCase();
 if(amount<=0||!/^[A-Z]{3}$/.test(currency))fail('malformed_evidence');
 const hint=session?(o.client_reference_id||o.metadata?.orderId||null):null;
 if(hint!==null&&!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(hint))fail('malformed_evidence');
 const result={...base,supported:true,objectId:o.id,paymentIntent:pi,session:session?o.id:null,charge:dispute?identity(o.charge):session?null:o.id,
  orderHint:hint,amount,currency,refunded:session||dispute?0:exact(o.amount_refunded),state:session?o.payment_status:dispute?o.status:o.paid===true?'paid':'unpaid'};
 if(result.refunded>amount||(dispute&&!/^ch_[A-Za-z0-9]+$/.test(result.charge||''))||typeof result.state!=='string'||result.state.length>80)fail('malformed_evidence');
 if((session&&result.state==='paid'&&!pi)||(!session&&!pi))fail('malformed_evidence');
 return result;
}
export const canonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function verifyFinancialWebhook(raw,signature,secret,stripe){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>262144||!signature||!secret)fail('invalid_webhook');
 let event;try{event=stripe.webhooks.constructEvent(raw,signature,secret,300);}catch{fail('invalid_signature');}
 return {event,summary:normalizeProviderEvent(event)};
}
