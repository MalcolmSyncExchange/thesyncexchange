import { env } from '@/lib/env';
import { authorizeMasterPlayback } from '@/services/media/master-playback';
import { UploadError } from '@/services/media/uploads';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{submission:string;asset:string}>}){
 const headers={'cache-control':'private, no-store, max-age=0','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
 try{
  if(request.headers.get('origin')!==new URL(env.appUrl).origin)throw new UploadError(403,'ORIGIN_DENIED');
  if(request.headers.get('content-length')&&request.headers.get('content-length')!=='0')throw new UploadError(400,'EMPTY_REQUEST_REQUIRED');
  // Node adapters may expose an empty stream for a bodyless POST. Accept zero
  // bytes, not arbitrary JSON; reject the first nonempty chunk without buffering.
  if(request.body){const reader=request.body.getReader();let timer:ReturnType<typeof setTimeout>|undefined;const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new UploadError(408,'REQUEST_TIMEOUT')),5000);});try{for(;;){const next=await Promise.race([reader.read(),deadline]);if(next.done)break;if(next.value.byteLength)throw new UploadError(400,'EMPTY_REQUEST_REQUIRED');}}finally{clearTimeout(timer);await reader.cancel().catch(()=>{});reader.releaseLock();}}
  const {submission,asset}=await params;
  return Response.json(await authorizeMasterPlayback(submission,asset,AbortSignal.any([request.signal,AbortSignal.timeout(15000)])),{headers});
 }catch(e){return Response.json({error:e instanceof UploadError?e.code:'MEDIA_UNAVAILABLE'},{status:e instanceof UploadError?e.status:503,headers});}
}
