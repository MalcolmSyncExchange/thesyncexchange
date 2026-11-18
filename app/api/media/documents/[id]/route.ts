import { z } from 'zod';
import { env } from '@/lib/env';
import { UploadError } from '@/services/media/uploads';
import { uploadWorkspaceDocument,downloadWorkspaceDocument } from '@/services/media/workspace-documents';
export const dynamic='force-dynamic';
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const fail=(e:unknown)=>Response.json({error:e instanceof UploadError?e.code:'DOCUMENT_UNAVAILABLE'},{status:e instanceof UploadError?e.status:e instanceof z.ZodError?400:503,headers});
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){try{if(request.headers.get('origin')!==new URL(env.appUrl).origin)throw new UploadError(403,'ORIGIN_DENIED');if(request.headers.get('content-type')!=='application/octet-stream')throw new UploadError(415,'DOCUMENT_TYPE_DENIED');const {id}=await params;return Response.json(await uploadWorkspaceDocument(id,request),{headers});}catch(e){return fail(e);}}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const value=new URL(request.url).searchParams.get('admin');if(value!==null&&value!=='true')throw new UploadError(400,'INVALID_REQUEST');return await downloadWorkspaceDocument(id,value==='true',request.signal);}catch(e){return fail(e);}}
