import {database,ids,asActor} from './artist-baseline-db.mjs';
import {call,admin,customer,command,randomUUID} from './sec-fixture.mjs';
export {database,ids,asActor,call,admin,customer,command,randomUUID};
export async function enable(db){
 await db.exec("alter table auth.users add column if not exists email_confirmed_at timestamptz;update auth.users set email_confirmed_at='2020-01-01';update notifications_private.configuration set enabled=true,source_from='2021-01-01'");
}
export async function source(db,id=ids.a){await db.query('update public.user_profiles set onboarding_completed_at=clock_timestamp() where id=$1',[id]);}
export const collect=db=>call(db,'collect_notification_events',[200]);
export const claim=db=>call(db,'claim_notification');
export const finish=(db,c,outcome='accepted',provider='provider_fixture')=>call(db,'finish_notification',[c.id,c.lease,outcome,provider]);
export const rpc=db=>async(name,args={})=>{
 const values={notification_request_seal:[args.p_id,args.p_lease,args.p_hash],collect_notification_events:[args.p_limit??200],claim_notification:[],notification_send_allowed:[args.p_id,args.p_lease],finish_notification:[args.p_id,args.p_lease,args.p_outcome,args.p_provider??null]};
 return call(db,name,values[name]);
};
export async function fixture(fn){const db=await database();try{await enable(db);await fn(db);}finally{await db.close();}}
