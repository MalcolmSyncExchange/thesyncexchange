import "server-only";
import {randomUUID} from "node:crypto";
import { requireAccountScope } from "@/services/auth/authorization";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";

// Explicit operator recovery adapter; no webhook, route, scheduler or capability
// is activated here. Verified payment_events are the durable replay source.
export async function postFinancialOrder(orderId:string) {
  const {supabase}=await requireAccountScope("admin");
  const request=randomUUID();
  const audit=async(phase:string)=>{const r=await(supabase as unknown as{rpc(n:string,a:object):PromiseLike<{error:unknown}>}).rpc("sec_financial_recovery_evidence",{p_order:orderId,p_request:request,p_phase:phase});if(r.error)throw new Error("Financial recovery evidence requires review.");};
  await audit("requested");
  const client = await createPrivilegedSupabaseClient();
  const {data,error} = await (client as unknown as {
    rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>
  }).rpc("post_financial_order",{p_order:orderId});
  await audit("observed");
  if (error || !data) throw new Error("Financial posting remains pending. Review the original evidence before retrying.");
  return data;
}
