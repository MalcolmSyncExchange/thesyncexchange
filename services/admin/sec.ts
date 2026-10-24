import "server-only";
import { z } from "zod";
import { env, hasSupabaseEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/services/supabase/server";
import {selectUserProfileCompat} from "@/services/auth/user-profiles";
import {hasPrivilegedAssurance} from "@/services/auth/security";
import { PaymentError } from "@/services/orders/payment-request";
const moduleName=z.enum(["users","permissions","support","integrity","deals","subscriptions","settings","organizations","incidents","audit"]);
export const secSchema=z.discriminatedUnion("operation",[
 z.object({operation:z.literal("context")}).strict(),z.object({operation:z.literal("dashboard")}).strict(),
 z.object({operation:z.literal("read"),module:moduleName,page:z.number().int().min(1).max(10000),search:z.string().max(200),status:z.string().max(80),sort:z.enum(["newest","oldest"])}).strict(),
 z.object({operation:z.enum(["command","customer"]),module:moduleName,id:z.string().uuid(),revision:z.number().int().min(0).max(1000000),key:z.string().uuid(),action:z.string().regex(/^[a-z_]{2,30}$/),data:z.record(z.unknown()),reason:z.string().trim().min(5).max(2000),reference:z.string().trim().min(3).max(500)}).strict()
]);
export async function secRequest(input:unknown):Promise<unknown>{
 const p=secSchema.parse(input);
 if(!hasSupabaseEnv||env.demoMode)throw new PaymentError(503,"SEC_UNAVAILABLE");
 const db=await createServerSupabaseClient(),auth=await db.auth.getUser();if(auth.error||!auth.data.user)throw new PaymentError(401,"AUTH_REQUIRED");
 const profile=await selectUserProfileCompat(db,auth.data.user.id),role=profile.data?.role;
 if(profile.error||!["admin","artist","buyer"].includes(role||"")||(role==="admin"&&!await hasPrivilegedAssurance(db)))throw new PaymentError(403,"SEC_AUTHORIZATION_OR_FRESH_MFA_REQUIRED");
 if(role!=="admin"&&(p.operation==="context"||p.operation==="dashboard"||p.operation==="command"||(p.operation==="read"&&!["support","deals"].includes(p.module))))throw new PaymentError(403,"SEC_ACCESS_DENIED");
 const admission=await(db as unknown as{rpc(n:string):PromiseLike<{data:unknown;error:unknown}>}).rpc("sec_admit");
 if(admission.error||admission.data!==true)throw new PaymentError(429,"SEC_ACCESS_OR_REQUEST_LIMIT");
 let name:string,args:object={};
 if(p.operation==="context")name="sec_context";
 else if(p.operation==="dashboard")name="sec_dashboard";
 else if(p.operation==="read"){name="sec_read";args={p_module:p.module,p_page:p.page,p_search:p.search,p_status:p.status,p_sort:p.sort};}
 else{name=p.operation==="customer"?"sec_customer_command":"sec_command";args={p_module:p.module,p_id:p.id,p_expected:p.revision,p_request:p.key,p_action:p.action,p_data:p.data,...(p.operation==="command"?{p_reason:p.reason,p_reference:p.reference}:{})};}
 const r=await(db as unknown as{rpc(n:string,a:object):PromiseLike<{data:unknown;error:{code?:string}|null}>}).rpc(name,args);
 if(r.error){try{await(db as unknown as{rpc(n:string,a:object):PromiseLike<unknown>}).rpc("sec_record_denial",{p_module:"module" in p?p.module:p.operation,p_request:"key" in p?p.key:null,p_code:r.error.code||"P0001"});}catch{/* The denied action remains denied if evidence transport fails. */}}
 if(r.error||r.data===null)throw new PaymentError(r.error?.code==="42501"?403:r.error?.code==="40001"?409:["22023","P0001"].includes(r.error?.code||"")?422:503,r.error?.code==="42501"?"SEC_AUTHORIZATION_OR_FRESH_MFA_REQUIRED":r.error?.code==="40001"?"SEC_CHANGED_RELOAD_BEFORE_RETRY":"SEC_REVIEW_REQUIRED");return r.data;
}
