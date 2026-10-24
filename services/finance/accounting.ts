import "server-only";
import { z } from "zod";
import { env, hasSupabaseEnv } from "@/lib/env";
import { resolveMaintenanceMode } from "@/lib/maintenance-mode.mjs";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { hasPrivilegedAssurance } from "@/services/auth/security";
import { PaymentError } from "@/services/orders/payment-request";
import { exactMinor } from "@/lib/finance/accounting.mjs";
const uuid=z.string().uuid(),reference=z.string().trim().min(5).max(500),reason=z.string().trim().min(5).max(1000),party=z.string().regex(/^[A-Za-z0-9_-]{2,100}$/);
const page={page:z.number().int().min(1).max(10000),size:z.number().int().min(1).max(50)};
const policy=z.object({version:z.string().min(2).max(100),sellerTier:z.string().min(2).max(100),currency:z.literal("USD"),commissionBasis:z.literal("gross"),commissionBps:z.number().int().min(0).max(10000),allocations:z.array(z.object({partyId:party,bps:z.number().int().min(1).max(10000)}).strict()).min(1).max(50),mode:z.enum(["synthetic","approved"]),feeOverride:z.boolean()}).strict();
const maturity=z.object({synthetic:z.literal(true),version:z.string().min(2).max(100),tier:z.string().min(2).max(100),approvalReference:reference,commissionBasis:z.enum(["gross","net_processor_fee"]),maturitySeconds:z.number().int().min(0).max(99999999),reserveBps:z.number().int().min(0).max(10000),refundPolicy:z.literal("proportional-floor-suspense-v1")}).strict();
export const accountingSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("earnings"),...page}).strict(),z.object({action:z.literal("report"),...page}).strict(),
 z.object({action:z.literal("bind"),order:uuid,party,artist:uuid.nullable(),expected:uuid.nullable(),key:uuid,reason,reference}).strict(),
 z.object({action:z.literal("prepare"),order:uuid,party,amount:z.string().regex(/^[1-9][0-9]{0,15}$/).refine(v=>{try{return exactMinor(v)>BigInt(0);}catch{return false;}}),scheduled:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),key:uuid,reference}).strict(),
 z.object({action:z.literal("payout"),payout:uuid,revision:z.number().int().min(1).max(1000000),command:z.enum(["schedule","hold","fail","simulate_complete","reverse","cancel"]),key:uuid,reason,reference}).strict(),
 z.object({action:z.literal("maturity"),order:uuid,policy:maturity,key:uuid}).strict(),
 z.object({action:z.literal("policy"),track:uuid,license:uuid,expected:uuid,key:uuid,policy,reference}).strict()
]);
export async function performAccountingRequest(input:unknown) {
 const p=accountingSchema.parse(input);
 if(!hasSupabaseEnv||env.demoMode||resolveMaintenanceMode(process.env.SYNC_EXCHANGE_MAINTENANCE_MODE).blocksApplication)throw new PaymentError(503,"ACCOUNTING_UNAVAILABLE");
 const client=await createServerSupabaseClient();const {data:{user},error}=await client.auth.getUser();if(error||!user)throw new PaymentError(401,"AUTH_REQUIRED");
 const profile=await selectUserProfileCompat(client,user.id),role=p.action==="earnings"?"artist":"admin";
 if(profile.error||profile.data?.role!==role||(role==="admin"&&!await hasPrivilegedAssurance(client)))throw new PaymentError(403,"ACCESS_DENIED");
 let name:string,args:object;
 switch(p.action){
 case "earnings":name="accounting_artist_earnings";args={p_page:p.page,p_size:p.size};break;
 case "report":name="accounting_admin_report";args={p_page:p.page,p_size:p.size};break;
 case "bind":name="accounting_bind_payee";args={p_order:p.order,p_party:p.party,p_artist:p.artist,p_expected:p.expected,p_request:p.key,p_reason:p.reason,p_reference:p.reference};break;
 case "prepare":name="accounting_prepare_payout";args={p_order:p.order,p_party:p.party,p_amount:p.amount,p_scheduled:p.scheduled,p_request:p.key,p_reference:p.reference};break;
 case "payout":name="accounting_act_payout";args={p_payout:p.payout,p_revision:p.revision,p_command:p.command,p_request:p.key,p_reason:p.reason,p_reference:p.reference};break;
 case "maturity":name="freeze_finance_simulation_policy";args={p_order:p.order,p_policy:p.policy};break;
 case "policy":name="accounting_configure_policy";args={p_track:p.track,p_license:p.license,p_expected:p.expected,p_request:p.key,p_policy:p.policy,p_reference:p.reference};break;
 }
 const result=await(client as unknown as {rpc(name:string,args:object):PromiseLike<{data:unknown;error:{code?:string}|null}>}).rpc(name,args);
 if(result.error||(result.data===null&&p.action!=="maturity"))throw new PaymentError(result.error?.code==="42501"?403:result.error?.code==="40001"?409:result.error?.code==="22023"?422:503,"ACCOUNTING_REVIEW_REQUIRED");return result.data??{recorded:true};
}
