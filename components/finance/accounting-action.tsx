"use client";
import {useRef,useState} from "react";import {useRouter} from "next/navigation";
type Field={name:string;label:string;kind?:"json"|"date"|"uuid"|"nullableUuid";choices?:string[]};
export function AccountingAction({label,input,fields}:{label:string;input:Record<string,unknown>;fields:Field[]}){
 const router=useRouter(),key=useRef<string|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 return <form className="mt-3 space-y-3 rounded border p-3" onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);setMessage("");const form=event.currentTarget;
 try{const data=new FormData(form),payload:Record<string,unknown>={...input,key:key.current??(key.current=crypto.randomUUID())};for(const f of fields){const value=String(data.get(f.name)||"").trim();payload[f.name]=f.kind==="json"?JSON.parse(value):f.kind==="nullableUuid"&&!value?null:value;}
 const response=await fetch("/api/accounting",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});if(!response.ok)throw Error(response.status===409?"The evidence changed. Refresh and review before retrying.":"The action was denied or needs review. Retrying keeps the same request identity.");
 key.current=null;setMessage("Financial action recorded. Actual disbursements remain disabled.");router.refresh();}
 catch(error){setMessage(error instanceof Error?error.message:"Financial review required.");}finally{setBusy(false);}}}>
 <p className="font-medium">{label}</p>{fields.map(f=><label key={f.name} className="block text-sm">{f.label}{f.choices?<select aria-label={f.label} name={f.name} className="mt-1 block min-h-11 w-full rounded border bg-background p-2">{f.choices.map(c=><option key={c}>{c}</option>)}</select>:f.kind==="json"?<textarea aria-label={f.label} name={f.name} maxLength={6000} required className="mt-1 block min-h-28 w-full rounded border bg-background p-2"/>:<input aria-label={f.label} name={f.name} type={f.kind==="date"?"date":"text"} maxLength={f.name==="reason"?1000:500} required={f.kind!=="nullableUuid"} className="mt-1 block min-h-11 w-full rounded border bg-background p-2"/>}</label>)}
 <button disabled={busy} className="min-h-11 rounded border px-4 py-2">{busy?"Recording…":label}</button><p role="status" aria-live="polite">{message}</p></form>;
}
