import { isDedicatedStagingDeploymentIdentity } from '../staging-identity.ts';
import { resolveAnalyticsConfig, type AnalyticsConfig } from './config.ts';
import { sendEvent, type StoredEvent } from './transport.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const VALIDATION_EVENT='submission_started';
export function boundedValidationConfig(vars:Record<string,string|undefined>,target:string):{config:AnalyticsConfig;authorization:string;artist:string}|null {
  if(vars.SYNC_EXCHANGE_PAYMENT_MODE!=='test'||vars.SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED!=='false'||
    vars.SYNC_EXCHANGE_BILLING_PORTAL_ENABLED!=='false'||vars.STRIPE_SECRET_KEY||vars.STRIPE_WEBHOOK_SECRET||vars.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY||
    vars.ANALYTICS_ENABLED!=='false'||vars.STAGING_ANALYTICS_VALIDATION_ENABLED!=='true'||
    !isDedicatedStagingDeploymentIdentity(vars,target)||!uuid.test(vars.STAGING_ANALYTICS_VALIDATION_AUTHORIZATION||'')||
    !uuid.test(vars.STAGING_ANALYTICS_VALIDATION_ARTIST||'')||vars.POSTHOG_PRODUCTION_TOKEN) return null;
  // Private one-shot transport config only; never changes the ordinary global switch.
  const config=resolveAnalyticsConfig({...vars,ANALYTICS_ENABLED:'true'},target);
  return config?.environment==='preview'?{config,authorization:vars.STAGING_ANALYTICS_VALIDATION_AUTHORIZATION!,artist:vars.STAGING_ANALYTICS_VALIDATION_ARTIST!}:null;
}
export type ValidationRow=StoredEvent & {lease_id:string;lease_until:string};
export async function executeBoundedValidation(input:NonNullable<ReturnType<typeof boundedValidationConfig>>,dependencies:{
  claim:()=>Promise<ValidationRow|null>;finish:(lease:string,accepted:boolean)=>Promise<string>;
  request?:typeof fetch; now?:()=>number;
}) {
  const row=await dependencies.claim();if(!row)return {status:'rejected'};
  const now=dependencies.now||Date.now;
  let accepted=false;
  if(row.event===VALIDATION_EVENT&&row.actor_id===input.artist&&row.actor_role==='artist'&&row.environment==='preview'&&
    row.is_test===true&&row.is_internal===false&&uuid.test(row.id)&&uuid.test(row.lease_id)&&
    row.properties&&typeof row.properties==='object'&&
    Object.keys(row.properties).length===2&&
    (row.properties as Record<string,unknown>).submission_attempt_id===input.authorization&&
    (row.properties as Record<string,unknown>).surface==='submission_create') {
    const remaining=Date.parse(row.lease_until)-now();
    if(remaining>0) {
      const outcome=await sendEvent(input.config,row,async(url,options)=>{
        if(now()>=Date.parse(row.lease_until))throw new Error('validation_expired');
        return (dependencies.request||fetch)(url,{...options,signal:AbortSignal.any([options?.signal||AbortSignal.timeout(3000),AbortSignal.timeout(Math.max(1,Date.parse(row.lease_until)-now()))])});
      });accepted=outcome.kind==='accepted';
    }
  }
  const status=await dependencies.finish(row.lease_id,accepted);
  return {status,eventId:row.id,ingestionAcknowledged:accepted};
}

/** Some adapters represent an empty POST as a stream rather than null. */
export async function hasEmptyValidationBody(request:Request):Promise<boolean> {
  if(!request.body)return true;
  const reader=request.body.getReader();let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const result=await Promise.race([reader.read(),new Promise<{done:boolean}>(resolve=>{timer=setTimeout(()=>resolve({done:false}),1000);})]);
    return result.done===true;
  }catch{return false;}
  finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
