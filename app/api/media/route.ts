import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { env } from "@/lib/env";
import { performMediaRequest, UploadError } from "@/services/media/uploads";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 const headers={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer"};
 try{if(request.headers.get("origin")!==new URL(env.appUrl).origin)throw new UploadError(403,"ORIGIN_DENIED");if(!request.headers.get("content-type")?.startsWith("application/json"))throw new UploadError(415,"JSON_REQUIRED");
 const reader=request.body?.getReader();if(!reader)throw new UploadError(400,"INVALID_REQUEST");let size=0;let timeout:ReturnType<typeof setTimeout>|undefined;const deadline=new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new UploadError(408,"REQUEST_TIMEOUT")),5000);});const chunks:Uint8Array[]=[];try{for(;;){const read=await Promise.race([reader.read(),deadline]);if(read.done)break;size+=read.value.length;if(size>16000)throw new UploadError(413,"REQUEST_TOO_LARGE");chunks.push(read.value);}}finally{clearTimeout(timeout);await reader.cancel().catch(()=>{});reader.releaseLock();}
 const result=await performMediaRequest(JSON.parse(Buffer.concat(chunks).toString("utf8")));return NextResponse.json(result,{headers});
 }catch(e){const status=e instanceof UploadError?e.status:e instanceof ZodError||e instanceof SyntaxError?400:503;return NextResponse.json({error:e instanceof UploadError?e.code:status===400?"CHECK_REQUIRED_FIELDS":"MEDIA_UNAVAILABLE"},{status,headers});}
}
