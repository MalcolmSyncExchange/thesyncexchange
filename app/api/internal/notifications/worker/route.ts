import {NextResponse} from "next/server";
import {authorizeFinancialWorker as authorizeWorker} from "@/lib/finance/worker-auth.mjs";
import {runNotificationBatch} from "@/services/notifications/worker";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
/** Dedicated bearer authority only; never a cookie, role hint or client-selected recipient. */
export async function POST(request:Request){
 const secret=process.env.TSE_NOTIFICATION_WORKER_SECRET;
 if(!authorizeWorker(request.headers.get("authorization"),secret)||secret===process.env.TSE_FINANCE_WORKER_SECRET)return NextResponse.json({error:"unauthorized"},{status:401,headers});
 if(process.env.TSE_EMAIL_DELIVERY_ENABLED!=="true")return NextResponse.json({error:"notification_worker_disabled"},{status:503,headers});
 if(request.body!==null)return NextResponse.json({error:"body_not_supported"},{status:400,headers});
 try{
  const result=await runNotificationBatch(10);
  if("disabled" in result)return NextResponse.json({error:"notification_worker_disabled"},{status:503,headers});
  return NextResponse.json({attempted:result.attempted,accepted:result.accepted,collectionFailed:result.collectionFailed},{headers});
 }catch{return NextResponse.json({error:"notification_worker_unavailable"},{status:503,headers});}
}
