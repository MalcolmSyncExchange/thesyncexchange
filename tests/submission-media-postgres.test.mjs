import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,psql,actorSql,actor,broker,ids,quote,foundation,source,key,enabled,submission,reserve,upload,complete,masterResult,validateMaster,preview,review,revision,call} from './helpers/submission-media-postgres.mjs';
const denied=async(db,sql,match=/denied|permission|row-level|Managed|Invalid|Unsupported|immutable|constraint|mismatch|required|read-only|disabled|STALE|expired|limit|state|Preview|Master|retained|audit|lease/i)=>assert.rejects(db.exec(sql),match);
async function run(fn,options) {const db=await fixture(options);try{await fn(db);}finally{await db.close();}}

test('A/B/C full real PostgreSQL replay; B before A fails; duplicate replay is safe and dormant',()=>run(async db=>{
 const before=await db.scalar('select row_to_json(c) from submission_media.capabilities c');
 for(const m of foundation) await db.exec(source('supabase/migrations/'+m));
 assert.equal(await db.scalar('select row_to_json(c) from submission_media.capabilities c'),before);
 for(const t of ['submissions','assets','operations','jobs','master_reviews','events']) assert.equal(await db.scalar(`select count(*) from submission_media.${t}`),'0');
 const empty=await fixture({apply:false,seed:false});try{await assert.rejects(empty.exec(source('supabase/migrations/'+foundation[1])),/schema .* does not exist/);}finally{await empty.close();}
 const r=await db.query("select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='submission_media' and c.relkind='r'");assert.equal(r.rows.length,7);assert.ok(r.rows.every(x=>x.relrowsecurity&&x.relforcerowsecurity));
 await denied(db,actorSql(ids.a,call('media_create_submission',[key(),null])),/disabled/);
 // Flags off: legacy writes/reviews/discovery retain original behavior, no worker work.
 await db.exec(`update tracks set title='Legacy still writable',audio_file_path='${ids.a}/uploads/audio/new.wav' where id='${ids.draft}'`);
 assert.equal(await db.scalar(`select count(*) from tracks where status='approved'`),'1');
 assert.equal(await actor(db,ids.buyer,'select count(*) from buyer_catalog_public'),1);
 assert.equal(await db.scalar('select count(*) from submission_media.jobs'),'0');
}));

test('exact grants, definer owner/search_path, canonical Artist/Admin and cross-Artist isolation',()=>run(async db=>{
 await enabled(db);const s=await submission(db,ids.draft);
 for(const [u,role] of [[ids.b,'authenticated'],[ids.buyer,'authenticated'],[ids.admin,'authenticated'],[null,'anon']]) await denied(db,actorSql(u,call('media_read_submission',[s]),role));
 await db.exec(`update auth.users set raw_user_meta_data='{"role":"artist"}' where id='${ids.buyer}'`);
 await denied(db,actorSql(ids.buyer,call('media_create_submission',[key(),null])));
 for(const t of ['submissions','assets','operations','jobs','master_reviews','events','capabilities']) {
  assert.equal(await db.scalar(`select has_table_privilege('authenticated','submission_media.${t}','select')`),'f');
  assert.equal(await db.scalar(`select has_table_privilege('submission_media_broker','submission_media.${t}','update')`),'f');
  await denied(db,actorSql(ids.a,`update submission_media.${t} set ${t==='capabilities'?'worker_enabled=true':t==='events'?"details='{}'":'id=id'}`));
 }
 const f=(await db.query("select n.nspname,p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner,p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='submission_media' or (n.nspname='public' and p.proname like 'media\\_%' escape '\\')")).rows;
 assert.ok(f.length>20);for(const x of f){assert.equal(x.prosecdef,true);assert.deepEqual(x.proconfig,['search_path=""']);assert.equal(x.owner,'submission_media_executor');assert.equal(await db.scalar(`select has_function_privilege('anon',${quote(x.sig)},'execute')`),'f');}
 await denied(db,actorSql(ids.a,'select submission_media.claim_job()'));
 await denied(db,actorSql(ids.a,`select media_read_operation('${key()}')`));
 const dto=await actor(db,ids.a,call('media_read_submission',[s]));assert.equal(dto.submission_id,s);assert.doesNotMatch(JSON.stringify(dto),/bucket|path|lease|token|sha256|storage_object/);
}));

