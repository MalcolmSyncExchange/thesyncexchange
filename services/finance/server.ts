import "server-only";
import { requireSession } from "@/services/auth/session";
import { createServerSupabaseClient } from "@/services/supabase/server";

type FinanceRpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
async function adminRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  await requireSession("admin");
  const client = await createServerSupabaseClient();
  const { data, error } = await (client as unknown as FinanceRpc).rpc(name, args);
  if (error || !data) throw new Error("Financial evidence is unavailable or requires review.");
  return data as T;
}
export type FinancialOrder = {
  orderId?: string; currency?: string; grossMinor?: string; refundedMinor?: string;
  platformRevenueMinor?: string; balances?: Record<string,string>; issues: string[];
  matched: boolean; syntheticOnly?: boolean; withdrawableMinor?: string;
  journals?: Array<{id:string;kind:string;occurredAt:string;economicKey:string}>;
};
export const readFinancialOrder = (orderId: string) => adminRpc<FinancialOrder>("read_financial_order", { p_order:orderId });
export const readFinancialSummary = () => adminRpc<{ partitions: unknown[]; syntheticOnly:boolean; operationsEnabled:boolean }>("read_financial_summary", {});
export const reconcileFinancialOrder = (orderId: string, projection: Record<string,unknown>) => adminRpc<FinancialOrder & {reconciliationId:string}>("reconcile_financial_order", {p_order:orderId,p_provider:projection});
export const recordFinanceCaseAction = (input:{caseId:string;requestId:string;action:"investigate"|"retry_posting"|"escalate"|"acknowledge";reason:string;evidenceReference:string}) =>
  adminRpc<string>("record_finance_case_action", {p_case:input.caseId,p_request:input.requestId,p_action:input.action,p_reason:input.reason,p_reference:input.evidenceReference});
export const proposeFinanceRestatement = (input:{journalId:string;requestId:string;reason:string;evidenceReference:string}) =>
  adminRpc<string>("propose_finance_restatement", {p_journal:input.journalId,p_request:input.requestId,p_reason:input.reason,p_reference:input.evidenceReference});
export const approveFinanceRestatement = (correctionId:string) => adminRpc<unknown>("approve_finance_restatement", {p_correction:correctionId});
