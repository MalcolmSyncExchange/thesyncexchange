import { env } from "@/lib/env";
import { RightsError } from "@/services/rights/server";
import { downloadRightsDocument, uploadRightsDocument } from "@/services/rights/documents";
export const dynamic='force-dynamic';
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const failure=(e:unknown)=>Response.json({error:e instanceof RightsError?e.code:'DOCUMENT_UNAVAILABLE'},{status:e instanceof RightsError?e.status:503,headers});
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){try{if(request.headers.get('origin')!==new URL(env.appUrl).origin)throw new RightsError(403,'ORIGIN_DENIED');if(request.headers.get('content-type')!=='application/octet-stream')throw new RightsError(415,'BINARY_REQUIRED');return Response.json(await uploadRightsDocument((await params).id,request),{headers});}catch(e){return failure(e);}}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{return await downloadRightsDocument((await params).id,request.signal);}catch(e){return failure(e);}}