test('reservation ownership, no arbitrary destination, expiry, replay, sealed Storage and no deletions',()=>run(async db=>{
 await enabled(db);const s=await submission(db);const k=key(),r=await revision(db,s);
 const sql=call('media_reserve_asset',[s,'source_master','valid.wav',100,r,k]);const a=await actor(db,ids.a,sql);assert.deepEqual(await actor(db,ids.a,sql),a);
 await denied(db,actorSql(ids.a,call('media_reserve_asset',[s,'source_master','changed.wav',100,r,k])),/Idempotency/);
 for(const kind of ['buyer_preview','waveform','agreements','purchase-assets']) await denied(db,actorSql(ids.a,call('media_reserve_asset',[s,kind,'valid.wav',100,await revision(db,s),key()])));
 for(const name of ['../evil.wav','https://evil/file.wav','a\\b.wav']) await denied(db,actorSql(ids.a,call('media_reserve_asset',[s,'source_master',name,100,await revision(db,s),key()])));
 await denied(db,actorSql(ids.b,call('media_reserve_asset',[s,'source_master','valid.wav',100,0,key()])));
 await denied(db,"insert into storage.objects(bucket_id,name,owner_id,metadata,version) values('submission-source','foreign/path','x','{\"size\":100}','v1')");
 await upload(db,a.asset_id);const path=await db.scalar(`select object_path from submission_media.assets where id='${a.asset_id}'`);
 for(const sql of [`delete from storage.objects where name='${path}'`,`update storage.objects set version='v2' where name='${path}'`,`update storage.objects set metadata='{"size":99}' where name='${path}'`]) await denied(db,sql);
 await db.exec(`update storage.objects set metadata=metadata||'{"last_accessed_at":"now"}' where name='${path}'`);
 assert.equal(await db.scalar(`select count(*) from storage.objects where name='${path}'`),'1');
 const b=await reserve(db,s);await db.exec(`update submission_media.assets set reservation_expires_at=now()-interval '1 second' where id='${b.asset_id}'`);
 await denied(db,`insert into storage.objects(bucket_id,name,owner_id,metadata,version) select bucket,object_path,'${ids.a}','{"size":100}','v1' from submission_media.assets where id='${b.asset_id}'`);
}));

test('authoritative validation policy WAV/AIFF/FLAC; invalid media evidence and READY constraints',()=>run(async db=>{
 await enabled(db);const s=await submission(db);const a=await reserve(db,s);await upload(db,a.asset_id);const j=await broker(db,'select submission_media.claim_job()');
 for(const override of [{container:'mp3',codec:'mp3'},{actual_bytes:250000001},{frames:0},{sample_rate:384000},{channels:8},{sha256:null},{duration_us:null},{container:'bogus'},{build_digest:'bad'}]) await assert.rejects(complete(db,j,{...masterResult(),...override}),/constraint|Invalid|mismatch/);
 await complete(db,j,masterResult());
 await denied(db,`update submission_media.assets set duration_us=1 where id='${a.asset_id}'`);
 await denied(db,`delete from submission_media.assets where id='${a.asset_id}'`);
 await denied(db,`update submission_media.assets set source_asset_id='${a.asset_id}' where id='${a.asset_id}'`);
 for(const format of ['aiff','aifc','flac']) {
  const r=masterResult();r.container=format;r.codec=format==='flac'?'flac':'pcm_s24be';
  const s2=await submission(db);const a2=await reserve(db,s2);await upload(db,a2.asset_id);
  // Drain earlier waveform job first if selected by queue ordering.
  let next=await broker(db,'select submission_media.claim_job()');if(next.job_type==='waveform_generation') {
   await broker(db,`select submission_media.complete_job('${next.job_id}',${next.lease_epoch},'${next.lease_token}','{}','waveform_generation_failed')`);next=await broker(db,'select submission_media.claim_job()');
  }
  await complete(db,next,r);
 }
}));

test('Preview regions 15–60s, measured short-track exception, waveform provenance and acceptance',()=>run(async db=>{
 await enabled(db);const s=await submission(db);const m=await validateMaster(db,s);
 for(const [start,end] of [[-100,30000],[0,14900],[0,60100],[100000,130000],[1,30001]]) await denied(db,actorSql(ids.a,call('media_select_preview_region',[s,m,start,end,await revision(db,s),key()])));
 const foreign=await submission(db);await denied(db,actorSql(ids.a,call('media_select_preview_region',[foreign,m,0,30000,0,key()])));
 const p=await preview(db,s,m);assert.equal(await db.scalar(`select start_sample from submission_media.assets where id='${p}'`),'0');
 assert.equal(await db.scalar(`select end_sample from submission_media.assets where id='${p}'`),'1440000');
 assert.equal(await db.scalar(`select accepted_at is not null from submission_media.assets where id='${p}'`),'t');
 assert.equal(await broker(db,`select submission_media.buyer_media('${ids.draft}')`),null);
 const short=await submission(db);const sm=await validateMaster(db,short,10);await preview(db,short,sm,0,10000);
 await denied(db,actorSql(ids.a,call('media_select_preview_region',[short,sm,100,10000,await revision(db,short),key()])));
 await denied(db,actorSql(ids.a,call('media_select_preview_region',[s,m,0,30000,null,key()])),/STALE/);
}));

