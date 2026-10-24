import {randomUUID,createHash} from 'node:crypto';
import {database,asActor as baseActor,ids} from './artist-baseline-db.mjs';
import {seedLegalReview,call,terms,financial} from './purchase-legal-fixture.mjs';
export {ids,call,terms,financial};
export async function asActor(db,id,fn,role='authenticated',session='',aal='aal2'){let created=null;if(role==='authenticated'&&!session){created=randomUUID();session=created;await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,id]);}try{return await baseActor(db,id,fn,role,session,aal);}finally{if(created)await db.query('delete from auth.sessions where id=$1',[created]);}}
export const artist=(db,name,args)=>asActor(db,ids.a,()=>call(db,name,args));
export const admin=(db,name,args)=>asActor(db,ids.admin,()=>call(db,name,args));
export const service=(db,name,args)=>asActor(db,null,()=>call(db,name,args),'service_role');
export const rev=async(db,track=ids.live)=>Number((await db.query('select revision from rights_private.cases where track_id=$1',[track])).rows[0]?.revision||0);
export const read=(db,track=ids.live)=>artist(db,'rights_read',[track,false]);
export const checklist=Object.fromEntries(['master','publishing','documents','mandates','scope','contributors','conflicts','secureHandling'].map(k=>[k,true]));
export const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R /Size 2 >>\nstartxref\n51\n%%EOF\n');
export const digest=createHash('sha256').update(pdf).digest('hex');
export async function fixture(){const db=await database();await db.exec("insert into storage.buckets(id,name,public) values('rights-evidence','rights-evidence',false)");return db;}
export async function draft(db){const old=await seedLegalReview(db);const payload=structuredClone(old.rights);for(const pool of ['master','publishing'])payload[pool]=payload[pool].map(h=>{const {evidenceId,...rest}=h;return {...rest,role:pool==='master'?'owner':'writer',documentId:''};});payload.scope={...payload.scope,maxDurationDays:30,exclusivity:'nonexclusive',exclusivityConflict:false};await save(db,payload);return payload;}
export const save=async(db,payload,version)=>artist(db,'rights_save',[ids.live,version??await rev(db),randomUUID(),payload]);
export async function doc(db,{track=ids.live,kind='mandate',type='application/pdf',filename='Synthetic mandate.pdf',bytes=pdf}={}){const d=await artist(db,'rights_document_reserve',[track,await rev(db,track),randomUUID(),kind,filename,bytes.length,type]);const id=randomUUID();await db.query("insert into storage.objects(id,bucket_id,name,version,metadata) values($1,'rights-evidence',$2,'evidence-v1',jsonb_build_object('size',$3::bigint))",[id,`${ids.a}/${track}/${d.document_id}/original`,bytes.length]);await service(db,'rights_document_server',[ids.a,d.document_id,createHash('sha256').update(bytes).digest('hex'),id]);return d.document_id;}
export async function submitted(db){const payload=await draft(db);const id=await doc(db);for(const pool of ['master','publishing'])payload[pool].forEach(h=>h.documentId=id);await save(db,payload);const r=await artist(db,'rights_submit',[ids.live,await rev(db),randomUUID()]);return {payload,id,version:r.version_id};}
export async function approve(db,version){return admin(db,'rights_review',[ids.live,await rev(db),randomUUID(),version,'approved','Synthetic independently reviewed authority.',checklist]);}
export async function approved(db){const x=await submitted(db);await approve(db,x.version);return {...x,rights:(await read(db)).approved_rights};}
