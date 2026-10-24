import { mediaPlayback } from "@/services/media/playback";
import { UploadError } from "@/services/media/uploads";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{submission:string;asset:string}>}){try{const {submission,asset}=await params;return await mediaPlayback(submission,asset,request.signal);}catch(e){return new Response("Media unavailable",{status:e instanceof UploadError?e.status:503,headers:{"cache-control":"private, no-store","x-content-type-options":"nosniff"}});}}
