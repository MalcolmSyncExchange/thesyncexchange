import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { env } from "@/lib/env";
import { performLicensingRequest, LicensingError } from "@/services/licensing/records";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 const headers={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer"};
 try{if(request.headers.get("origin")!==new URL(env.appUrl).origin)throw new LicensingError(403,"ORIGIN_DENIED");if(!request.headers.get("content-type")?.startsWith("application/json"))throw new LicensingError(415,"JSON_REQUIRED");
 const reader=request.body?.getReader();if(!reader)throw new LicensingError(400,"INVALID_REQUEST");let size=0;let timeout:ReturnType<typeof setTimeout>|undefined;const deadline=new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new LicensingError(408,"REQUEST_TIMEOUT")),5000);});const chunks:Uint8Array[]=[];try{for(;;){const read=await Promise.race([reader.read(),deadline]);if(read.done)break;size+=read.value.length;if(size>50000)throw new LicensingError(413,"REQUEST_TOO_LARGE");chunks.push(read.value);}}finally{clearTimeout(timeout);await reader.cancel().catch(()=>{});reader.releaseLock();}
 const result=await performLicensingRequest(JSON.parse(Buffer.concat(chunks).toString("utf8")));return NextResponse.json(result,{headers});
 }catch(e){const status=e instanceof LicensingError?e.status:e instanceof ZodError||e instanceof SyntaxError?400:503;return NextResponse.json({error:e instanceof LicensingError?e.code:status===400?"CHECK_REQUIRED_FIELDS":"LICENSING_UNAVAILABLE"},{status,headers});}
}
