"use client";
import Link from 'next/link';
import { CatalogReviewPanel, CatalogStatusBadge } from '@/components/admin/catalog-review-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CatalogQueueContext } from '@/lib/admin/review-queue-navigation';
import { formatDuration, formatEnumLabel } from '@/lib/utils';
import {useCallback,useEffect,useRef,useState} from 'react';
import {catalogMetadataSchema,catalogMissing,catalogStates,creditRoles,blockerLabels,type CatalogMetadata,type CatalogState,type CatalogQueue,type CatalogDecision,type CatalogVersion,type CatalogEvent} from '@/lib/catalog/contract';
type Pending={key:string;action:string};
const friendly=(code:string)=>code==='DUPLICATE_RECORDING'?'This recording already has a catalog record. Reuse the existing record or ask THE SEC to investigate its identity.':code==='STALE_REVISION'?'This catalog changed in another session. Reload the saved metadata before retrying.':code==='ACCESS_DENIED'?'This action is unavailable. Check current rights, approved media, publication state and your access.':code==='CHECK_REQUIRED_FIELDS'?'Check the metadata, review explanation and required fields. Recording identity corrections require artist resubmission.':code==='UPLOAD_LIMIT'?'The operation limit has been reached. Try again later.':'Catalog service unavailable. Recover the interrupted operation before retrying.';
export function CatalogWorkbench({ track, admin = false, initialFilter = '', queueContext, onQueueChange, returnHref }: {
 track?: string;
 admin?: boolean;
 initialFilter?: '' | 'submitted';
 queueContext?: CatalogQueueContext;
 onQueueChange?: (context: CatalogQueueContext) => void;
 returnHref?: string;
}) {
 const [state,setState]=useState<CatalogState|null>(null),[localFilter,setFilter]=useState<string>(initialFilter),[localPage,setPage]=useState(1),[draft,setDraft]=useState<CatalogMetadata|null>(null),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState<Pending|null>(null);
 const [queueResult,setQueueResult]=useState<{key:string;data:CatalogQueue|null;status:'loading'|'success'|'error'|'denied'}>({key:'',data:null,status:'loading'});
 const [refresh,setRefresh]=useState(0);
 const filter = queueContext?.filter ?? localFilter;
 const page = queueContext?.page ?? localPage;
 const [reloadFailed, setReloadFailed] = useState(false);
 const queueKey=JSON.stringify([admin,filter,page]);
 const queue=queueResult.key===queueKey?queueResult.data:null;
 const queueStatus=queueResult.key===queueKey?queueResult.status:'loading';
 const queueBusy=queueStatus==='loading';
 const [versions,setVersions]=useState<CatalogVersion[]>([]),[decisions,setDecisions]=useState<CatalogDecision[]>([]),[events,setEvents]=useState<CatalogEvent[]>([]);
 const [tagInputs,setTagInputs]=useState({moods:'',keywords:''});
 const formRevision=useRef<number|null>(null);const storageKey='tse-catalog-operation:'+String(track)+':'+admin;
 const request=useCallback(async(body:Record<string,unknown>)=>{
  const r=await fetch('/api/catalog',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  // Authorization comes from HTTP status, even when the body is null or unreadable.
  if(r.status===401||r.status===403)throw Object.assign(new Error(friendly('ACCESS_DENIED')),{status:r.status});
  const unavailable=()=>Object.assign(new Error('Catalog service unavailable.'),{status:r.ok?undefined:r.status});
  const data=await r.json().catch(()=>{throw unavailable();});
  const object=data!==null&&typeof data==='object'&&!Array.isArray(data)?data as Record<string,unknown>:null;
  if(!r.ok)throw Object.assign(new Error(friendly(typeof object?.error==='string'?object.error:'')),{status:r.status});
  if(!object)throw unavailable();
  if(body.action==='list'&&(!Array.isArray(object.items)||typeof object.total!=='number'||typeof object.page_count!=='number'))throw unavailable();
  return data;
 },[]);
 const clearDetail = useCallback(() => {
  setState(null);
  setDraft(null);
  setVersions([]);
  setDecisions([]);
  setEvents([]);
  setNote('');
  setTagInputs({ moods: '', keywords: '' });
  formRevision.current = null;
 }, []);
 const load=useCallback(async(reset=false)=>{if(!track)return;let next: CatalogState;
  try {
   next = await request({ action: 'read', track, admin });
  } catch (failure) {
   if (admin && isAuthorizationDenial(failure)) clearDetail();
   throw failure;
  }
  setState(next);setVersions(next.versions);setDecisions(next.decisions);setEvents(next.events);if(reset||formRevision.current===null){setDraft(next.draft);setTagInputs({moods:next.draft.moods.join(', '),keywords:next.draft.keywords.join(', ')});formRevision.current=next.revision;}},[request,track,admin,clearDetail]);
 useEffect(()=>{if(!track)return;let active=true;setBusy(true);load().catch(e=>{if(active){setError(e.message);if(admin)setReloadFailed(true);}}).finally(()=>{if(active)setBusy(false);});try{const stored=sessionStorage.getItem(storageKey);if(stored){const p=JSON.parse(stored);if(typeof p.key==='string'&&typeof p.action==='string')setPending({key:p.key,action:p.action});}}catch{}return()=>{active=false;};},[load,storageKey,track,admin]);
 // Only retain results for the same role, filter and page. Ignore obsolete responses.
 useEffect(()=>{
  if(track)return;
  let active=true;
  setQueueResult(previous=>({key:queueKey,data:previous.key===queueKey?previous.data:null,status:'loading'}));
  request({action:'list',admin,state:filter,page}).then((data:CatalogQueue)=>{
   if(active)setQueueResult({key:queueKey,data,status:'success'});
  }).catch((failure:Error&{status?:number})=>{
   if(!active)return;
   const denied=isAuthorizationDenial(failure);
   setQueueResult(previous=>({key:queueKey,data:denied?null:previous.data,status:denied?'denied':'error'}));
  });
  return()=>{active=false;};
 },[track,queueKey,admin,filter,page,refresh,request]);
 async function reloadDetail() {
  setBusy(true);
  setReloadFailed(false);
  setError('');
  setMessage('');
  try {
   await load(true);
   setMessage('Saved metadata reloaded.');
  } catch (failure) {
   setReloadFailed(true);
   setError(isAuthorizationDenial(failure)
    ? 'Catalog access denied. Check your account and security verification before retrying.'
    : 'Saved metadata could not be loaded. Retry the request.');
  } finally {
   setBusy(false);
  }
 }
 function clearPending(){setPending(null);try{sessionStorage.removeItem(storageKey);}catch{}}
 async function mutate(action:string,extra:Record<string,unknown>={}){if(!track||!state||busy||pending)return;setBusy(true);setError('');setMessage('');const p={key:crypto.randomUUID(),action};setPending(p);try{sessionStorage.setItem(storageKey,JSON.stringify(p));}catch{}
  try{if((action==='save'||action==='review')&&draft){const result=catalogMetadataSchema.safeParse(draft);if(!result.success)throw Object.assign(new Error(result.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; ')),{status:400});}
   await request({action,track,revision:formRevision.current,key:p.key,...extra});clearPending();await load(true);setMessage(action==='save'?'Catalog draft saved.':action==='submit'?'Catalog submitted for review.':action==='review'?'Catalog decision recorded.':'Publication decision recorded.');
  }catch(e){const failure=e as Error&{status?:number};if(failure.status&&failure.status<500)clearPending();setError(failure.message);if(admin&&isAuthorizationDenial(failure))clearDetail();else await load(false).catch(()=>{});}finally{setBusy(false);}
 }
 async function recover(){if(!track||!pending)return;setBusy(true);setError('');try{const r=await request({action:'recover',track,key:pending.key,admin});clearPending();await load(true);setMessage(r.committed?'The operation committed and was recovered.':'The operation did not commit. Review the saved metadata before retrying.');}catch(e){if(admin&&isAuthorizationDenial(e))clearDetail();setError((e as Error).message);}finally{setBusy(false);}}
 async function older(kind:'versions'|'decisions'|'events'){const items=kind==='versions'?versions:kind==='decisions'?decisions:events;const last=items.at(-1);if(!track||!last)return;setBusy(true);try{const r=await request({action:'history',track,kind,before:String(last.id),admin});if(kind==='versions')setVersions(v=>[...v,...r.items]);if(kind==='decisions')setDecisions(v=>[...v,...r.items]);if(kind==='events')setEvents(v=>[...v,...r.items]);setMessage(r.items.length?'Earlier history loaded.':'No earlier history.');}catch(e){if(admin&&isAuthorizationDenial(e))clearDetail();setError((e as Error).message);}finally{setBusy(false);}}
 const set=(k:keyof CatalogMetadata,v:unknown)=>setDraft(p=>p?{...p,[k]:v}:p);
 const locked=busy||!!pending||!state||(!admin&&['submitted','suspended','archived'].includes(state.state))||(admin&&state.state!=='submitted');
 const control='mt-1 block w-full min-w-0 rounded-md border border-border bg-background p-2 disabled:opacity-60';
 const field=(k:keyof CatalogMetadata,label:string,type='text',readOnly=false)=><label key={k} className="block min-w-0 text-sm font-medium">{label}<input className={control} name={k} type={type} value={draft?.[k] as string|number??''} readOnly={readOnly} disabled={locked||readOnly} onChange={e=>set(k,type==='number'?(e.target.value===''?null:Number(e.target.value)):e.target.value)}/></label>;
 const select=(k:keyof CatalogMetadata,label:string,options:string[])=><label key={k} className="block min-w-0 text-sm font-medium">{label}<select className={control} aria-label={label} name={k} value={draft?.[k] as string??''} disabled={locked} onChange={e=>set(k,e.target.value)}>{options.map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>;
 if (!track && admin && queueContext && onQueueChange) {
  return <CatalogReviewPanel context={queueContext} queue={queue} status={queueStatus}
   onChange={onQueueChange} onRefresh={() => setRefresh(value => value + 1)} />;
 }

 const readOnlyMetadata = admin && state && state.state !== 'submitted';
 return <div className={admin && track ? 'mx-auto w-full min-w-0 max-w-[1400px] space-y-6' : 'space-y-6 min-w-0'}>
  {returnHref && <Button asChild variant="outline" size="lg"><Link href={returnHref}>Back to Catalog Reviews</Link></Button>}
  <div><h1 className="break-words text-3xl font-semibold">{admin?(state?.title || 'Catalog review & publication'):'Catalog metadata & publication'}</h1><p className="mt-2 text-muted-foreground">Rights review, media approval and catalog publication are separate decisions. Historical licenses keep their original evidence.</p></div>
  {error?<p role="alert" className="rounded-md border border-destructive p-3 text-destructive break-words">{error}</p>:null}<p role="status" aria-live="polite">{!track?(queueBusy?(queue?'Refreshing catalog results…':'Loading catalog…'):queueStatus==='success'?`${queue?.total||0} catalog record${queue?.total===1?'':'s'} loaded.`:''):busy?'Loading catalog…':message}</p>
  {admin && track && reloadFailed && <Button type="button" variant="outline" size="lg" disabled={busy} onClick={reloadDetail}>Retry loading metadata</Button>}
  {pending?<button className="rounded-md border p-3" disabled={busy} onClick={recover}>Recover interrupted catalog operation</button>:null}
  {!track?<><div className="flex flex-wrap gap-3"><label>Review status<select className={control} aria-label="Review status" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="">All statuses</option><option value="not_started">Not started</option>{catalogStates.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></label><Link className="self-end underline p-2" href={admin?'/admin/media':'/artist/uploads'}>{admin?'Inspect media queue':'Create a track or upload music'}</Link><button className="rounded-md border p-3" disabled={queueBusy} onClick={()=>setRefresh(v=>v+1)}>{queueStatus==='error'?'Retry catalog request':queueStatus==='denied'?'Check catalog access again':'Refresh catalog results'}</button></div>{queueStatus==='denied'?<p role="alert" className="break-words">Catalog access denied. Sign in with an authorized account and complete any required security verification before checking access again.</p>:queueStatus==='error'?<p role="alert" className="break-words">Catalog results could not be loaded. Retry the request.{queue?' Previously loaded results are shown and may be out of date.':''}</p>:null}{queue?.items.length?queue.items.map(t=><article key={t.id} className="rounded-lg border border-border p-4"><Link className="font-semibold underline" href={(admin?'/admin/catalog':'/artist/catalog/manage')+'?track='+t.id}>{t.title}</Link><p>{t.state.replaceAll('_',' ')} · {t.visible?'Published and eligible':'Unavailable to new buyers'}</p>{t.blockers.map(b=><p key={b} className="text-sm text-muted-foreground">{blockerLabels[b]||b}</p>)}</article>):queueStatus==='success'?<p>No catalog records match this status.</p>:null}{queue?<nav aria-label="Catalog queue pages" className="flex flex-wrap gap-4"><button disabled={queueBusy||page<=1} onClick={()=>setPage(v=>v-1)}>Previous</button><span>Page {page} of {Math.max(1,queue?.page_count||0)} · {queue?.total||0} records</span><button disabled={queueBusy||page>=(queue?.page_count||0)} onClick={()=>setPage(v=>v+1)}>Next</button></nav>:null}</>:null}
  {state&&draft?<>
   {admin ? (
    <Card aria-label="Catalog publication status">
     <CardHeader>
      <CardTitle>Review status</CardTitle>
      <div className="flex flex-wrap items-center gap-2">
       <CatalogStatusBadge state={state.state} />
       <span className="text-sm text-muted-foreground">{state.visible ? 'Published and eligible' : 'Unavailable to new buyers'}</span>
      </div>
      <CardDescription>{state.state === 'draft' ? 'The artist must submit this draft before catalog metadata review can begin.' : state.note}</CardDescription>
     </CardHeader>
     <CardContent className="space-y-3">
      {state.blockers.length > 0 && <details className="rounded-lg border border-border px-4 text-sm" open>
       <summary className="min-h-11 cursor-pointer rounded-sm py-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {state.blockers.length} publication {state.blockers.length === 1 ? 'blocker' : 'blockers'}
       </summary>
       <ul className="list-disc space-y-1 pb-4 pl-5 text-muted-foreground">{state.blockers.map(blocker =>
        <li key={blocker}>{blockerLabels[blocker] || formatEnumLabel(blocker)}</li>)}</ul>
      </details>}
      <div className="flex flex-wrap gap-2">
       <Button asChild variant="outline" size="lg"><Link href={'/admin/rights?track=' + track}>Review rights</Link></Button>
       {state.media_submission && <Button asChild variant="outline" size="lg"><Link href={'/admin/media?draft=' + state.media_submission}>Inspect audio assets</Link></Button>}
      </div>
     </CardContent>
    </Card>
   ) : <section className="rounded-lg border border-border p-4 space-y-3" aria-label="Catalog publication status"><h2 className="text-xl font-semibold">{state.title}</h2><p><strong>{state.state.replaceAll('_',' ')}</strong> · {state.visible?'Published and eligible':'Unavailable to new buyers'}</p><p>{state.note}</p>{state.blockers.length?<ul className="list-disc pl-5">{state.blockers.map(b=><li key={b}>{blockerLabels[b]||b}</li>)}</ul>:<p>Current rights, approved assets and reviewed license availability are valid.</p>}<div className="flex flex-wrap gap-4"><Link className="underline" href={(admin?'/admin/rights':'/artist/rights')+'?track='+track}>Review master and publishing rights</Link>{state.media_submission?<Link className="underline" href={(admin?'/admin/media?draft=':'/artist/uploads?draft=')+state.media_submission}>Inspect audio assets</Link>:null}<Link className="underline" href={admin?'/admin/catalog':'/artist/catalog/manage'}>All catalog records</Link></div></section>}
   {readOnlyMetadata ? <ReadOnlyCatalogMetadata metadata={draft} isDraft={state.state === 'draft'} /> :
   <form onSubmit={e=>e.preventDefault()} className="space-y-5" aria-label={admin?'Catalog metadata review':'Artist catalog metadata'}>
    <h2 className="text-xl font-semibold">{admin?'Review submitted metadata and proposed corrections':'Artist submitted metadata'}</h2>
    <p className="text-sm text-muted-foreground">Incomplete drafts can be saved. Credits are public display credits; ownership and licensing authority belong in rights verification. Language uses codes such as en or zxx (no lyrics). ISRC and ISWC are optional; internal recording and composition identifiers are required.</p>
    <div className="grid gap-4 md:grid-cols-2">{field('title','Track title')}{field('artist','Public artist credit')}{field('recordingIdentifier','Recording identifier')}{field('workIdentifier','Composition identifier')}{field('isrc','ISRC (optional)')}{field('iswc','ISWC (optional)')}{field('genre','Genre')}{field('subgenre','Subgenre')}{field('bpm','BPM (optional)','number')}{field('musicalKey','Musical key (optional)')}{field('durationSeconds','Measured duration in seconds','number',true)}{field('language','Language code')}{select('explicit','Explicit content',['unknown','clean','explicit','censored'])}{select('vocal','Vocal classification',['unknown','instrumental','vocal','mixed'])}{field('releaseTitle','Release title (optional)')}{select('releaseStatus','Release status',['unreleased','released'])}{field('releaseDate','Release date','date')}{field('releaseYear','Release year (optional)','number')}
    {(['moods','keywords'] as const).map(k=><label key={k} className="block text-sm font-medium">{k==='moods'?'Moods':'Keywords'} (comma separated)<input className={control} name={k} value={tagInputs[k]} disabled={locked} onChange={e=>{setTagInputs(v=>({...v,[k]:e.target.value}));set(k,e.target.value.split(',').map(v=>v.trim()).filter(Boolean));}}/></label>)}</div>
    <label className="block text-sm font-medium">Description<textarea aria-label="Description" className={control} name="description" rows={3} value={draft.description} disabled={locked} onChange={e=>set('description',e.target.value)}/></label>
    <fieldset className="space-y-3"><legend className="font-semibold">Public contributor credits</legend>{draft.credits.map((c,i)=><div key={i} className="grid min-w-0 gap-3 md:grid-cols-[1fr,1fr,auto]"><label>Credit name {i+1}<input className={control} value={c.name} disabled={locked} onChange={e=>set('credits',draft.credits.map((v,j)=>j===i?{...v,name:e.target.value}:v))}/></label><label>Credit role {i+1}<select className={control} aria-label={`Credit role ${i+1}`} disabled={locked} value={c.role} onChange={e=>set('credits',draft.credits.map((v,j)=>j===i?{...v,role:e.target.value}:v))}>{creditRoles.map(r=><option key={r} value={r}>{r.replaceAll('_',' ')}</option>)}</select></label><button disabled={locked} onClick={()=>set('credits',draft.credits.filter((_,j)=>j!==i))}>Remove credit {i+1}</button></div>)}<button className="rounded-md border p-2" disabled={locked||draft.credits.length>=50} onClick={()=>set('credits',[...draft.credits,{name:'',role:'primary_artist'}])}>Add public credit</button></fieldset>
    {catalogMissing(draft).length?<ul aria-label="Metadata required before submission" className="list-disc pl-5 text-sm">{catalogMissing(draft).map(m=><li key={m}>{m}</li>)}</ul>:null}
    {!admin && <div className="flex flex-wrap gap-3">{!admin?<><button className="rounded-md border p-3" disabled={locked} onClick={()=>mutate('save',{metadata:draft})}>Save catalog draft</button><button className="rounded-md bg-primary text-primary-foreground p-3" disabled={locked||state.state==='not_started'} onClick={()=>mutate('submit')}>Submit catalog for review</button></>:null}<button className="rounded-md border p-3" disabled={busy||!!pending} onClick={async()=>{await load(true);setError('');setMessage('Saved metadata reloaded.');}}>Reload saved metadata (discard unsaved edits)</button></div>}
   </form>}
   {admin && !reloadFailed && <Button type="button" variant="outline" size="lg" disabled={busy||!!pending} onClick={reloadDetail}>Reload saved metadata (discard unsaved edits)</Button>}
   {admin && state.state !== 'not_started' && (
    <CatalogDecisionPanel state={state} draft={draft} note={note} onNoteChange={setNote}
     disabled={busy || !!pending || reloadFailed} onDecision={mutate} />
   )}
   {state.approved_metadata?<section className="space-y-2"><h2 className="text-xl font-semibold">Approved catalog metadata</h2><Metadata p={state.approved_metadata}/></section>:null}
   <section className="space-y-3"><h2 className="text-xl font-semibold">Available asset versions</h2><p className="text-sm text-muted-foreground">This inventory does not grant download entitlements. Each purchased license has its own reviewed deliverable manifest.</p>{state.assets.length?state.assets.map(a=><div className="rounded-md border p-3 break-all" key={a.id}><p>{a.label||a.kind} · {a.state} · {a.current?'Current approved asset':'Available version'}</p><p className="text-xs">Asset {a.id} · version {a.version||'pending'} · SHA-256 {a.sha256||'pending'}</p></div>):<p>No approved assets are available.</p>}</section>
   <section className="space-y-3"><h2 className="text-xl font-semibold">Submitted metadata history</h2>{admin && !versions.length && <p className="text-sm text-muted-foreground">No submitted versions yet.</p>}{versions.map(v=><details key={v.id} className="rounded-md border p-3"><summary>{new Date(v.submitted_at).toLocaleString()} · {v.id}</summary><p className="break-all text-xs">Submitted by {v.submitted_by} · SHA-256 {v.metadata_hash}</p><Metadata p={v.metadata}/></details>)}{versions.length>=20?<button disabled={busy} onClick={()=>older('versions')}>Load earlier metadata versions</button>:null}</section>
   <section className="space-y-3"><h2 className="text-xl font-semibold">Administrative corrections and decisions</h2>{admin && !decisions.length && <p className="text-sm text-muted-foreground">No review decisions yet.</p>}{decisions.map(d=><details key={d.id} className="rounded-md border p-3"><summary>{d.state.replaceAll('_',' ')} · {new Date(d.created_at).toLocaleString()}</summary><p>{d.note}</p><p className="break-all text-xs">Reviewer {d.reviewer_id} · submitted version {d.version_id}</p><Metadata p={d.metadata}/></details>)}{decisions.length>=20?<button disabled={busy} onClick={()=>older('decisions')}>Load earlier decisions</button>:null}</section>
   <section className="space-y-3"><h2 className="text-xl font-semibold">Catalog audit trail</h2>{events.map(e=><p key={e.id} className="rounded-md border p-3 break-words">{e.action.replaceAll('_',' ')} · {new Date(e.recorded_at).toLocaleString()} · {e.note}<span className="block text-xs break-all">Actor {e.actor_id}</span></p>)}{events.length>=50?<button disabled={busy} onClick={()=>older('events')}>Load earlier audit events</button>:null}</section>
  </>:null}
 </div>;
}
function Metadata({p}:{p:CatalogMetadata}){return <dl className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(p).map(([k,v])=><div key={k} className="min-w-0"><dt className="text-sm text-muted-foreground">{k}</dt><dd className="break-words text-sm">{Array.isArray(v)?v.map(x=>typeof x==='object'?x.name+' ('+x.role.replaceAll('_',' ')+')':x).join(', '):String(v??'Not supplied')}</dd></div>)}</dl>;}


function isAuthorizationDenial(failure: unknown) {
 const status = (failure as { status?: number } | undefined)?.status;
 return status === 401 || status === 403;
}

function ReadOnlyCatalogMetadata({ metadata, isDraft }: { metadata: CatalogMetadata; isDraft: boolean }) {
 const fields = [
  ['Catalog title', metadata.title],
  ['Public artist credit', metadata.artist],
  ['Genre', [metadata.genre, metadata.subgenre].filter(Boolean).join(' · ')],
  ['Tempo', metadata.bpm ? `${metadata.bpm} BPM` : ''],
  ['Measured duration', metadata.durationSeconds ? formatDuration(metadata.durationSeconds) : ''],
  ['Vocal classification', formatEnumLabel(metadata.vocal)],
 ];
 return (
  <Card>
   <CardHeader><CardTitle>{isDraft ? 'Draft metadata' : 'Saved metadata'}</CardTitle></CardHeader>
   <CardContent className="space-y-4">
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
     {fields.map(([label, value]) => <div key={label} className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value || 'Not supplied'}</dd>
     </div>)}
    </dl>
    <details className="rounded-lg border border-border px-4 pb-0 open:pb-4">
     <summary className="min-h-11 cursor-pointer rounded-sm py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Full metadata and credits</summary>
     <Metadata p={metadata} />
    </details>
   </CardContent>
  </Card>
 );
}

function CatalogDecisionPanel({ state, draft, note, onNoteChange, disabled, onDecision }: {
 state: CatalogState;
 draft: CatalogMetadata;
 note: string;
 onNoteChange: (note: string) => void;
 disabled: boolean;
 onDecision: (action: string, input: Record<string, unknown>) => Promise<void>;
}) {
 const requiresNote = note.trim().length < 5;
 const reviewActions = [
  ['approved', 'Approve catalog metadata'],
  ['changes_requested', 'Request catalog corrections'],
  ['rejected', 'Reject catalog submission'],
 ] as const;
 const publicationActions = [
  { state: 'published', label: 'Publish catalog listing', available: ['approved', 'unpublished'].includes(state.state) },
  { state: 'unpublished', label: 'Unpublish listing', available: state.state === 'published' },
  { state: 'suspended', label: 'Suspend listing', available: ['published', 'approved', 'unpublished'].includes(state.state) },
  { state: 'archived', label: 'Archive listing', available: state.state !== 'archived' },
 ];
 const canReopen = ['suspended', 'archived'].includes(state.state);
 return (
  <Card aria-label="SEC catalog decisions">
   <CardHeader>
    <CardTitle>Review and publication decisions</CardTitle>
    <CardDescription>Approval and publication are separate. Publication requires current rights, approved assets, and reviewed license terms, deliverables, and source evidence.</CardDescription>
   </CardHeader>
   <CardContent className="space-y-4">
    <label htmlFor="catalog-review-note" className="block text-sm font-medium">
     Decision explanation
     <textarea id="catalog-review-note" aria-describedby="catalog-decision-hint"
      className="mt-1 block w-full rounded-md border border-border bg-background p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      value={note} maxLength={2000} onChange={event => onNoteChange(event.target.value)} />
    </label>
    <p id="catalog-decision-hint" className="text-sm text-muted-foreground">Enter at least five characters to record a decision.</p>
    {state.state === 'submitted' && <div className="flex flex-wrap gap-2">
     {reviewActions.map(([value, label]) => <Button key={value} type="button" size="lg"
      variant={value === 'approved' ? 'default' : 'outline'} disabled={disabled || requiresNote}
      onClick={() => onDecision('review', { version: state.submitted_version, state: value, metadata: draft, note })}>
      {label}
     </Button>)}
    </div>}
    <div className="flex flex-wrap gap-2">
     {publicationActions.filter(action => action.available).map(action => <Button key={action.state} type="button"
      size="lg" variant="outline" disabled={disabled || requiresNote || (action.state === 'published' && state.blockers.length > 0)}
      onClick={() => onDecision('transition', { state: action.state, note })}>{action.label}</Button>)}
     {canReopen && <Button type="button" size="lg" variant="outline" disabled={disabled || requiresNote}
      onClick={() => onDecision('reopen', { note })}>Reopen for artist corrections</Button>}
    </div>
   </CardContent>
  </Card>
 );
}
