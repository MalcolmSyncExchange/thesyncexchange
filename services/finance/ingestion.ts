import "server-only";
import Stripe from "stripe";
import {digest, verifyFinancialWebhook} from "@/lib/finance/provider-events.mjs";
import {getDeploymentTarget} from "@/lib/env";
import {assertStripeServerConfiguration,serverEnv} from "@/lib/server-env";
import {createAdminSupabaseClient} from "@/services/supabase/admin";
import {runFinancialWorker} from "@/services/finance/worker.mjs";

type RpcClient={rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>};
export async function financeRpc<T>(client:RpcClient,name:string,args:Record<string,unknown>):Promise<T>{
  const {data,error}=await client.rpc(name,args);if(error)throw Error("financial_database_unavailable");return data as T;
}
function configuration(worker=false){
  if(process.env.SYNC_EXCHANGE_FINANCIAL_INGESTION_ENABLED!=="true" || (worker&&process.env.SYNC_EXCHANGE_FINANCIAL_WORKER_ENABLED!=="true"))throw Error("financial_processing_disabled");
  if(getDeploymentTarget()==="production")throw Error("financial_processing_requires_isolated_environment");
  assertStripeServerConfiguration("Financial provider evidence",{requireWebhook:true});
  if(!/^(sk|rk)_test_/.test(serverEnv.stripeSecretKey||"")||!/^acct_[A-Za-z0-9]+$/.test(serverEnv.stripeAccountId||""))throw Error("financial_account_configuration_invalid");
  const endpoint=process.env.TSE_FINANCE_ENDPOINT_ID||"";
  if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(endpoint))throw Error("financial_endpoint_configuration_invalid");
  const client=createAdminSupabaseClient();if(!client)throw Error("financial_server_configuration_invalid");
  const stripe=new Stripe(serverEnv.stripeSecretKey!,{apiVersion:"2024-06-20",timeout:5000,maxNetworkRetries:0});
  return {client:client as unknown as RpcClient,stripe,endpoint,credential:digest(serverEnv.stripeSecretKey!),signing:digest(serverEnv.stripeWebhookSecret!)};
}
export async function captureFinancialWebhook(raw:string,signature:string){
  const c=configuration();const {summary}=verifyFinancialWebhook(raw,signature,serverEnv.stripeWebhookSecret!,c.stripe);
  const result=await financeRpc<{state:string}>(c.client,"ingest_financial_provider_event",{p_endpoint:c.endpoint,p_credential:c.credential,p_signing:c.signing,p_raw:raw,p_summary:summary});
  return result;
}
export async function processFinancialQueue(){
  const c=configuration(true);
  return runFinancialWorker({stripe:c.stripe,
    claim:()=>financeRpc(c.client,"claim_financial_provider_job",{p_endpoint:c.endpoint,p_credential:c.credential}),
    complete:(id:string,token:string,proof:unknown)=>financeRpc(c.client,"finish_financial_provider_job",{p_endpoint:c.endpoint,p_job:id,p_token:token,p_proof:proof}),
    fail:(id:string,token:string,code:string,terminal:boolean,rejected:unknown={})=>financeRpc(c.client,"fail_financial_provider_job",{p_endpoint:c.endpoint,p_job:id,p_token:token,p_code:code,p_terminal:terminal,p_rejected:rejected})
  });
}
