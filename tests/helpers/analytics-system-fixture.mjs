import {randomUUID} from 'node:crypto';
import {database,ids,asActor} from './artist-baseline-db.mjs';
import {call,admin,customer,command} from './sec-fixture.mjs';
export {database,ids,asActor,call,admin,customer,command,randomUUID};
export async function enable(db,users=[ids.a,ids.b,ids.buyer,ids.admin]){
 await db.exec("update analytics_private.configuration set enabled=true,privacy_approved=true,capture_from='2020-01-01'");
 for(const id of users)await db.query("insert into analytics_private.preferences(user_id,consented,notice_version,source,changed_at) values($1,true,'analytics-optional-v1','account','2020-01-01') on conflict(user_id) do update set consented=true,changed_at='2020-01-01'",[id]);
}
export const enqueue=(db,key=randomUUID(),{id=ids.buyer,event='onboarding_started',properties={},role='buyer',environment='preview'}={})=>call(db,'enqueue_analytics_event',[environment,event,id,role,properties,key,false,true]);
export const collect=(db,n=200)=>call(db,'collect_analytics_events',['preview',n]);
export const claim=async(db,id=null)=>(await db.query('select * from public.claim_analytics_event($1,$2)',['preview',id])).rows[0];
export async function fixture(fn){const db=await database();try{await fn(db);}finally{await db.close();}}
export const financial=(db,end=new Date(Date.now()+86400000).toISOString(),mode='test')=>admin(db,()=>call(db,'analytics_financial_source',[end,mode]));
export const booked=(db,start='2026-01-01T00:00:00Z',end=new Date(Date.now()+86400000).toISOString())=>admin(db,()=>call(db,'analytics_booked_finance',[start,end,'test']));
