import {randomUUID} from 'node:crypto';
import {requireValue,uuid,publicJob,boundedJson,STAGING} from './common.mjs';
export const INPUT_GRANT_SECONDS=30, INPUT_MAX_BYTES=150_000_000;
const same=(a,b)=>['object_id','version','bucket','path','bytes','sha256'].every(k=>String(a[k]??'')===String(b[k]??''));
function canonicalInput(job){
 const i=job.source||job,asset=job.source?.asset_id||job.asset_id;
 requireValue(uuid(job.submission_id)&&uuid(asset)&&uuid(i.object_id)&&typeof i.version==='string'&&i.version.length<=128,'INPUT_MISMATCH');
 requireValue(['submission-source','submission-artwork'].includes(i.bucket)&&typeof i.path==='string','INPUT_MISMATCH');
 const parts=i.path.split('/');
 // The lease resolver supplies the canonical asset/path; a caller supplies only
 // its fenced lease. Legacy arbitrary track paths stay on the old adapter.
 requireValue(parts.length===4&&uuid(parts[0])&&parts[1]===job.submission_id&&parts[2]===asset&&parts[3]==='original','INPUT_MISMATCH');
 requireValue(Number.isSafeInteger(Number(i.bytes))&&Number(i.bytes)>0&&Number(i.bytes)<=INPUT_MAX_BYTES&&(!i.sha256||/^[a-f0-9]{64}$/.test(i.sha256)),'INPUT_MISMATCH');
 return {...i,bytes:Number(i.bytes),owner_id:parts[0],asset_id:asset,submission_id:job.submission_id};
}
export class InputGrants{
 constructor(authority,signer,{now=Date.now}={}){this.authority=authority;this.signer=signer;this.now=now;}
 async issue(l){return this.authority.withLease(l,async(job,recheck)=>{
  const input=canonicalInput(job),at=this.now(),id=randomUUID();
  const url=await this.signer.sign(input,INPUT_GRANT_SECONDS,id);
  const current=await recheck();requireValue(same(input,canonicalInput(current))&&this.now()<at+INPUT_GRANT_SECONDS*1000,'INPUT_MISMATCH');
  return {job:publicJob(job),grant:{version:1,id,url,expires_at:at+INPUT_GRANT_SECONDS*1000,identity:{asset_id:input.asset_id,submission_id:input.submission_id,owner_id:input.owner_id,object_id:input.object_id,version:input.version,bytes:input.bytes,sha256:input.sha256||null}}};
 });}
}
// Broker-only credential. It never enters the grant, parser environment or logs.
// Remains staging-bound until an exact production identity manifest is approved.
export class PrivateInputSigner{
 #credential;
 constructor(credential,{fetcher=fetch}={}){requireValue(typeof credential==='string'&&credential.length>20);this.#credential=credential;this.fetcher=fetcher;}
 async sign(input,seconds,id){
  requireValue(seconds===INPUT_GRANT_SECONDS&&uuid(id),'INPUT_MISMATCH');
  const object=input.bucket+'/'+input.path.split('/').map(encodeURIComponent).join('/');
  const origin=`https://${STAGING}.supabase.co`;
  const response=await this.fetcher(origin+'/storage/v1/object/sign/'+object,{method:'POST',headers:{Authorization:'Bearer '+this.#credential,apikey:this.#credential,'content-type':'application/json'},body:JSON.stringify({expiresIn:seconds}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok){await response.body?.cancel();requireValue(false,'TEMPORARY_SYSTEM_ERROR');}
  const data=await boundedJson(response,4096);requireValue(typeof data.signedURL==='string','INPUT_MISMATCH');
  const url=new URL(data.signedURL.startsWith('/object/')?'/storage/v1'+data.signedURL:data.signedURL,origin);
  requireValue(url.origin===origin&&url.pathname==='/storage/v1/object/sign/'+object&&!url.username&&!url.password&&!url.hash&&!!url.searchParams.get('token'),'INPUT_MISMATCH');
  url.searchParams.set('cacheNonce',id);return url.href;
 }
}
