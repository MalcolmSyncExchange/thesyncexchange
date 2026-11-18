import {randomUUID} from "node:crypto";
import {requireSession} from "@/services/auth/session";
import {createServerSupabaseClient} from "@/services/supabase/server";
import {actOnFinancialJob,approveFinancialRestatement,proposeFinancialRestatement} from "./actions";
export const dynamic="force-dynamic";
type Job={id:string;order_id:string|null;event_id:string;event_type:string;state:string;attempt:number;generation:number;next_at:string;lease_until:string|null;last_code:string|null};
type Operations={counts:Record<string,number>;jobs:Job[];attempts:unknown[];alerts:unknown[];corrections:unknown[];currentExceptions:unknown[];oldestPendingSeconds:number;capabilities:{ingestion:boolean;worker:boolean};externalAlertDelivery:string};
const input="rounded border border-border bg-background p-2";
export default async function FinancialOperationsPage(){
  await requireSession("admin");const client=await createServerSupabaseClient();
  const {data,error}=await(client as unknown as {rpc(name:string,args:object):PromiseLike<{data:Operations;error:unknown}>}).rpc("read_financial_provider_operations",{});
  if(error||!data)return <div><h1 className="text-3xl font-semibold">Financial operations</h1><p className="mt-4">Financial evidence is unavailable. Review configuration and migration compatibility before processing.</p></div>;
  return <div className="space-y-6"><h1 className="text-3xl font-semibold">Financial operations</h1>
    <a className="inline-flex min-h-11 items-center underline" href="/admin/accounting">Open financial accounting and payout obligations</a>
    <p>TEST evidence only. Real financial operations remain disabled. Retry and acknowledgment preserve original evidence and existing access holds.</p>
    <dl className="flex flex-wrap gap-4">{Object.entries(data.counts).map(([state,count])=><div key={state}><dt>{state}</dt><dd className="text-xl font-semibold">{count}</dd></div>)}</dl>
    <p>Oldest pending: {data.oldestPendingSeconds} seconds. Ingestion {data.capabilities.ingestion?"enabled":"disabled"}; worker {data.capabilities.worker?"enabled":"disabled"}. External alerts: {data.externalAlertDelivery}.</p>
    <div className="space-y-4">{data.jobs.map(job=><article key={job.id} className="space-y-3 rounded border p-4">
      <p className="font-medium">{job.event_type} — {job.state}</p><p className="break-all text-sm">{job.event_id} · Job {job.id}</p>
      <p className="text-sm">Attempt {job.attempt}/8 · generation {job.generation} · next {job.next_at} · {job.last_code||"No processing error"}</p>
      {job.order_id?<a className="underline" href={`/admin/orders#order-${job.order_id}`}>Review original order, journal and license evidence</a>:<p>Canonical order binding pending.</p>}
      <form action={actOnFinancialJob} className="flex flex-wrap gap-2">
        <input type="hidden" name="jobId" value={job.id}/><input type="hidden" name="requestId" value={randomUUID()}/>
        <label>Action <select className={input} name="action"><option value="acknowledge">Acknowledge for investigation</option>{["dead","retry"].includes(job.state)?<option value="retry">Retry unchanged evidence</option>:null}{job.state==="posted"?<option value="reconcile">Refresh reconciliation</option>:null}</select></label>
        <label>Reason <input className={input} name="reason" minLength={10} maxLength={1000} required/></label>
        <label>Evidence reference <input className={input} name="reference" minLength={5} maxLength={500} required/></label>
        <button className="rounded border px-3 py-2" type="submit">Record action</button>
      </form>
    </article>)}</div>
    <details open={data.currentExceptions.length>0}><summary>Current reconciliation exceptions</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(data.currentExceptions,null,2)}</pre></details>
    <details><summary>Processing attempts and retained alert history</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({attempts:data.attempts,alerts:data.alerts},null,2)}</pre></details>
    <details className="space-y-3"><summary>Independent financial restatement review</summary>
      <p>Retains the original journal and appends an exact reversal and replacement. A different current Admin must approve. This does not clear payment, rights or delivery holds.</p>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(data.corrections,null,2)}</pre>
      <form action={proposeFinancialRestatement} className="flex flex-wrap gap-2"><input type="hidden" name="requestId" value={randomUUID()}/>
        <label>Original journal ID <input className={input} name="journalId" required/></label><label>Reason <input className={input} name="reason" minLength={10} maxLength={1000} required/></label>
        <label>Evidence reference <input className={input} name="reference" minLength={5} maxLength={500} required/></label><button className="rounded border px-3 py-2">Propose retained restatement</button>
      </form>
      <form action={approveFinancialRestatement} className="flex flex-wrap gap-2"><label>Correction ID <input className={input} name="correctionId" required/></label><button className="rounded border px-3 py-2">Approve as independent reviewer</button></form>
    </details>
  </div>;
}
