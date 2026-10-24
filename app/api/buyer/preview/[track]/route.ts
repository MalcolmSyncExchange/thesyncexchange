import {buyerPreview,previewHeaders} from "@/services/buyer/preview";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{track:string}>}){try{return await buyerPreview(request,(await params).track);}catch{return new Response("Preview unavailable",{status:403,headers:previewHeaders});}}
