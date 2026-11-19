import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {uploadsFixture,create,reserve,observed,ids,asActor,artist,invoke,readyPackage,metadata} from './helpers/music-uploads-fixture.mjs';
const fresh=async fn=>{const db=await uploadsFixture();try{await fn(db);}finally{await db.close();}};
const rev=async(db,s)=>Number((await db.query('select revision from submission_media.submissions where id=$1',[s])).rows[0].revision);
test('own unsubmitted draft deletion is recoverable, audited and idempotent without losing files or financial history',()=>fresh(async db=>{
 const s=await create(db),r=await reserve(db,s);await observed(db,s,r.asset_id);
 const before=(await db.query('select * from submission_media.assets order by id')).rows,jobs=(await db.query('select * from submission_media.jobs order by id')).rows;
 await artist(db,'media_submission_delete',[s,await rev(db,s)]);await artist(db,'media_submission_delete',[s,0]);
 await assert.rejects(artist(db,'media_upload_read',[s]));
 assert.deepEqual((await db.query('select * from submission_media.assets order by id')).rows,before);
 assert.deepEqual((await db.query('select * from submission_media.jobs order by id')).rows,jobs);
 assert.equal((await artist(db,'media_upload_list')).some(d=>d.id===s),false);assert.equal((await artist(db,'media_deleted_draft_list')).find(d=>d.id===s).deleted,true);
 await artist(db,'media_submission_restore',[s]);await artist(db,'media_submission_restore',[s]);
 assert.equal((await artist(db,'media_upload_read',[s])).submission_id,s);
 assert.deepEqual((await db.query('select action from submission_media.draft_lifecycle_events order by id')).rows,[{action:'deleted'},{action:'restored'}]);
 await assert.rejects(db.exec('delete from submission_media.draft_lifecycle_events'));
}));
test('foreign actors, missing revision, submitted catalog entries and stale clients cannot delete drafts',()=>fresh(async db=>{
 const s=await create(db);
 await assert.rejects(asActor(db,ids.b,()=>invoke(db,'media_submission_delete',[s,0])));
 await assert.rejects(artist(db,'media_submission_delete',[s,null]));
 await assert.rejects(artist(db,'media_submission_delete',[s,99]));
 await assert.rejects(asActor(db,ids.b,()=>invoke(db,'media_submission_restore',[s])));
 assert.equal((await db.query('select deleted_at from submission_media.submissions where id=$1',[s])).rows[0].deleted_at,null);
 for(const role of ['anon','service_role','media_broker_do_login'])assert.equal((await db.query("select has_function_privilege($1,'public.media_submission_delete(uuid,bigint)','EXECUTE') allowed",[role])).rows[0].allowed,false);
}));
test('deleted drafts cannot consume DO job reservations and restoring does not reset queued attempts',()=>fresh(async db=>{
 const boot='c6204700-2001-4000-8000-000000000001',digest='sha256:37eaf7342bfbcb1917862d0003be87ef96cc22e935765bd2abb11d6fa44f3876';
 await db.query("update submission_media.do_control set enabled=true,worker_digest=$4,boot_id=$1,broker_digest=$2,allowed_owner=$3,jobs_after=clock_timestamp(),expires_at=clock_timestamp()+interval '1 hour',carry_forward_usd=1,accounting_reconciled=true",[boot,'sha256:'+'d'.repeat(64),ids.a,digest]);
 const s=await create(db),r=await reserve(db,s);await observed(db,s,r.asset_id);await artist(db,'media_submission_delete',[s,await rev(db,s)]);
 await db.query('select submission_media.do_observe($1,0,0)',[boot]);
 const result=(await db.query('select submission_media.do_admit(gen_random_uuid(),$1,$2) v',[boot,digest])).rows[0].v;assert.equal(result.state,'idle');
 assert.equal((await db.query('select count(*)::int n from submission_media.do_runs')).rows[0].n,0);
 assert.equal((await db.query('select attempt from submission_media.jobs where submission_id=$1',[s])).rows[0].attempt,0);
 await artist(db,'media_submission_restore',[s]);
 const issued=(await db.query('select submission_media.do_admit(gen_random_uuid(),$1,$2) v',[boot,digest])).rows[0].v;assert.equal(issued.state,'issued');
 await assert.rejects(artist(db,'media_submission_delete',[s,await rev(db,s)]));
}));

test('submitted and approved catalog submissions remain protected with all package and review records intact',()=>fresh(async db=>{
 const s=await create(db);await readyPackage(db,s);await artist(db,'media_upload_save_metadata',[s,metadata,await rev(db,s),randomUUID()]);await artist(db,'media_upload_submit',[s,await rev(db,s),randomUUID()]);
 const before=(await db.query('select * from submission_media.master_reviews')).rows;await assert.rejects(artist(db,'media_submission_delete',[s,await rev(db,s)]),e=>e.code==='42501');assert.deepEqual((await db.query('select * from submission_media.master_reviews')).rows,before);
 const approved=await create(db,ids.live);await assert.rejects(artist(db,'media_submission_delete',[approved,await rev(db,approved)]),e=>e.code==='42501');
}));

test('repeated delete/restore cycles are bounded and cannot grow the audit ledger without limit',()=>fresh(async db=>{
 const s=await create(db);for(let i=0;i<10;i++){await artist(db,'media_submission_delete',[s,await rev(db,s)]);await artist(db,'media_submission_restore',[s]);}
 await assert.rejects(artist(db,'media_submission_delete',[s,await rev(db,s)]),e=>e.code==='54000');
 assert.equal((await db.query('select count(*)::int n from submission_media.draft_lifecycle_events')).rows[0].n,20);
 assert.equal((await db.query('select deleted_at from submission_media.submissions where id=$1',[s])).rows[0].deleted_at,null);
}));
