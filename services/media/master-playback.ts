import 'server-only';
import { z } from 'zod';
import { env } from '@/lib/env';
import { createServerSupabaseClient } from '@/services/supabase/server';
import { createAdminSupabaseClient } from '@/services/supabase/admin';
import { selectUserProfileCompat } from '@/services/auth/user-profiles';
import { consumeRateLimit } from '@/services/security/rate-limit';
import { mediaActor, mediaRpc, UploadError, type MediaClient } from './uploads';

type MasterLocator={asset_id:string;bucket:string;path:string;sha256:string;bytes:number;version:string;format:string;duration_us:number};
export async function authorizeMasterPlayback(submission:string,asset:string,signal:AbortSignal){
 const bounded=AbortSignal.any([signal,AbortSignal.timeout(15000)]);
 if(bounded.aborted)throw new UploadError(408,'PLAYBACK_CANCELLED');
 let cancel:()=>void=()=>{};
 const cancelled=new Promise<never>((_,reject)=>{cancel=()=>reject(new UploadError(408,'PLAYBACK_CANCELLED'));bounded.addEventListener('abort',cancel,{once:true});});
 try{return await Promise.race([resolveMasterPlayback(submission,asset,bounded),cancelled]);}
 finally{bounded.removeEventListener('abort',cancel);}
}
async function resolveMasterPlayback(submission:string,asset:string,signal:AbortSignal){
 z.string().uuid().parse(submission);z.string().uuid().parse(asset);
 const initial=await createServerSupabaseClient();const {data:{user}}=await initial.auth.getUser();
 if(!user)throw new UploadError(401,'AUTH_REQUIRED');
 const profile=await selectUserProfileCompat(initial,user.id);
 const {client,user:actor}=await mediaActor(profile.data?.role==='admin');
 if(actor.id!==user.id)throw new UploadError(403,'ACCESS_DENIED');
 const args={p_submission:submission,p_asset:asset};
 await mediaRpc(client,'media_master_can_play',args);
 // Reuse existing authenticated media admission limits; no unbounded URL minting.
 if((await consumeRateLimit('upload',actor.id)).status!=='allowed')throw new UploadError(429,'PLAYBACK_LIMIT');
 if(signal.aborted)throw new UploadError(408,'PLAYBACK_CANCELLED');
 const admin=createAdminSupabaseClient();if(!admin)throw new UploadError(503,'MEDIA_UNAVAILABLE');
 const privileged=admin as unknown as MediaClient;
 const locator=await mediaRpc<MasterLocator>(privileged,'media_master_playback_authorized',{...args,p_actor:actor.id});
 if(locator.asset_id!==asset||locator.bucket!=='submission-source'||!Number.isSafeInteger(locator.bytes)||locator.bytes<1||locator.bytes>150_000_000||
   !Number.isSafeInteger(locator.duration_us)||locator.duration_us<1_000_000||locator.duration_us>900_000_000||
   !/^[a-f0-9]{64}$/.test(locator.sha256)||!locator.version||!['wav','aiff','aifc','flac'].includes(locator.format)||
   !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/original$/.test(locator.path)||locator.path.split('/')[1]!==submission||locator.path.split('/')[2]!==asset)throw new UploadError(403,'MEDIA_UNAVAILABLE');
 // Only validated, version-bound immutable originals. Never buffer/decode a
 // 150 MB original in the web function or give its service credential to clients.
 if(signal.aborted)throw new UploadError(408,'PLAYBACK_CANCELLED');
 const signed=await admin.storage.from(locator.bucket).createSignedUrl(locator.path,60);
 if(signed.error||!signed.data?.signedUrl)throw new UploadError(503,'MEDIA_UNAVAILABLE');
 const url=new URL(signed.data.signedUrl),base=new URL(env.supabaseUrl!);
 if(url.origin!==base.origin||url.protocol!=='https:'||url.username||url.password||url.hash||url.pathname!==`/storage/v1/object/sign/${locator.bucket}/${locator.path}`)throw new UploadError(503,'MEDIA_UNAVAILABLE');
 await mediaRpc(client,'media_master_can_play',args);
 const current=await mediaRpc<MasterLocator>(privileged,'media_master_playback_authorized',{...args,p_actor:actor.id});
 if(signal.aborted||JSON.stringify(current)!==JSON.stringify(locator))throw new UploadError(403,'MEDIA_UNAVAILABLE');
 return {url:url.href,expiresAt:Date.now()+55_000,assetId:asset};
}
