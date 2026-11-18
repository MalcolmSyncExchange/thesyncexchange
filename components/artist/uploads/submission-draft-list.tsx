"use client";
import Link from 'next/link';
import {useEffect,useState} from 'react';
type Draft={id:string;title:string;file_count?:number;review_state?:string|null};
export function SubmissionDraftList(){
 const [drafts,setDrafts]=useState<Draft[]>([]);
 useEffect(()=>{const controller=new AbortController();fetch('/api/media',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'list'}),cache:'no-store',signal:controller.signal}).then(async r=>{if(r.ok){const rows=await r.json();if(!controller.signal.aborted&&Array.isArray(rows))setDrafts(rows);}}).catch(()=>{});return()=>controller.abort();},[]);
 if(!drafts.length)return null;
 return <section aria-label="Saved music submissions" className="space-y-4 rounded-xl border border-border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Continue your music submissions</h2><Link className="text-sm underline underline-offset-4" href="/artist/submit">All drafts</Link></div><ul className="grid gap-3 sm:grid-cols-2">{drafts.slice(0,6).map(d=><li key={d.id}><Link className="block space-y-1 rounded-lg border border-border p-4 hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" href={'/artist/submit?draft='+d.id}><span className="block font-medium">{d.title}</span><span className="block text-xs text-muted-foreground">{d.review_state==='pending'?'Awaiting THE SEC audio review':d.review_state==='approved'?'Audio reviewed · catalog review remains separate':'Private draft'} · {d.file_count||0} file{d.file_count===1?'':'s'}</span></Link></li>)}</ul></section>;
}
