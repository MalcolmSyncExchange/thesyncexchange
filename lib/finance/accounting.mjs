// Exact minor-unit arithmetic only. Policies are supplied explicitly, never defaulted.
export function exactMinor(value) {
 if (typeof value === 'bigint') { if(value<0n||value>9007199254740991n)throw Error('Exact minor units required');return value; }
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||value<0)throw Error('Exact minor units required');return BigInt(value);}
 if(typeof value!=='string'||! /^(0|[1-9][0-9]{0,15})$/.test(value))throw Error('Exact minor units required');
 const n=BigInt(value);if(n>9007199254740991n)throw Error('Exact minor units required');return n;
}
export function calculateCommission({grossMinor,currency,commissionBps,allocations}) {
 const gross=exactMinor(grossMinor);
 if(!gross||! /^[A-Z]{3}$/.test(currency)||!Number.isInteger(commissionBps)||commissionBps<0||commissionBps>10000||!Array.isArray(allocations)||!allocations.length||allocations.length>50)throw Error('Explicit financial policy required');
 const ids=new Set();let total=0;
 for(const a of allocations){if(!a||! /^[A-Za-z0-9_-]{2,100}$/.test(a.partyId)||ids.has(a.partyId)||!Number.isInteger(a.bps)||a.bps<1||a.bps>10000)throw Error('Unique explicit payee allocations required');ids.add(a.partyId);total+=a.bps;}
 if(total!==10000)throw Error('Allocations must total 10000 basis points');
 const fee=(gross*BigInt(commissionBps)+5000n)/10000n,net=gross-fee;let used=0n;
 const rows=allocations.map((a,i)=>{const amount=i===allocations.length-1?net-used:net*BigInt(a.bps)/10000n;used+=amount;return {...a,amountMinor:amount.toString()};});
 return {currency,grossMinor:gross.toString(),platformFeeMinor:fee.toString(),netMinor:net.toString(),allocations:rows,rounding:'commission-half-up; allocations-floor; final-declared-payee-residual'};
}
export function formatMinor(value,currency) {
 if(value===null||value===undefined)return 'Not shared';
 if(typeof value!=='string'||! /^-?(0|[1-9][0-9]*)$/.test(value)||! /^[A-Z]{3}$/.test(currency))throw Error('Invalid financial display');
 let digits;try{digits=new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits;}catch{digits=2;}
 const n=BigInt(value),negative=n<0n,abs=negative?-n:n,base=10n**BigInt(digits);
 return currency+' '+(negative?'-':'')+(abs/base).toLocaleString('en-US')+(digits?'.'+(abs%base).toString().padStart(digits,'0'):'');
}
// Page totals are labeled explicitly; no FX, currency netting or number coercion.
export function earningsPageTotals(orders) {
 const map=new Map();
 for(const order of orders){let p=map.get(order.currency);if(!p){p={currency:order.currency,owedMinor:0n,heldMinor:0n,pendingMinor:0n,simulatedCompletedMinor:0n,recoveryMinor:0n};map.set(order.currency,p);}
 for(const row of order.allocations.filter(a=>a.attributedToYou))for(const key of Object.keys(p).filter(k=>k!=='currency'))p[key]+=BigInt(row[key]);}
 return [...map.values()].map(p=>Object.fromEntries(Object.entries(p).map(([k,v])=>[k,typeof v==='bigint'?v.toString():v])));
}
