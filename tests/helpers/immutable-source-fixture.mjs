// Explicit synthetic media evidence. Exercises canonical RPCs, not a decoder or
// hosted Storage. Only new disposable databases/clusters import this module.
import {randomUUID,createHash} from 'node:crypto';
import {ids,quote,asActor} from './artist-baseline-db.mjs';
const invoke=async(db,name,args,schema='public')=>(await db.query(`select ${schema}.${name}(${args.map(x=>x===null?'null':quote(typeof x==='object'?JSON.stringify(x):x)).join(',')}) value`)).rows[0].value;
const artist=(db,name,args)=>asActor(db,ids.a,()=>invoke(db,name,args));
const worker=(db,name,args=[])=>asActor(db,null,()=>invoke(db,name,args,'submission_media'),'submission_media_broker');
const revision=async(db,s)=>Number((await db.query(`select revision from submission_media.submissions where id=${quote(s)}`)).rows[0].revision);
export const sourceBytes=new Uint8Array(100).fill(65),sourceHash=createHash('sha256').update(sourceBytes).digest('hex');
const ready=new WeakMap();
export async function createApprovedSource(db,submission=null,{approve=true,mime='audio/wav',sourceSha256=sourceHash}={}) {
 const sourceHash=sourceSha256;
 const flags=(await db.query('select * from submission_media.capabilities')).rows[0];
 await db.exec('update submission_media.capabilities set reservations_enabled=true,worker_enabled=true,activation_enabled=true,foundation_reads_enabled=true');
 try {
  const s=submission||(await artist(db,'media_create_submission',[randomUUID(),ids.live])).submission_id;
  const r=await artist(db,'media_reserve_asset',[s,'source_master','Synthetic.wav',100,await revision(db,s),randomUUID()]);
  await db.exec(`insert into storage.buckets(id,name,public) values('submission-source','submission-source',false),('submission-derived','submission-derived',false) on conflict(id) do nothing`);
  await db.exec(`insert into storage.objects(bucket_id,name,owner_id,version,metadata) select bucket,object_path,'${ids.a}','source-v1',jsonb_build_object('size',100,'mimetype',${quote(mime)}) from submission_media.assets where id='${r.asset_id}'`);
  await worker(db,'observe_upload',[r.asset_id]);
  let j=await worker(db,'claim_job');
  await worker(db,'complete_job',[j.job_id,j.lease_epoch,j.lease_token,{sha256:sourceHash,actual_bytes:100,container:'wav',codec:'pcm_s24le',frames:5760000,duration_us:120000000,sample_rate:48000,channels:2,bit_depth:24,build_digest:'sha256:'+'b'.repeat(64)}]);
  j=await worker(db,'claim_job');
  async function derivative(job,mime,result) {
   await db.exec(`insert into storage.objects(bucket_id,name,version,metadata) select bucket,object_path,'derived-v1',jsonb_build_object('size',100,'mimetype',${quote(mime)}) from submission_media.assets where id=${quote(job.asset_id)}`);
   const obj=(await db.query(`select o.id,o.version from storage.objects o join submission_media.assets a on a.bucket=o.bucket_id and a.object_path=o.name where a.id=${quote(job.asset_id)}`)).rows[0];
   await worker(db,'record_worker_output',[job.job_id,job.lease_epoch,job.lease_token,obj.id,obj.version,result.sha256,100]);
   await worker(db,'complete_job',[job.job_id,job.lease_epoch,job.lease_token,result]);
  }
  await derivative(j,'application/octet-stream',{sha256:'c'.repeat(64),source_sha256:sourceHash,actual_bytes:100,container:'waveform_minmax_i16_v1',waveform_points:12000,build_digest:'sha256:'+'b'.repeat(64)});
  await artist(db,'media_select_preview_region',[s,r.asset_id,0,30000,await revision(db,s),randomUUID()]);
  const p=await artist(db,'media_request_preview',[s,await revision(db,s),randomUUID()]);j=await worker(db,'claim_job');
  await derivative(j,'audio/mp4',{sha256:'d'.repeat(64),source_sha256:sourceHash,actual_bytes:100,container:'m4a',codec:'aac_lc',frames:1323000,duration_us:30000000,sample_rate:44100,channels:2,build_digest:'sha256:'+'b'.repeat(64)});
  await artist(db,'media_accept_asset',[s,p.asset_id,await revision(db,s),randomUUID()]);
  const review=await artist(db,'media_request_master_review',[s,r.asset_id,p.asset_id,await revision(db,s),randomUUID()]);
  const hash=(await db.query(`select encode(package_hash,'hex') hash from submission_media.master_reviews where id=${quote(review.review_id)}`)).rows[0].hash;
  const awaitRevision=await revision(db,s);
  if(approve)await asActor(db,ids.admin,()=>invoke(db,'media_decide_master_review',[review.review_id,true,hash,awaitRevision,randomUUID()]));
  return {submission:s,master:r.asset_id,preview:p.asset_id,review:review.review_id};
 } finally {
  await db.exec(`update submission_media.capabilities set reservations_enabled=${flags.reservations_enabled},worker_enabled=${flags.worker_enabled},activation_enabled=${flags.activation_enabled},foundation_reads_enabled=${flags.foundation_reads_enabled}`);
 }
}
export async function approvedSource(db) {
 if(ready.has(db))return ready.get(db);
 const s=await createApprovedSource(db);ready.set(db,s);return s;
}
const reviewing=new WeakMap();
export async function ensureSourceReview(db,offer) {
 if(!reviewing.has(db))reviewing.set(db,new Map());
 const map=reviewing.get(db);if(map.has(offer))return map.get(offer);
 const promise=reviewSourceFixture(db,offer);map.set(offer,promise);
 try{return await promise;}catch(e){map.delete(offer);throw e;}
}
async function reviewSourceFixture(db,offer) {
 const existing=(await db.query(`select 1 from licensing_private.source_reviews where offer_id=${quote(offer)}`)).rows.length;if(existing)return;
 const s=await approvedSource(db);
 if(!(await db.query(`select 1 from commerce_private.license_delivery_sets where offer_id=${quote(offer)}`)).rows.length)
  await invoke(db,'review_license_deliverables',[ids.admin,offer,[],'SYNTHETIC explicitly agreement-only license']);
 return invoke(db,'review_purchase_source',[ids.admin,offer,s.submission,await revision(db,s.submission),'SYNTHETIC canonical submission / rights / deliverables review']);
}
