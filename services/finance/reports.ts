import "server-only";
import { requireSession } from "@/services/auth/session";
import { createServerSupabaseClient } from "@/services/supabase/server";
export type Allocation={partyId:string;legalName:string;allocationBps:number;allocatedMinor:string;attributedToYou:boolean;bindingId:string|null;artistId:string|null;pendingMinor:string;owedMinor:string;heldMinor:string;eligibleSimulationMinor:string;reservedMinor:string;refundAndLossMinor:string;recoveryMinor:string;simulatedCompletedMinor:string;paidMinor:string;availableMinor:string;hold:string|null};
export type Payout={id:string;partyId:string;legalName:string;amountMinor:string;currency:string;scheduledFor:string;state:string;revision:number;hold:string|null;actualPaidMinor:string;history:Array<{id:string;state:string;command:string;at:string;reason:string|null;reference:string|null}>};
export type AccountingOrder={orderId:string;currency:string;createdAt:string;trackTitle:string;managedSale:boolean;grossMinor:string|null;platformFeeMinor:string|null;netProceedsMinor:string|null;policyVersion:string;policy:unknown;processorFeeMinor:string|null;paidEvidence:boolean;allocations:Allocation[];payouts:Payout[];accounting:{matched:boolean;issues:string[];journals:unknown[]}|null};
export type AccountingReport={orders:AccountingOrder[];total:number;page:number;size:number;summary?:{partitions:Array<Record<string,string|number>>;unbookedOrders:number};bindingHistory?:unknown[];policyHistory?:unknown[]};
export async function getAccountingReport(role:"artist"|"admin",page=1,size=20):Promise<AccountingReport>{
 if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(size) || size < 1 || size > 50) throw Error("Bounded accounting page required.");
 await requireSession(role);const client=await createServerSupabaseClient();
 const {data,error}=await(client as unknown as {rpc(name:string,args:object):PromiseLike<{data:AccountingReport;error:unknown}>}).rpc(role==="artist"?"accounting_artist_earnings":"accounting_admin_report",{p_page:page,p_size:size});
 if(error||!data)throw Error("Accounting evidence is unavailable. Access and reconciliation require review.");return data;
}
