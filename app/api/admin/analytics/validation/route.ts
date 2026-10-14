import { getAnalyticsActor } from '@/services/analytics/actor';
import { createAdminSupabaseClient } from '@/services/supabase/admin';
import { env, getDeploymentTarget } from '@/lib/env';
import { boundedValidationConfig, executeBoundedValidation, hasEmptyValidationBody, VALIDATION_EVENT } from '@/lib/analytics/bounded-validation';
const capabilities=['foundation_enabled','asset_preparation_enabled','receipt_generation_enabled','entitlement_activation_enabled','transaction_projection_enabled','payment_adapter_enabled'] as const;
export async function POST(request:Request) {
  const deny=(status:number)=>new Response(null,{status,headers:{'Cache-Control':'no-store'}});
  if(request.headers.get('origin')!==new URL(request.url).origin)return deny(403);
  // Canonical server role checked before opening any privileged client.
  if((await getAnalyticsActor())?.role!=='admin')return deny(403);
  const config=boundedValidationConfig({...process.env,SYNC_EXCHANGE_DEMO_MODE:String(env.demoMode)},getDeploymentTarget());
  if(!config)return deny(503);
  // No actor, event, properties or authorization supplied by the caller.
  // Empty body only; do not read/buffer arbitrary request data.
  if(!await hasEmptyValidationBody(request))return deny(400);
  const db=createAdminSupabaseClient();if(!db)return deny(503);
  try {
    const flags=await db.rpc('get_admin_purchase_capabilities',{}).abortSignal(AbortSignal.timeout(3000));
    if(flags.error||flags.data?.length!==1||!capabilities.every(k=>flags.data![0][k]===false))return deny(503);
    const result=await executeBoundedValidation(config,{
      claim:async()=>{
        const r=await db.rpc('claim_staging_analytics_validation',{p_authorization:config.authorization,p_artist:config.artist,p_event:VALIDATION_EVENT}).abortSignal(AbortSignal.timeout(3000));
        if(r.error||!r.data||r.data.length>1)throw new Error('validation_claim_failed');
        const row=r.data[0];if(!row)return null;
        if(row.event!==VALIDATION_EVENT||row.actor_role!=='artist'||!row.lease_id||!row.lease_until)throw new Error('validation_row_invalid');
        return {...row,event:VALIDATION_EVENT,actor_role:'artist' as const,lease_id:row.lease_id,lease_until:row.lease_until};
      },
      finish:async (lease,accepted)=>{
        const r=await db.rpc('finish_staging_analytics_validation',{p_authorization:config.authorization,p_lease:lease,p_accepted: accepted}).abortSignal(AbortSignal.timeout(3000));
        if(r.error)throw new Error('validation_finish_failed');return r.data;
      }
    });
    return Response.json(result,{status:result.status==='accepted'?200:result.status==='rejected'?409:502,headers:{'Cache-Control':'no-store'}});
  }catch{return deny(503);}
}