test('initial review, current/pending Master, NEW exact Preview requirement; approve/reject atomic packages',()=>run(async db=>{
 await enabled(db);const s=await submission(db,ids.live);const m=await validateMaster(db,s);const p=await preview(db,s,m);await review(db,s,m,p);
 const active=await broker(db,`select submission_media.buyer_media('${ids.live}')`);assert.equal(active.preview_id,p);assert.doesNotMatch(JSON.stringify(active),/source|master|path|bucket/);
 const replacement=await validateMaster(db,s);await denied(db,actorSql(ids.a,call('media_request_master_review',[s,replacement,p,await revision(db,s),key()])));
 assert.equal((await broker(db,`select submission_media.buyer_media('${ids.live}')`)).preview_id,p);
 const np=await preview(db,s,replacement);assert.equal((await broker(db,`select submission_media.buyer_media('${ids.live}')`)).preview_id,p);
 await review(db,s,replacement,np,{approve:false});assert.equal((await broker(db,`select submission_media.buyer_media('${ids.live}')`)).preview_id,p);
 await review(db,s,replacement,np);assert.equal((await broker(db,`select submission_media.buyer_media('${ids.live}')`)).preview_id,np);
 assert.equal(await db.scalar(`select status from tracks where id='${ids.live}'`),'approved');
 assert.equal(await db.scalar(`select superseded_at is not null from submission_media.assets where id='${m}'`),'t');
 await denied(db,`update tracks set audio_file_path='forged' where id='${ids.live}'`);
 await denied(db,`update tracks set preview_file_path='forged' where id='${ids.live}'`);
 assert.equal(await db.scalar(`select count(*) from storage.objects where bucket_id='submission-source'`),'2');
}));

test('approved Preview-only and Artwork-only activate; artwork validation, append-only audit, commerce separation',()=>run(async db=>{
 await enabled(db);const s=await submission(db,ids.live);const m=await validateMaster(db,s);const p=await preview(db,s,m);await review(db,s,m,p);
 const p2=await preview(db,s,m,10000,40000);assert.equal((await broker(db,`select submission_media.buyer_media('${ids.live}')`)).preview_id,p2);
 const a=await reserve(db,s,'artwork');await upload(db,a.asset_id);const j=await broker(db,'select submission_media.claim_job()');
 const result={sha256:'e'.repeat(64),actual_bytes:100,container:'jpeg',width:1024,height:512,animated:false,build_digest:'sha256:'+'b'.repeat(64)};
 for(const override of [{width:255},{width:8193},{width:8192,height:8192},{width:256,height:2048},{animated:true},{container:'gif'}]) await assert.rejects(complete(db,j,{...result,...override}),/invalid|constraint/i);
 await complete(db,j,result);await actor(db,ids.a,call('media_accept_asset',[s,a.asset_id,await revision(db,s),key()]));
 assert.equal((await broker(db,`select submission_media.buyer_media('${ids.live}')`)).artwork_id,a.asset_id);
 assert.equal(await db.scalar(`select status from tracks where id='${ids.live}'`),'approved');
 for(const sql of ['update submission_media.events set details=\'{}\'','delete from submission_media.events']) await denied(db,sql);
 await denied(db,`insert into submission_media.events(submission_id,event_type,actor_kind,details) values('${s}','asset_reserved','worker','{"token":"secret"}')`);
 for(const table of ['orders','generated_licenses','order_delivery_contracts','order_asset_entitlements','order_receipts','artist_transaction_records']) assert.equal(await db.scalar(`select has_table_privilege('submission_media_broker','public.${table}','select')`),'f');
 assert.equal(await db.scalar('select count(*) from orders'),'0');
}));

