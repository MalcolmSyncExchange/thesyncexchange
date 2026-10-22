"use server";
import {revalidatePath} from "next/cache";
import {requireSession} from "@/services/auth/session";
import {createServerSupabaseClient} from "@/services/supabase/server";
import {approveFinanceRestatement,proposeFinanceRestatement} from "@/services/finance/server";
export async function actOnFinancialJob(form:FormData){
  await requireSession("admin");
  const action=String(form.get("action")||"");if(!["retry","reconcile","acknowledge"].includes(action))throw Error("Invalid financial action.");
  const client=await createServerSupabaseClient();
  const {error}=await(client as unknown as {rpc(name:string,args:object):PromiseLike<{error:unknown}>}).rpc("act_on_financial_provider_job",{
    p_job:String(form.get("jobId")||""),p_request:String(form.get("requestId")||""),p_action:action,
    p_reason:String(form.get("reason")||""),p_reference:String(form.get("reference")||"")
  });
  if(error)throw Error("Financial action was denied. Review the job and original evidence.");revalidatePath("/admin/finance");
}
export async function proposeFinancialRestatement(form:FormData){
  await proposeFinanceRestatement({journalId:String(form.get("journalId")||""),requestId:String(form.get("requestId")||""),reason:String(form.get("reason")||""),evidenceReference:String(form.get("reference")||"")});
  revalidatePath("/admin/finance");
}
export async function approveFinancialRestatement(form:FormData){
  await approveFinanceRestatement(String(form.get("correctionId")||""));revalidatePath("/admin/finance");
}
