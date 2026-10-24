"use client";
import { useCallback, useEffect, useState } from "react";
import { AgreementDownloadForm } from "@/components/orders/agreement-download-form";
import { formatCurrency } from "@/lib/utils";
import type { PurchaseSchedule } from "@/services/licensing/purchases";
type Lifecycle={contractualState:string;paymentState:string;issuanceState:string;revision:number;testOnly:boolean;rightsMeaning:string};
type Row={orderId:string;title:string|null;licenseName:string;use:string|null;territory:string|null;amountCents:number;currency:string;agreementNumber:string|null;termsVersion:string|null;lifecycle:Lifecycle};
type List={items:Row[];total:number;page:number;size:number};
type Detail={orderId:string;purchase:PurchaseSchedule|null;purchaseHash:string|null;acceptedAt:string|null;agreementNumber:string|null;generatedAt:string|null;lifecycle:Lifecycle;history:unknown[];issuanceFailure:string|null;sourceChain:unknown};
async function request<T>(body:object):Promise<T>{const response=await fetch("/api/licensing",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});if(!response.ok)throw new Error(response.status===409?"The record changed. Reload before retrying. No historical agreement was replaced.":"Licensing records are unavailable or access was denied. Retry or contact support.");return response.json();}
const inputClass="block w-full rounded border border-border bg-background p-2";
export function LicenseWorkspace({role}:{role:"buyer"|"artist"|"admin"}){
 const [list,setList]=useState<List|null>(null),[page,setPage]=useState(1),[detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const load=useCallback(async()=>{setError("");try{setList(await request<List>({action:"list",page,size:20}));}catch(e){setError((e as Error).message);}},[page]);
 useEffect(()=>{void load();},[load]);
 async function inspect(id:string){setError("");setDetail(null);try{setDetail(await request<Detail>({action:"read",order:id}));}catch(e){setError((e as Error).message);}}
 async function command(form:FormData){if(!detail)return;setBusy(true);setError("");const order=detail.orderId;try{await request({action:"lifecycle",order,revision:detail.lifecycle.revision,key:crypto.randomUUID(),command:form.get("command"),reason:form.get("reason"),reference:form.get("reference")});setStatus("Lifecycle action recorded. Original acceptance and agreement preserved.");await inspect(order);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="space-y-6"><h1 className="text-3xl font-semibold">{role==="admin"?"License oversight":role==="artist"?"Licensing activity":"Your licenses"}</h1>
  <p>Contractual status, payment status and delivery authorization are separate. An issued test record grants no commercial rights.</p>
  {role==="artist"?<p>Activity for your own catalog. Buyer identities, private agreements and other rightsholders’ details are withheld. Amounts show order value, not payable earnings.</p>:null}
  {error?<p role="alert">{error}</p>:null}{status?<p role="status">{status}</p>:null}
  <button className="rounded border px-3 py-2" onClick={()=>{void load();}}>Refresh records</button>
  {!list&&!error?<p role="status">Loading license records…</p>:null}
  {list?.items.length===0?<p>No licensing activity is available for this account.</p>:null}
  <div className="space-y-3">{list?.items.map(row=><article className="space-y-2 rounded border p-4" key={row.orderId}><h2 className="text-lg font-semibold">{row.title||"Pending transaction"} · {row.licenseName}</h2>
   <p>{row.use||"Usage review pending"} · {row.territory||"Territory review pending"} · {formatCurrency(row.amountCents/100,row.currency)}</p>
   <p>Contract: {row.lifecycle.contractualState} · Payment: {row.lifecycle.paymentState} · Issuance: {row.lifecycle.issuanceState}</p>
   {row.lifecycle.testOnly?<p className="font-semibold">TEST — NOT A COMMERCIAL LICENSE</p>:null}<p>Agreement: {row.agreementNumber||"Not issued"} · Terms: {row.termsVersion||"Acceptance pending"}</p>
   {role!=="artist"?<button className="rounded border px-3 py-2" onClick={()=>{void inspect(row.orderId);}}>Review {row.agreementNumber||row.orderId}</button>:null}
  </article>)}</div>
  {list?<nav className="flex gap-4" aria-label="License pages"><button disabled={page===1} onClick={()=>{setDetail(null);setPage(v=>v-1);}}>Previous</button><span>Page {page} · {list.total} records</span><button disabled={page*list.size>=list.total} onClick={()=>{setDetail(null);setPage(v=>v+1);}}>Next</button></nav>:null}
  {detail?<section className="space-y-4 rounded border p-4" aria-label="License record"><h2 className="text-xl font-semibold">Immutable accepted license record</h2><p className="break-all">Order {detail.orderId} · Purchase SHA-256 {detail.purchaseHash||"No acceptance"}</p>
   <p>{detail.lifecycle.rightsMeaning}</p><p>Accepted: {detail.acceptedAt||"Not accepted"}. Issued: {detail.generatedAt||"Not issued"}.</p>
   {detail.agreementNumber?<AgreementDownloadForm orderId={detail.orderId}>Download retained agreement</AgreementDownloadForm>:null}
   {detail.purchase?<><h3 className="font-semibold">Exact accepted terms — {detail.purchase.terms.version}</h3><p className="whitespace-pre-wrap break-words">{detail.purchase.terms.body}</p><details><summary>Complete transaction, rights, pricing and acceptance evidence</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(detail.purchase,null,2)}</pre></details></>:null}
   <details><summary>Retained lifecycle history</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(detail.history,null,2)}</pre></details>
   {role==="admin"?<><p>Issuance failure: {detail.issuanceFailure||"None recorded"}</p><details><summary>Source, verified payment and entitlement chain</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(detail.sourceChain,null,2)}</pre></details>
   <form action={command} className="space-y-3"><h3 className="font-semibold">Authorized lifecycle action</h3><p>Record the reviewed legal authority. This cannot amend price, parties or the original grant, reactivate a license, or issue replacement rights. Material amendments and renewals require a new reviewed agreement and acceptance.</p>
   <label className="block">Action<select disabled={busy} name="command" aria-label="Lifecycle action" className={inputClass}><option value="annotate">Append correction / investigation note</option><option value="terminate">Terminate under reviewed authority</option><option value="revoke">Revoke under reviewed authority</option></select></label>
   <label className="block">Reason<textarea disabled={busy} name="reason" required minLength={5} maxLength={2000} className={inputClass}/></label><label className="block">Legal authority / evidence reference<input disabled={busy} name="reference" required minLength={5} maxLength={500} className={inputClass}/></label><button disabled={busy} className="rounded border px-3 py-2">Record audited action</button></form></>:null}
  </section>:null}
  {role==="admin"?<ContractEditor/>:null}
 </div>;
}
function ContractEditor(){const [offer,setOffer]=useState<{offerId:string;contract:unknown;uses:string[];territories:string[];commissionBps:number;exclusive:boolean}|null>(null),[ids,setIds]=useState({track:"",license:""}),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function read(form:FormData){setMessage("");setOffer(null);const pair={track:String(form.get("track")),license:String(form.get("license"))};try{setOffer(await request({action:"offer",...pair}));setIds(pair);}catch(e){setMessage((e as Error).message);}}
 async function save(form:FormData){if(!offer)return;setBusy(true);try{const contract=JSON.parse(String(form.get("contract")));const result=await request<{offerId:string}>({action:"configure",...ids,expected:offer.offerId,contract,reference:form.get("reference")});setOffer(null);setMessage(`Version recorded as ${result.offerId}. Source and deliverable review, plus current catalog approval, are required before this offer can be purchased. No commercial pricing was activated.`);}catch(e){setMessage(e instanceof SyntaxError?"Enter valid contract JSON.":(e as Error).message);}finally{setBusy(false);}}
 return <section className="space-y-4 rounded border p-4" aria-label="License contract configuration"><h2 className="text-xl font-semibold">Versioned license contract configuration</h2><p>Configure an existing reviewed offer. Commercial terms require independent approval. A new version stays unavailable until source and deliverable reviews are completed and catalog approval remains current. Existing acceptances retain the original version.</p>
 <form action={read} className="space-y-3"><label className="block">Track identifier<input name="track" required className={inputClass}/></label><label className="block">License type identifier<input name="license" required className={inputClass}/></label><button className="rounded border px-3 py-2">Inspect current contract</button></form>
 {message?<p role="status" className="break-words">{message}</p>:null}{offer?<form action={save} className="space-y-3"><p>Reviewed uses: {offer.uses.join(", ")}. Territories: {offer.territories.join(", ")}. Commission: {offer.commissionBps} basis points. Exclusive: {String(offer.exclusive)}.</p>
 <label className="block">Reviewed contract JSON<textarea disabled={busy} aria-label="Reviewed contract JSON" key={offer.offerId} name="contract" required maxLength={30000} rows={14} defaultValue={JSON.stringify(offer.contract,null,2)} className={inputClass}/></label><p>Use the documented System 07 contract schema. No rates or legal terms are supplied by default.</p><label className="block">Review authority reference<input disabled={busy} name="reference" required minLength={5} maxLength={500} className={inputClass}/></label><button disabled={busy} className="rounded border px-3 py-2">Save new reviewed version</button></form>:null}
 </section>;
}
