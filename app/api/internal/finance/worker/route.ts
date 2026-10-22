import {NextResponse} from "next/server";
import {authorizeFinancialWorker} from "@/lib/finance/worker-auth.mjs";
import {processFinancialQueue} from "@/services/finance/ingestion";
export const runtime="nodejs";
export async function POST(request:Request){
  if(!authorizeFinancialWorker(request.headers.get("authorization"),process.env.TSE_FINANCE_WORKER_SECRET))return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const result=await processFinancialQueue();
    console.info("[finance-worker]",JSON.stringify(result));
    return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch{return NextResponse.json({error:"financial_worker_unavailable"},{status:503,headers:{"Cache-Control":"private, no-store"}});}
}
