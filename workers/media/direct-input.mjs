import {open,rm} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {MediaError} from './errors.mjs';
import {BoundedStream,uuid,STAGING} from '../../services/media-broker/common.mjs';
import {hashFile} from './media.mjs';
import {RemoteBroker} from './remote-broker.mjs';
const fail=(code='worker_lease_expired')=>{throw new MediaError(code);};
export function validateGrant(grant,job,now=Date.now()){
 const i=job.source||job,g=grant?.identity;
 if(grant?.version!==1||!uuid(grant.id)||!Number.isSafeInteger(grant.expires_at)||grant.expires_at<=now||grant.expires_at>now+30000||!g||!uuid(g.owner_id)||g.submission_id!==job.submission_id||g.asset_id!==(job.source?.asset_id||job.asset_id)||g.object_id!==i.object_id||g.version!==i.version||g.bytes!==Number(i.bytes)||g.bytes<1||g.bytes>150_000_000||(g.sha256||null)!==(i.sha256||null))fail();
 let u;try{u=new URL(grant.url);}catch{fail();}
 const bucket=job.job_type==='artwork_validation'?'submission-artwork':'submission-source';
 if(u.origin!==`https://${STAGING}.supabase.co`||u.username||u.password||u.hash||u.pathname!==`/storage/v1/object/sign/${bucket}/${g.owner_id}/${g.submission_id}/${g.asset_id}/original`||!u.searchParams.get('token')||u.searchParams.get('cacheNonce')!==grant.id||[...u.searchParams.keys()].some(k=>!['token','cacheNonce'].includes(k)))fail();
 return u.href;
}
export async function downloadInput(grant,job,target,{fetcher=fetch,signal,now=Date.now}={}){
 const url=validateGrant(grant,job,now());
 const combined=AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,grant.expires_at-now()))].filter(Boolean));
 let file,created=false;
 try{
  if(combined.aborted)fail();
  const r=await fetcher(url,{headers:{'accept-encoding':'identity','cache-control':'no-store'},redirect:'error',cache:'no-store',signal:combined});
  if(!r.ok||!r.body){await r.body?.cancel();fail(r.status>=500?'temporary_system_error':'worker_lease_expired');}
  const size=r.headers.get('content-length'),encoding=r.headers.get('content-encoding');
  if((size!==null&&Number(size)!==grant.identity.bytes)||r.headers.has('content-range')||(encoding&&encoding!=='identity')){await r.body.cancel();fail('checksum_mismatch');}
  file=await open(target,'wx',0o600);created=true;
  const check=new BoundedStream(150_000_000,grant.identity.bytes,grant.identity.sha256);
  await pipeline(Readable.fromWeb(r.body),check,file.createWriteStream(),{signal:combined});
  await file.close();file=null;
  const facts=await hashFile(target,150_000_000,combined);
  if(facts.actual_bytes!==grant.identity.bytes||(grant.identity.sha256&&facts.sha256!==grant.identity.sha256)||now()>=grant.expires_at)fail('checksum_mismatch');
  return facts;
 }catch(e){await file?.close();if(created)await rm(target,{force:true});throw e instanceof MediaError?e:new MediaError(e?.name==='AbortError'?'worker_lease_expired':e?.code==='INPUT_MISMATCH'?'checksum_mismatch':'temporary_system_error');}
}
export class DirectInputBroker extends RemoteBroker{
 constructor(config,options={}){super(config,options);this.inputFetch=options.inputFetch||fetch;}
 async read(l,target,signal){
  const {job,grant}=await this.call('/input-grant',this.context(l),{signal});
  let copied=false;
  try{
   await downloadInput(grant,job,target,{fetcher:this.inputFetch,signal:AbortSignal.any([signal,this.signal].filter(Boolean))});copied=true;
   const current=await this.call('/resolve',this.context(l),{signal}),a=job.source||job,b=current.source||current;
   if(current.asset_id!==job.asset_id||current.submission_id!==job.submission_id||current.profile!==job.profile||['object_id','version','bytes','sha256'].some(k=>String(a[k]??'')!==String(b[k]??'')))fail();
   return job;
  }catch(e){if(copied)await rm(target,{force:true});throw e;}
 }
}