// These are real independent backend sessions, not cooperative in-memory transactions.
async function race(db,sql1,sql2) {return Promise.all([psql(db.name,sql1,{allowFailure:true}),psql(db.name,sql2,{allowFailure:true})]);}
test('concurrency: two revisions, duplicate idempotency, Preview generation/activation, Admin review vs edit, lease takeover',()=>run(async db=>{
 await enabled(db);const s=await submission(db);let r=await revision(db,s);
 let outcomes=await race(db,actorSql(ids.a,call('media_reserve_asset',[s,'source_master','a.wav',100,r,key()])),actorSql(ids.a,call('media_reserve_asset',[s,'source_master','b.wav',100,r,key()])));
 assert.equal(outcomes.filter(x=>x.code===0).length,1);assert.ok(outcomes.some(x=>/STALE_REVISION/.test(x.err)));
 r=await revision(db,s);const k=key(),sql=actorSql(ids.a,call('media_reserve_asset',[s,'artwork','a.png',100,r,k]));outcomes=await race(db,sql,sql);assert.ok(outcomes.every(x=>x.code===0));
 assert.equal(await db.scalar(`select count(*) from submission_media.operations where idempotency_key='${k}'`),'1');
 const t=await submission(db,ids.live);const m=await validateMaster(db,t);const p=await preview(db,t,m);await review(db,t,m,p);
 await actor(db,ids.a,call('media_select_preview_region',[t,m,10000,40000,await revision(db,t),key()]));
 r=await revision(db,t);const gen=key();const gs=actorSql(ids.a,call('media_request_preview',[t,r,gen]));outcomes=await race(db,gs,gs);assert.ok(outcomes.every(x=>x.code===0));
 const np=JSON.parse(outcomes[0].out.split('\n').at(-1)).asset_id;const j=await broker(db,'select submission_media.claim_job()');
 // Queue may choose leftover reservation validation only if uploaded; above are not uploaded.
 assert.equal(j.asset_id,np);
 await db.exec(`update submission_media.jobs set lease_expires_at=now()-interval '1 second' where id='${j.job_id}'`);const taken=await broker(db,'select submission_media.claim_job()');assert.equal(taken.job_id,j.job_id);assert.equal(taken.lease_epoch,j.lease_epoch+1);
 await assert.rejects(complete(db,j,{}),/Stale worker lease/);
 await assert.rejects(broker(db,`select submission_media.heartbeat_job('${j.job_id}',${j.lease_epoch},'${j.lease_token}')`),/Stale worker lease/);
 await db.exec(`insert into storage.objects(bucket_id,name,metadata,version) select bucket,object_path,'{"size":100}','p1' from submission_media.assets where id='${np}'`);
 await complete(db,taken,{sha256:'d'.repeat(64),source_sha256:'a'.repeat(64),actual_bytes:100,container:'m4a',codec:'aac_lc',frames:1323000,duration_us:30000000,sample_rate:44100,channels:2,build_digest:'sha256:'+'b'.repeat(64)});
 r=await revision(db,t);outcomes=await race(db,actorSql(ids.a,call('media_accept_asset',[t,np,r,key()])),actorSql(ids.a,call('media_accept_asset',[t,np,r,key()])));assert.equal(outcomes.filter(x=>!x.code).length,1);
 const nm=await validateMaster(db,t),npr=await preview(db,t,nm);const req=await actor(db,ids.a,call('media_request_master_review',[t,nm,npr,await revision(db,t),key()]));
 const hash=await db.scalar(`select encode(package_hash,'hex') from submission_media.master_reviews where id='${req.review_id}'`);r=await revision(db,t);
 outcomes=await race(db,actorSql(ids.admin,`select media_decide_master_review('${req.review_id}',true,'${hash}',${r},'${key()}')`),actorSql(ids.a,call('media_accept_asset',[t,np,r,key()])));
 assert.equal(outcomes.filter(x=>!x.code).length,1);
 const sourceNow=await db.scalar(`select current_master_id from submission_media.submissions where id='${t}'`);const previewNow=await db.scalar(`select source_asset_id from submission_media.assets where id=(select current_preview_id from submission_media.submissions where id='${t}')`);assert.equal(sourceNow,previewNow);
}));

