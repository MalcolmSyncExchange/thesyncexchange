import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { mediaActor,mediaRpc,UploadError,type MediaClient } from "./uploads";
import { readPrivateArtifact } from "@/services/delivery/server";
type Locator={asset_id:string;bucket:string;path:string;sha256:string;bytes:number;kind:string;version:string};
export async function mediaPlayback(submission:string,asset:string,signal:AbortSignal){
 z.string().uuid().parse(submission);z.string().uuid().parse(asset);
 // Determine role from the canonical session; privilege is created only after auth.
 const {createServerSupabaseClient}=await import("@/services/supabase/server");const {selectUserProfileCompat}=await import("@/services/auth/user-profiles");const initial=await createServerSupabaseClient();const {data:{user}}=await initial.auth.getUser();if(!user)throw new UploadError(401,"AUTH_REQUIRED");const role=await selectUserProfileCompat(initial,user.id);const {client}=await mediaActor(role.data?.role==="admin");
 const args={p_submission:submission,p_asset:asset};await mediaRpc(client,"media_upload_can_play",args);const admin=createAdminSupabaseClient();if(!admin)throw new UploadError(503,"MEDIA_UNAVAILABLE");const privileged=admin as unknown as MediaClient;
 const locator=await mediaRpc<Locator>(privileged,"media_upload_playback_authorized",{...args,p_actor:user.id});if(!Number.isSafeInteger(locator.bytes)||locator.bytes<1||locator.bytes>(locator.kind==="waveform"?2_000_000:4_000_000)||locator.bucket!=="submission-derived")throw new UploadError(403,"MEDIA_UNAVAILABLE");
 const bytes=await readPrivateArtifact({bucket:locator.bucket,path:locator.path,byteSize:locator.bytes,signal});if(createHash("sha256").update(bytes).digest("hex")!==locator.sha256)throw new UploadError(503,"MEDIA_UNAVAILABLE");await mediaRpc(client,"media_upload_can_play",args);const latest=await mediaRpc<Locator>(privileged,"media_upload_playback_authorized",{...args,p_actor:user.id});if(JSON.stringify(latest)!==JSON.stringify(locator))throw new UploadError(403,"MEDIA_UNAVAILABLE");
 return new Response(bytes,{headers:{"content-type":locator.kind==="waveform"?"application/octet-stream":"audio/mp4","content-length":String(bytes.length),"cache-control":"private, no-store, max-age=0","referrer-policy":"no-referrer","x-content-type-options":"nosniff","content-disposition":"inline"}});
}
