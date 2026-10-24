import {randomUUID} from 'node:crypto';
import {database,ids,asActor} from './artist-baseline-db.mjs';
import {call as rawCall} from './purchase-legal-fixture.mjs';
export const call=(db,name,args=[])=>rawCall(db,name,args);
export {database,ids,asActor,randomUUID};
export async function admin(db,fn,{fresh=true,id=ids.admin,aal='aal2',session}={}){await db.query("select set_config('request.jwt.claim.amr',$1,false)",[JSON.stringify(fresh?[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]:[])]);try{return await asActor(db,id,fn,'authenticated',session,aal);}finally{await db.exec("select set_config('request.jwt.claim.amr','',false)");}}
export const command=(db,module,id,revision,action,data={},key=randomUUID(),options={})=>admin(db,()=>call(db,'sec_command',[module,id,revision,key,action,data,'SYNTHETIC reviewed operation','SYNTHETIC approval']),options);
export const read=(db,module,page=1,search='',status='',sort='newest')=>admin(db,()=>call(db,'sec_read',[module,page,search,status,sort]));
export async function customer(db,id,fn){const session=randomUUID();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,id]);try{return await asActor(db,id,fn,'authenticated',session);}finally{await db.query('delete from auth.sessions where id=$1',[session]);}}
export const bindFounder=db=>call(db,'sec_bind_founder',[ids.admin,'SYNTHETIC founder appointment approval']);