test('forged IDs/provenance, wrong job kind, direct Storage isolation and explicit lazy adoption',()=>run(async db=>{
 await enabled(db);const s=await submission(db,ids.draft),s2=await submission(db);const m=await validateMaster(db,s);
 for(const sql of [call('media_reserve_asset',[key(),'source_master','x.wav',100,0,key()]),call('media_accept_asset',[s,key(),await revision(db,s),key()]),call('media_read_operation',[key()]),`select media_decide_master_review('${key()}',true,'${'0'.repeat(64)}',0,'${key()}')`]) await denied(db,actorSql(ids.a,sql));
 await denied(db,`insert into submission_media.jobs(submission_id,asset_id,operation_id,job_type,profile_version) select submission_id,id,operation_id,'preview_generation','preview-aac-lc-v1' from submission_media.assets where id='${m}'`);
 await denied(db,`update submission_media.submissions set working_master_id='${m}' where id='${s2}'`);
 await denied(db,`update submission_media.submissions set current_preview_id='${m}' where id='${s}'`);
 const p=await preview(db,s,m);await denied(db,actorSql(ids.a,call('media_request_master_review',[s,m,p,await revision(db,s),key()])),/canonical review/);
 const a=await reserve(db,s2,'artwork');const path=await db.scalar(`select object_path from submission_media.assets where id='${a.asset_id}'`);
 const insert=`insert into storage.objects(bucket_id,name,owner_id,metadata,version) values('submission-artwork','${path}','${ids.a}','{"size":100}','v1')`;
 await denied(db,actorSql(ids.b,insert));await denied(db,actorSql(ids.buyer,insert));await denied(db,actorSql(null,insert,'anon'));
 await db.exec(actorSql(ids.a,insert));
 for(const id of [ids.a,ids.b,ids.buyer,ids.admin]) assert.equal(await actor(db,id,"select count(*) from storage.objects where bucket_id='submission-artwork'"),0);
 const legacy=await submission(db,ids.live);const ad=await actor(db,ids.a,call('media_request_legacy_adoption',[legacy,await revision(db,legacy),key()]));
 assert.equal(await db.scalar(`select technical_state from submission_media.assets where id='${ad.asset_id}'`),'reserved');
 assert.equal(await db.scalar(`select managed_master from submission_media.submissions where id='${legacy}'`),'f');
 await broker(db,`select submission_media.observe_upload('${ad.asset_id}')`);
 const job=await broker(db,'select submission_media.claim_job()');assert.equal(job.job_type,'legacy_source_verification');
 await broker(db,`select submission_media.complete_job('${job.job_id}',${job.lease_epoch},'${job.lease_token}','{}','unsupported_format')`);
 assert.equal(await db.scalar(`select managed_master from submission_media.submissions where id='${legacy}'`),'f');
 assert.equal(await db.scalar(`select status from tracks where id='${ids.live}'`),'approved');
}));

test('duplicate new submissions and concurrent Admin/artwork edits remain serializable',()=>run(async db=>{
 await enabled(db);const k=key(),sql=actorSql(ids.a,call('media_create_submission',[k,null]));const rs=await race(db,sql,sql);assert.ok(rs.every(x=>!x.code));assert.equal(JSON.parse(rs[0].out.split('\n').at(-1)).submission_id,JSON.parse(rs[1].out.split('\n').at(-1)).submission_id);
 const s=await submission(db,ids.live),m=await validateMaster(db,s),p=await preview(db,s,m);await review(db,s,m,p);
 const nm=await validateMaster(db,s),np=await preview(db,s,nm);
 const a=await reserve(db,s,'artwork');await upload(db,a.asset_id);const j=await broker(db,'select submission_media.claim_job()');await complete(db,j,{sha256:'e'.repeat(64),actual_bytes:100,container:'png',width:256,height:256,animated:false,build_digest:'sha256:'+'b'.repeat(64)});
 const req=await actor(db,ids.a,call('media_request_master_review',[s,nm,np,await revision(db,s),key()]));const hash=await db.scalar(`select encode(package_hash,'hex') from submission_media.master_reviews where id='${req.review_id}'`);const r=await revision(db,s);
 const outcomes=await race(db,actorSql(ids.admin,`select media_decide_master_review('${req.review_id}',true,'${hash}',${r},'${key()}')`),actorSql(ids.a,call('media_accept_asset',[s,a.asset_id,r,key()])));assert.equal(outcomes.filter(x=>!x.code).length,1);
 assert.equal(await db.scalar(`select status from tracks where id='${ids.live}'`),'approved');
 // Current source and preview remain coherent whichever revision wins.
 assert.equal(await db.scalar(`select current_master_id from submission_media.submissions where id='${s}'`),await db.scalar(`select source_asset_id from submission_media.assets where id=(select current_preview_id from submission_media.submissions where id='${s}')`));
}));
