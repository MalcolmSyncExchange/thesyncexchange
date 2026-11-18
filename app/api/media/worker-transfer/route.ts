import {doTransfer} from '@/services/media/do-transfer';
import {UploadError} from '@/services/media/uploads';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){const headers={'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};try{return Response.json(await doTransfer(request),{headers});}catch(e){return Response.json({error:'DO_TRANSFER_DENIED'},{status:e instanceof UploadError?e.status:503,headers});}}
