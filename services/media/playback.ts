import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { mediaActor,mediaRpc,UploadError,type MediaClient } from "./uploads";
import { readPrivateArtifact } from "@/services/delivery/server";
type Locator={asset_id:string;bucket:string;path:string;sha256:string;bytes:number;kind:string;version:string};
export async function mediaPlayback(submission:string,asset:string,signal:AbortSignal,range:string|null=null){
 z.string().uuid().parse(submission);z.string().uuid().parse(asset);
 // Determine role from the canonical session; privilege is created only after auth.
 const {createServerSupabaseClient}=await import("@/services/supabase/server");const {selectUserProfileCompat}=await import("@/services/auth/user-profiles");const initial=await createServerSupabaseClient();const {data:{user}}=await initial.auth.getUser();if(!user)throw new UploadError(401,"AUTH_REQUIRED");const role=await selectUserProfileCompat(initial,user.id);const {client}=await mediaActor(role.data?.role==="admin");
 const args={p_submission:submission,p_asset:asset};await mediaRpc(client,"media_upload_can_play",args);const admin=createAdminSupabaseClient();if(!admin)throw new UploadError(503,"MEDIA_UNAVAILABLE");const privileged=admin as unknown as MediaClient;
 const locator=await mediaRpc<Locator>(privileged,"media_upload_playback_authorized",{...args,p_actor:user.id});if(!Number.isSafeInteger(locator.bytes)||locator.bytes<1||locator.bytes>(locator.kind==="waveform"?2_000_000:4_000_000)||locator.bucket!=="submission-derived")throw new UploadError(403,"MEDIA_UNAVAILABLE");
 const bytes=await readPrivateArtifact({bucket:locator.bucket,path:locator.path,byteSize:locator.bytes,signal});if(createHash("sha256").update(bytes).digest("hex")!==locator.sha256)throw new UploadError(503,"MEDIA_UNAVAILABLE");await mediaRpc(client,"media_upload_can_play",args);const latest=await mediaRpc<Locator>(privileged,"media_upload_playback_authorized",{...args,p_actor:user.id});if(JSON.stringify(latest)!==JSON.stringify(locator))throw new UploadError(403,"MEDIA_UNAVAILABLE");
 return playbackResponse(bytes,locator.kind==="waveform"?"application/octet-stream":"audio/mp4",range);
}

// Range selection happens only after complete hash verification and the second
// authorization/immutable-locator check above. Never return partial unverified data.
export function playbackResponse(bytes:Uint8Array,mime:string,range:string|null){
 const headers={"content-type":mime,"cache-control":"private, no-store, max-age=0","referrer-policy":"no-referrer","x-content-type-options":"nosniff","content-disposition":"inline","accept-ranges":"bytes","cross-origin-resource-policy":"same-origin"};
 if(!range)return new Response(bytes as BodyInit,{headers:{...headers,"content-length":String(bytes.length)}});
 const reject=()=>new Response(null,{status:416,headers:{...headers,"content-range":`bytes */${bytes.length}`}});
 const match=range.length<=200?/^bytes=(\d*)-(\d*)$/.exec(range):null;
 if(!match||!match[1]&&!match[2])return reject();
 let start=0,end=bytes.length-1;
 if(match[1]){start=Number(match[1]);if(match[2])end=Number(match[2]);}
 else {const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return reject();start=Math.max(0,bytes.length-suffix);}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=bytes.length)return reject();
 end=Math.min(end,bytes.length-1);
 return new Response(bytes.slice(start,end+1) as BodyInit,{status:206,headers:{...headers,"content-range":`bytes ${start}-${end}/${bytes.length}`,"content-length":String(end-start+1)}});
}
