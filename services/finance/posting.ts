import "server-only";
import { requireSession } from "@/services/auth/session";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";

// Explicit operator recovery adapter; no webhook, route, scheduler or capability
// is activated here. Verified payment_events are the durable replay source.
export async function postFinancialOrder(orderId:string) {
  await requireSession("admin");
  const client = await createPrivilegedSupabaseClient();
  const {data,error} = await (client as unknown as {
    rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>
  }).rpc("post_financial_order",{p_order:orderId});
  if (error || !data) throw new Error("Financial posting remains pending. Review the original evidence before retrying.");
  return data;
}
