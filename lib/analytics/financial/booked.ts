export type BookedFinance = { state: "available"; currencies: {currency:string;commissionMinor:string;sellerEarningsMinor:string;outstandingObligationsMinor:string;disputeLossMinor:string;unpostedOrders:number}[]; basis:string };
export function validateBookedFinance(input: unknown): BookedFinance | null {
 if (!input || typeof input!=="object") return null;
 const p=input as Record<string,unknown>;
 if(p.state!=="available" || !Array.isArray(p.currencies) || p.currencies.length>200 || typeof p.basis!=="string") return null;
 const seen=new Set<string>();
 const rows:BookedFinance["currencies"]=[];
 for(const raw of p.currencies){
  if(!raw || typeof raw!=="object")return null;
  const r=raw as Record<string,unknown>;
  if(typeof r.currency!=="string" || !/^[A-Z]{3}$/.test(r.currency) || seen.has(r.currency))return null;
  seen.add(r.currency);
  const fields=["commissionMinor","sellerEarningsMinor","outstandingObligationsMinor","disputeLossMinor"] as const;
  for(const key of fields)if(typeof r[key]!=="string" || !/^-?(0|[1-9][0-9]{0,24})$/.test(r[key] as string))return null;
  if(!Number.isSafeInteger(r.unpostedOrders) || (r.unpostedOrders as number)<0)return null;
  rows.push({currency:r.currency,commissionMinor:r.commissionMinor as string,sellerEarningsMinor:r.sellerEarningsMinor as string,outstandingObligationsMinor:r.outstandingObligationsMinor as string,disputeLossMinor:r.disputeLossMinor as string,unpostedOrders:r.unpostedOrders as number});
 }
 return {state:"available",currencies:rows,basis:p.basis};
}
