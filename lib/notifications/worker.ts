import { createHash } from "node:crypto";
import { renderNotice } from "./templates.ts";
export type EmailClaim={id:string;lease:string;kind:string;category:string;to:string;role:string;templateVersion:string;orderId?:string|null};
export type EmailRpc=(name:string,args?:Record<string,unknown>)=>Promise<unknown>;
export type EmailSend=(id:string,to:string,content:ReturnType<typeof renderNotice>)=>Promise<{outcome:string;provider?:string}>;
/** Bounded, explicit server worker. No startup hook, public endpoint or scheduler. */
export async function processNotifications(rpc:EmailRpc,send:EmailSend,origin:string,limit=10,senderScope="") {
 let collectionFailed=false;try{await rpc("collect_notification_events",{p_limit:200});}catch{collectionFailed=true;}
 let attempted=0,accepted=0;
 for(let i=0;i<Math.min(10,Math.max(0,Math.trunc(limit)));i++){
  const item=await rpc("claim_notification") as EmailClaim|null;if(!item)break;
  if(await rpc("notification_send_allowed",{p_id:item.id,p_lease:item.lease})!==true){await rpc("finish_notification",{p_id:item.id,p_lease:item.lease,p_outcome:"canceled",p_provider:null});continue;}
  let result:{outcome:string;provider?:string};
  try{const content=renderNotice(item.kind,item.role,origin,item.templateVersion,item.orderId);
   const hash=createHash("sha256").update(JSON.stringify({to:item.to,content,senderScope})).digest("hex");
   if(await rpc("notification_request_seal",{p_id:item.id,p_lease:item.lease,p_hash:hash})!==true)continue;
   attempted++;result=await send(item.id,item.to,content);
  }catch{result={outcome:"transient"};}
  // A failed acknowledgement leaves a recoverable lease and the SAME provider key.
  const saved=await rpc("finish_notification",{p_id:item.id,p_lease:item.lease,p_outcome:result.outcome,p_provider:result.provider??null});
  if(saved!==true)throw Error("notification_lease_lost");if(result.outcome==="accepted")accepted++;
 }
 return {attempted,accepted,collectionFailed};
}
