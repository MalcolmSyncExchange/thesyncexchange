import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { mediaActor, mediaRpc, UploadError } from './uploads';
import { consumeRateLimit } from '@/services/security/rate-limit';
import { createAdminSupabaseClient } from '@/services/supabase/admin';
import { inspectRightsDocument } from '@/services/rights/document-content';
import { readPrivateArtifact } from '@/services/delivery/server';
type Locator={id:string;submission_id:string;bucket:string;path:string;bytes:number;state:string;sha256:string|null;version:string|null};
function checked(d:Locator,id:string,owner?:string){
 if(d.id!==id||!z.string().uuid().safeParse(d.submission_id).success||d.bucket!=='rights-evidence'||!Number.isSafeInteger(d.bytes)||d.bytes<16||d.bytes>3_000_000||!/^([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/original$/.test(d.path)||d.path.split('/')[1]!==d.submission_id||d.path.split('/')[2]!==id||owner&&d.path.split('/')[0]!==owner||!['reserved','received'].includes(d.state))throw new UploadError(403,'DOCUMENT_UNAVAILABLE');
 return d;
}
async function access(client:Parameters<typeof mediaRpc>[0],id:string,write:boolean,admin=false,owner?:string){return checked(await mediaRpc<Locator>(client,'media_workspace_document_access',{p_document:id,p_write:write,p_admin:admin}),id,owner);}
const same=(a:Locator,b:Locator)=>['id','submission_id','bucket','path','bytes','state','sha256','version'].every(k=>a[k as keyof Locator]===b[k as keyof Locator]);
async function boundedBody(request:Request,limit:number){const reader=request.body?.getReader();if(!reader)throw new UploadError(400,'DOCUMENT_REQUIRED');let timer:ReturnType<typeof setTimeout>|undefined;const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new UploadError(408,'UPLOAD_TIMEOUT')),15000);});const chunks:Uint8Array[]=[];let size=0;try{for(;;){if(request.signal.aborted)throw new UploadError(408,'UPLOAD_CANCELLED');const r=await Promise.race([reader.read(),deadline]);if(r.done)break;size+=r.value.length;if(size>limit)throw new UploadError(413,'DOCUMENT_TOO_LARGE');chunks.push(r.value);}if(size!==limit)throw new UploadError(400,'DOCUMENT_SIZE_MISMATCH');return Buffer.concat(chunks);}finally{clearTimeout(timer);await reader.cancel().catch(()=>{});reader.releaseLock();}}
export async function uploadWorkspaceDocument(id:string,request:Request){
 z.string().uuid().parse(id);const {client,user}=await mediaActor();if((await consumeRateLimit('upload',user.id)).status!=='allowed')throw new UploadError(429,'UPLOAD_LIMIT');
 const d=await access(client,id,true,false,user.id);const bytes=await boundedBody(request,d.bytes);let hash:string;try{hash=await inspectRightsDocument(bytes,'application/pdf');}catch{throw new UploadError(400,'DOCUMENT_CONTENT_DENIED');}
 const latest=await access(client,id,true,false,user.id);if(!same(d,latest))throw new UploadError(409,'DOCUMENT_CHANGED');
 // Never create the privileged client before canonical ownership and content validation.
 const admin=createAdminSupabaseClient();if(!admin)throw new UploadError(503,'DOCUMENT_UNAVAILABLE');
 if(d.state==='reserved')await admin.storage.from(d.bucket).upload(d.path,bytes,{contentType:'application/pdf',upsert:false,cacheControl:'0'});
 const actual=await readPrivateArtifact({bucket:d.bucket,path:d.path,byteSize:d.bytes,signal:request.signal});if(createHash('sha256').update(actual).digest('hex')!==hash||d.state==='received'&&d.sha256!==hash)throw new UploadError(409,'DOCUMENT_INTEGRITY_FAILED');
 await access(client,id,true,false,user.id);
 return mediaRpc(admin as unknown as Parameters<typeof mediaRpc>[0],'media_workspace_document_received',{p_actor:user.id,p_document:id,p_hash:hash});
}
export async function downloadWorkspaceDocument(id:string,admin=false,signal?:AbortSignal){
 z.string().uuid().parse(id);const {client,user}=await mediaActor(admin);const d=await access(client,id,false,admin,admin?undefined:user.id);
 if(d.state!=='received'||!d.version||!d.sha256||!/^[a-f0-9]{64}$/.test(d.sha256))throw new UploadError(409,'DOCUMENT_NOT_RECEIVED');
 await mediaRpc(client,'media_workspace_document_audit',{p_document:id,p_admin:admin,p_outcome:'authorized'});
 try{const bytes=await readPrivateArtifact({bucket:d.bucket,path:d.path,byteSize:d.bytes,signal});if(createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw new UploadError(503,'DOCUMENT_INTEGRITY_FAILED');
  if(!same(d,await access(client,id,false,admin,admin?undefined:user.id)))throw new UploadError(403,'DOCUMENT_CHANGED');await mediaRpc(client,'media_workspace_document_audit',{p_document:id,p_admin:admin,p_outcome:'delivered'});
  return new Response(bytes,{headers:{'content-type':'application/octet-stream','content-disposition':`attachment; filename="rights-evidence-${id}.pdf"`,'content-length':String(bytes.length),'content-security-policy':"sandbox; default-src 'none'",'cache-control':'private, no-store, max-age=0','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
 }catch(e){await mediaRpc(client,'media_workspace_document_audit',{p_document:id,p_admin:admin,p_outcome:'failed'}).catch(()=>{});throw e;}
}
