import {FinancialEvidenceError} from '../../lib/finance/provider-events.mjs';
import {readProviderEvidence} from './provider-reader.mjs';
const terminal=new Set(['provider_account_mismatch','provider_event_conflict','provider_binding_mismatch','unsupported_provider_balance','invalid_balance_arithmetic','duplicate_balance_identity','provider_pagination_limit','malformed_evidence']);
export async function runFinancialWorker({claim,complete,fail,observe,stripe,now=Date.now,limit=3,budgetMs=20000}){
 if(!Number.isInteger(limit)||limit<1||limit>10||budgetMs<1||budgetMs>30000)throw Error('Invalid worker budget');
 const result={claimed:0,posted:0,retried:0,dead:0,uncertain:0};const started=now();
 while(result.claimed<limit&&now()-started<budgetMs){
  const job=await claim();if(!job)break;result.claimed++;
  try{
   let timeout;
   const remaining=Math.max(1,budgetMs-(now()-started));
   const proof=await Promise.race([readProviderEvidence(job,stripe),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new FinancialEvidenceError('provider_details_pending')),remaining);})]).finally(()=>clearTimeout(timeout));
   const outcome=await complete(job.id,job.token,proof);
   if(outcome.state==='posted')result.posted++;else if(outcome.state==='dead')result.dead++;else if(outcome.state==='retry')result.retried++;else result.uncertain++;
  }catch(error){
   const code=error instanceof FinancialEvidenceError?error.code:'provider_or_database_unavailable';
   // Unknown commit outcome is resolved by a fenced retry/lease expiry. No raw
   // provider exception, credential, signature or body reaches logs or clients.
   try{const state=await fail(job.id,job.token,code,terminal.has(code),error instanceof FinancialEvidenceError?error.evidence||{}:{});if(state==='dead')result.dead++;else if(state==='retry')result.retried++;else result.uncertain++;}catch{result.uncertain++;}
  }
 }
 if(observe)await observe(result);return result;
}
