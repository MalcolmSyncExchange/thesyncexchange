import 'server-only';
import { createHash } from 'node:crypto';
import { verifyTransfer } from '@/services/media-broker/do-transfer-proof.mjs';
import { createAdminSupabaseClient } from '@/services/supabase/admin';
import { readPrivateArtifact } from '@/services/delivery/server';
import { UploadError,mediaRpc,type MediaClient } from './uploads';
type Proof={run_id:string;boot_id:string;job_id:string;lease_epoch:number;lease_token:string;nonce:string;operation:'input'|'output'|'verify';bytes:number|null;sha256:string|null};
type Locator={bucket:string;path:string;bytes:number;sha256:string|null;version?:string;object_id?:string;job_type?:string;output?:{object_id:string;version:string;bytes:number}|null};
function locator(d:Locator,p:Proof){if(!Number.isSafeInteger(Number(d.bytes))||Number(d.bytes)<1||Number(d.bytes)>(p.operation==='input'?150000000:4000000)||!(p.operation==='input'?['submission-source','submission-artwork']:['submission-derived']).includes(d.bucket)||typeof d.path!=='string'||d.path.length>512||/(^\/|(^|\/)\.\.(\/|$)|[?%#\\]|:\/\/)/.test(d.path))throw new UploadError(403,'DO_TRANSFER_DENIED');return d;}
export async function doTransfer(request:Request){
 const header=request.headers.get('x-tse-proof'),signature=request.headers.get('x-tse-signature'),key=process.env.MEDIA_DO_HOST_PUBLIC_KEY;
 if(!key||!header||header.length>4096||!signature)throw new UploadError(403,'DO_TRANSFER_DENIED');
 let p:Proof;try{p=verifyTransfer(JSON.parse(header),signature,key) as Proof;}catch{throw new UploadError(403,'DO_TRANSFER_DENIED');}
 // Ed25519 identity proof is mandatory before creating a privileged client.
 const admin=createAdminSupabaseClient();if(!admin)throw new UploadError(503,'DO_TRANSFER_UNAVAILABLE');
 const args={p_run:p.run_id,p_boot:p.boot_id,p_job:p.job_id,p_epoch:p.lease_epoch,p_token:p.lease_token,p_nonce:p.nonce,p_kind:p.operation,p_bytes:p.bytes,p_sha:p.sha256};
 const access=async(check:boolean)=>locator(await mediaRpc<Locator>(admin as unknown as MediaClient,'media_do_transfer',{...args,p_check:check}),p);
 const d=await access(false);
 if(p.operation==='input'){
  if(request.headers.get('content-length')&&request.headers.get('content-length')!=='0')throw new UploadError(400,'DO_TRANSFER_DENIED');
  const result=await admin.storage.from(d.bucket).createSignedUrl(d.path,60);if(result.error||!result.data?.signedUrl)throw new UploadError(503,'DO_TRANSFER_UNAVAILABLE');
  const current=await access(true);if(JSON.stringify(current)!==JSON.stringify(d))throw new UploadError(409,'DO_TRANSFER_CHANGED');
  return {url:result.data.signedUrl,bytes:Number(d.bytes),sha256:d.sha256};
 }
 if(p.operation==='verify'){const actual=await readPrivateArtifact({bucket:d.bucket,path:d.path,byteSize:Number(p.bytes),signal:request.signal});if(createHash('sha256').update(actual).digest('hex')!==p.sha256)throw new UploadError(409,'DO_TRANSFER_INTEGRITY');const current=await access(true);if(!current.output||Number(current.output.bytes)!==p.bytes)throw new UploadError(409,'DO_TRANSFER_CHANGED');return {...current.output,bytes:p.bytes,sha256:p.sha256};}
 if(request.headers.get('content-type')!=='application/octet-stream'||!request.body)throw new UploadError(415,'DO_TRANSFER_DENIED');
 const reader=request.body.getReader();let timer:ReturnType<typeof setTimeout>|undefined;const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new UploadError(408,'DO_TRANSFER_TIMEOUT')),20000);});let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){if(request.signal.aborted)throw new UploadError(408,'DO_TRANSFER_CANCELLED');const next=await Promise.race([reader.read(),deadline]);if(next.done)break;size+=next.value.length;if(size>Number(p.bytes))throw new UploadError(413,'DO_TRANSFER_DENIED');chunks.push(next.value);}}finally{clearTimeout(timer);await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=Buffer.concat(chunks);if(size!==p.bytes||createHash('sha256').update(bytes).digest('hex')!==p.sha256)throw new UploadError(400,'DO_TRANSFER_INTEGRITY');
 await access(true);
 if(!d.output)await admin.storage.from(d.bucket).upload(d.path,bytes,{contentType:d.job_type==='preview_generation'?'audio/mp4':'application/octet-stream',upsert:false,cacheControl:'0'});
 // Lost provider responses are reconciled against exact private bytes and version.
 const actual=await readPrivateArtifact({bucket:d.bucket,path:d.path,byteSize:size,signal:request.signal});if(createHash('sha256').update(actual).digest('hex')!==p.sha256)throw new UploadError(409,'DO_TRANSFER_INTEGRITY');
 const current=await access(true);if(!current.output||Number(current.output.bytes)!==size)throw new UploadError(409,'DO_TRANSFER_CHANGED');
 return {...current.output,bytes:size,sha256:p.sha256};
}
