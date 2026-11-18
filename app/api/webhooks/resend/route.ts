import { NextResponse } from "next/server";
import { boundedText, verifyDeliveryEvent } from "@/lib/notifications/provider";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
export const runtime="nodejs";
export async function POST(request:Request){
 const json=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
 if(process.env.TSE_EMAIL_DELIVERY_ENABLED!=="true"||!process.env.RESEND_WEBHOOK_SECRET)return json({error:"Delivery ingestion unavailable."},503);
 let e:ReturnType<typeof verifyDeliveryEvent>;
 try{const raw=await boundedText(new Response(request.body),65536);e=verifyDeliveryEvent(raw,request.headers,process.env.RESEND_WEBHOOK_SECRET);}catch{return json({error:"Invalid delivery event."},400);}
 const db=createAdminSupabaseClient();if(!db)return json({error:"Delivery ingestion unavailable."},503);
 const {data,error}=await db.rpc("ingest_notification_event",{p_event:e.id,p_hash:e.hash,p_provider:e.provider,p_kind:e.kind,p_at:e.at}).abortSignal(AbortSignal.timeout(5000));
 if(error)return json({error:"Delivery ingestion unavailable."},503);
 return json({recorded:true,conflict:data==="conflict"});
}
