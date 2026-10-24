import "server-only";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { emailOrigin } from "@/lib/notifications/templates";
import { validEmail, sendNotice } from "@/lib/notifications/provider";
import { processNotifications } from "@/lib/notifications/worker";
export async function runNotificationBatch(limit=10){
 if(process.env.TSE_EMAIL_DELIVERY_ENABLED!=="true")return {disabled:true};
 const key=process.env.RESEND_API_KEY??"",from=process.env.TSE_EMAIL_FROM??"",replyTo=process.env.TSE_EMAIL_REPLY_TO??"";
 const origin=emailOrigin(process.env.NEXT_PUBLIC_APP_URL??"");
 if(!key.startsWith("re_")||!validEmail(from)||!validEmail(replyTo))throw Error("notification_configuration_unavailable");
 const db=createAdminSupabaseClient();if(!db)throw Error("notification_worker_unavailable");
 const rpc=async(name:string,args:Record<string,unknown>={})=>{const r=await db.rpc(name as "collect_notification_events",args).abortSignal(AbortSignal.timeout(5000));if(r.error)throw Error("notification_database_unavailable");return r.data;};
 return processNotifications(rpc,(id,to,content)=>sendNotice({key,from,replyTo,origin},id,to,content),origin,limit,JSON.stringify({from,replyTo}));
}
