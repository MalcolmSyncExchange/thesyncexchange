// Explicit synthetic policy inputs only. This module has no provider, database,
// environment, payout or production entitlement adapter.
import {createHash} from 'node:crypto';
const integer=(n,min=0)=>{if(!Number.isSafeInteger(n)||n<min)throw Error('Invalid integer money/policy value');return n;};
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
export function allocateMinor(amount,shares) {
 integer(amount);if(!Array.isArray(shares)||!shares.length)throw Error('Shares required');
 if(new Set(shares.map(s=>s.id)).size!==shares.length||shares.some(s=>typeof s.id!=='string'||!s.id||integer(s.bps)<0)||shares.reduce((n,s)=>n+s.bps,0)!==10000)throw Error('Shares must total 10000 basis points');
 const rows=shares.map(s=>({id:s.id,minor:Number(BigInt(amount)*BigInt(s.bps)/10000n),remainder:BigInt(amount)*BigInt(s.bps)%10000n}));
 let residual=amount-rows.reduce((n,s)=>n+s.minor,0);
 rows.sort((a,b)=>a.remainder===b.remainder?(a.id<b.id?-1:a.id>b.id?1:0):a.remainder>b.remainder?-1:1);
 for(const s of rows)if(residual-->0)s.minor++;
 return rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(({id,minor})=>({id,minor}));
}
export function financialSimulation({orderId,amountMinor,commissionBps,contributors,currency,policyVersion}) {
 integer(amountMinor,1);integer(commissionBps);if(commissionBps>10000||currency!=='USD'||typeof policyVersion!=='string'||!policyVersion||!orderId)throw Error('Explicit synthetic policy required');
 allocateMinor(0,contributors);
 const policy=structuredClone({orderId,amountMinor,commissionBps,contributors,currency,policyVersion});freeze(policy);
 let paid=false,refund=0,held=false;const events=new Map(),journal=[],history=[];let entitlement='none';
 const targets=remaining=>{
  const commission=Number(BigInt(remaining)*BigInt(policy.commissionBps)/10000n);
  return {cash:remaining,commission,contributors:allocateMinor(remaining-commission,policy.contributors)};
 };
 const balances=()=>{const result={cash:0,commission:0};for(const s of policy.contributors)result['payable:'+s.id]=0;
  for(const entry of journal)for(const line of entry.lines)result[line.account]=(result[line.account]||0)+(line.debit-line.credit);
  return result;
 };
 const post=(event,before,after)=>{
  const lines=[];const add=(account,delta)=>{if(delta)lines.push({account,debit:Math.max(0,delta),credit:Math.max(0,-delta)});};
  add('cash',after.cash-before.cash);add('commission',before.commission-after.commission);
  for(const s of after.contributors)add('payable:'+s.id,before.contributors.find(x=>x.id===s.id).minor-s.minor);
  if(lines.reduce((n,l)=>n+l.debit-l.credit,0)!==0)throw Error('Unbalanced posting');
  if(lines.length)journal.push(freeze({eventId:event.id,currency,policyVersion,lines}));
 };
 const api={
  apply(input){
   const e=structuredClone(input);
   if(typeof e.id!=='string'||!e.id||e.orderId!==orderId||e.currency!==currency||e.amountMinor!==amountMinor||e.verified!==true||!['paid','failed','refund','dispute'].includes(e.type))throw Error('Invalid verified simulation event');
   const hash=createHash('sha256').update(JSON.stringify([e.orderId,e.type,e.currency,e.amountMinor,e.refundedMinor??0,e.verified])).digest('hex');
   if(events.has(e.id)){if(events.get(e.id)!==hash)throw Error('Conflicting duplicate evidence');return api.snapshot();}
   const nextRefund=e.type==='refund'?integer(e.refundedMinor):refund;if(nextRefund>amountMinor)throw Error('Over-refund');
   const before=targets(paid?amountMinor-refund:0);
   // Terminal adverse evidence never reactivates a simulated license. A late
   // paid event still records the real liability, held for reconciliation.
   if(e.type==='paid'&&!paid&&refund>0){post({...e,id:e.id+':gross'},before,targets(amountMinor));paid=true;post({...e,id:e.id+':refund'},targets(amountMinor),targets(amountMinor-refund));}
   else if(e.type==='paid')paid=true;
   if(['failed','dispute'].includes(e.type))held=true;
   if(e.type==='refund')refund=Math.max(refund,nextRefund);
   if(!(e.type==='paid'&&refund>0&&before.cash===0))post(e,before,targets(paid?amountMinor-refund:0));events.set(e.id,hash);history.push(freeze(e));
   entitlement=!paid?'none':refund===amountMinor?'revoked':held||refund>0?'suspended':'synthetic_only';
   return api.snapshot();
  },
  reconcile(provider){
   const expected=paid?amountMinor-refund:0;
   if(!provider||!Number.isSafeInteger(provider.netMinor)||provider.currency!==currency)return {matched:false,reason:'invalid_provider_projection'};
   return {matched:provider.netMinor===expected,differenceMinor:provider.netMinor-expected};
  },
  snapshot(){return freeze(structuredClone({policy,paid,refundedMinor:refund,held,entitlement,commercialRightsGranted:false,events:events.size,history,journal,balances:balances()}));}
 };
 return api;
}
