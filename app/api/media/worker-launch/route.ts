import {verifyLaunch} from '@/services/media-broker/do-transfer-proof.mjs';
import {createAdminSupabaseClient} from '@/services/supabase/admin';
import {mediaRpc,type MediaClient} from '@/services/media/uploads';
export const dynamic='force-dynamic';
export async function POST(request:Request){const headers={'cache-control':'private, no-store','referrer-policy':'no-referrer'};try{
 const proof=request.headers.get('x-tse-proof'),signature=request.headers.get('x-tse-signature'),key=process.env.MEDIA_DO_HOST_PUBLIC_KEY;if(!key||!proof||proof.length>2048||!signature)throw Error('DENIED');
 const p=verifyLaunch(JSON.parse(proof),signature,key);const admin=createAdminSupabaseClient();if(!admin)throw Error('UNAVAILABLE');
 const result=await mediaRpc<{authorized:boolean;run_id:string;boot_id:string;host_id:string;worker_digest:string}>(admin as unknown as MediaClient,'media_do_launch_status',{p_run:p.run_id,p_boot:p.boot_id});
 if(!result.authorized||result.run_id!==p.run_id||result.boot_id!==p.boot_id||result.host_id!==p.host_id||result.worker_digest!==p.worker_digest)throw Error('DENIED');return Response.json(result,{headers});
 }catch{return Response.json({authorized:false},{status:403,headers});}}
