import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {database,ids,asActor,quote} from './helpers/artist-baseline-db.mjs';
import {seedDelivery,beginDownload,finishDownload,assetsFor} from './helpers/secure-delivery-fixture.mjs';
import {call} from './helpers/purchase-legal-fixture.mjs';
const fixture=async fn=>{const db=await database();try{await fn(await seedDelivery(db));}finally{await db.close();}};
const status=c=>asActor(c.db,ids.buyer,()=>call(c.db,'delivery_order_status',[c.order]));
const check=(c,a)=>call(c.db,'check_asset_transfer',[ids.buyer,a.authorizationId]);
const record=(c,a,outcome,n=0)=>call(c.db,'record_asset_transfer',[ids.buyer,a.authorizationId,outcome,n]);
const expire=async(c,a)=>c.db.exec(`alter table commerce_private.delivery_authorizations disable trigger retain_delivery;update commerce_private.delivery_authorizations set expires_at=clock_timestamp()-interval '1 second' where id='${a.authorizationId}';alter table commerce_private.delivery_authorizations enable trigger retain_delivery`);
test('System09 default capability remains disabled and new evidence has FORCE RLS, no direct API grants, immutable rows',async()=>{
 const db=await database();try{assert.equal((await db.query('select delivery_enabled from commerce_private.capabilities')).rows[0].delivery_enabled,false);for(const t of ['delivery_transfer_events','delivery_operator_events']){assert.equal((await db.query("select relforcerowsecurity from pg_class where oid=$1::regclass",['commerce_private.'+t])).rows[0].relforcerowsecurity,true);for(const role of ['anon','authenticated','service_role'])await asActor(db,ids.buyer,()=>assert.rejects(db.query('select * from commerce_private.'+t),/permission denied/),role);}}finally{await db.close();}
});
test('expired owner session cannot verify, begin, mint, redeem, finish or stream; active session is a legitimate control',()=>fixture(async c=>{
 await c.db.exec('alter table auth.sessions add column not_after timestamptz');
 const a=await beginDownload(c);assert.equal(a.allowed,true);await call(c.db,'create_asset_delivery_ticket',[ids.buyer,a.authorizationId,'a'.repeat(64)]);
 await c.db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[c.session]);
 await asActor(c.db,ids.buyer,()=>assert.rejects(call(c.db,'verify_asset_download_session',[]),/session/),'authenticated',c.session);
 await assert.rejects(beginDownload(c),/session/);await assert.rejects(call(c.db,'create_asset_delivery_ticket',[ids.buyer,a.authorizationId,'b'.repeat(64)]),/unavailable/);
 assert.deepEqual(await call(c.db,'redeem_asset_delivery_ticket',['a'.repeat(64)]),{allowed:false});assert.equal(await check(c,a),false);
 assert.equal((await c.db.query('select outcome from commerce_private.delivery_outcomes')).rows[0].outcome,'revoked');
 await c.db.query('update auth.sessions set not_after=null where id=$1',[c.session]);assert.equal((await beginDownload(c)).allowed,true);
}));
test('session expiry after bytes prepared denies transfer start and deleted or role-changed session denies ongoing checks',()=>fixture(async c=>{
 await c.db.exec('alter table auth.sessions add column not_after timestamptz');const a=await beginDownload(c);assert.equal(await finishDownload(c,a),true);assert.equal(await check(c,a),true);
 await c.db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[c.session]);assert.equal(await record(c,a,'started'),false);assert.equal(await check(c,a),false);
 await c.db.query('update auth.sessions set not_after=null where id=$1',[c.session]);assert.equal(await record(c,a,'started'),true);
 await c.db.exec(`update user_profiles set role='artist' where id='${ids.buyer}'`);assert.equal(await check(c,a),false);assert.equal(await record(c,a,'stream_exhausted',100),false);
 assert.equal((await c.db.query("select outcome from commerce_private.delivery_transfer_events where phase='finished'")).rows[0].outcome,'revoked');
}));
test('transfer evidence preserves immutable preparation, exact single terminal outcome and never claims buyer receipt',()=>fixture(async c=>{
 const a=await beginDownload(c);await finishDownload(c,a);assert.equal(await record(c,a,'started'),true);assert.equal(await record(c,a,'started'),false);
 await assert.rejects(record(c,a,'stream_exhausted',99),/Invalid/);assert.equal(await record(c,a,'stream_exhausted',100),true);assert.equal(await record(c,a,'stream_exhausted',100),false);
 await assert.rejects(record(c,a,'interrupted',30),/Conflicting/);assert.equal(await check(c,a),false);
 await assert.rejects(c.db.exec('delete from commerce_private.delivery_transfer_events'),/immutable/i);
 const r=await status(c);assert.equal(r.history[0].preparation,'bytes_prepared');assert.equal(r.history[0].transfer,'stream_exhausted');assert.equal(r.history[0].client_receipt_confirmed,false);
 assert.doesNotMatch(JSON.stringify(r),/purchase-assets|object_path|token_hash|session_id|snapshot|Bearer/);
}));
for(const [state,event,refund] of [['REFUNDED','charge.refunded',5000],['PARTIALLY_REFUNDED','charge.refunded',1000],['DISPUTED','charge.dispute.created',0]])test('ongoing delivery stops for '+state+' with original evidence retained',()=>fixture(async c=>{
 const before=(await c.db.query('select snapshot_hash from licensing_private.acceptances')).rows[0].snapshot_hash,a=await beginDownload(c);await finishDownload(c,a);await record(c,a,'started');
 await call(c.db,'record_purchase_completion_event',[c.order,'acct_fixture','evt_system09'+state.replaceAll('_',''),null,'pi_fixture',event,state,5000,refund,'USD','b'.repeat(64),'2026-10-24T01:00:00Z']);assert.equal(await check(c,a),false);assert.equal(await record(c,a,'stream_exhausted',100),false);
 assert.equal((await assetsFor(c)).filter(a=>a.available).length,0);assert.equal((await c.db.query('select snapshot_hash from licensing_private.acceptances')).rows[0].snapshot_hash,before);assert.equal((await c.db.query('select count(*)::int n from generated_licenses')).rows[0].n,1);
}));
for(const command of ['rights','terminate','revoke','missing_object'])test('stream rechecks '+command+' and historical included files stay visible',()=>fixture(async c=>{
 const a=await beginDownload(c);await finishDownload(c,a);await record(c,a,'started');
 if(command==='rights')await call(c.db,'invalidate_licensing_review',[ids.admin,'evidence',c.review.evidence,'revoked','SYNTHETIC withdrawal']);
 if(['terminate','revoke'].includes(command))await asActor(c.db,ids.admin,()=>call(c.db,'license_lifecycle_command',[c.order,0,randomUUID(),command,'SYNTHETIC reviewed termination','SYNTHETIC authority']));
 if(command==='missing_object')await c.db.exec(`alter table storage.objects disable trigger all;delete from storage.objects where name='${c.master}/master';alter table storage.objects enable trigger all`);
 assert.equal(await check(c,a),false);const assets=await assetsFor(c);assert.equal(assets.length,2);assert.equal(assets.find(x=>x.kind==='master').available,false);
 if(command==='missing_object')assert.equal(assets.find(x=>x.kind==='master').availabilityReason,'source_unavailable');
}));
test('interrupted/expired workflow recovers only with fresh authorization and same immutable entitlement',()=>fixture(async c=>{
 const a=await beginDownload(c);await finishDownload(c,a);await record(c,a,'started');await record(c,a,'interrupted',33);assert.equal(await check(c,a),false);
 const b=await beginDownload(c);assert.equal(b.allowed,true);assert.equal(b.assetVersionId,a.assetVersionId);await expire(c,b);
 const key=randomUUID(),args=[c.order,key,'close_expired_attempts','SYNTHETIC interrupted worker investigation','SYNTHETIC review reference'];
 const result=await asActor(c.db,ids.admin,()=>call(c.db,'delivery_admin_action',args));assert.equal(result.closedAttempts,1);assert.deepEqual(await asActor(c.db,ids.admin,()=>call(c.db,'delivery_admin_action',args)),result);
 await asActor(c.db,ids.admin,()=>assert.rejects(call(c.db,'delivery_admin_action',[...args.slice(0,3),'SYNTHETIC different',args[4]]),/Conflicting/));
 const next=await beginDownload(c);assert.equal(next.allowed,true);assert.equal(next.assetVersionId,a.assetVersionId);assert.equal((await status(c)).history.length,3);
}));
test('delivery investigation requires active MFA Admin; buyer scoped history and list/operation privacy are enforced',()=>fixture(async c=>{
 await beginDownload(c);
 for(const actor of [ids.buyer,ids.a])await asActor(c.db,actor,async()=>{await assert.rejects(call(c.db,'delivery_operations',[1,10]),/Admin/);await assert.rejects(call(c.db,'delivery_admin_action',[c.order,randomUUID(),'record_review','SYNTHETIC review','SYNTHETIC evidence']),/Admin/);});
 await asActor(c.db,ids.admin,()=>assert.rejects(call(c.db,'delivery_operations',[1,10]),/Admin/),'authenticated',undefined,'aal1');
 await asActor(c.db,ids.buyer,()=>assert.rejects(call(c.db,'delivery_order_status',[randomUUID()]),/unavailable/));
 const list=await asActor(c.db,ids.admin,()=>call(c.db,'delivery_operations',[1,10]));assert.equal(list.length,1);assert.equal(list[0].history.length,1);
 for(const args of [[1,51],[null,10],[1,null]])await asActor(c.db,ids.admin,()=>assert.rejects(call(c.db,'delivery_operations',args),/Bounded/));
 await asActor(c.db,ids.admin,()=>call(c.db,'delivery_admin_action',[c.order,randomUUID(),'restrict_access','SYNTHETIC source investigation','SYNTHETIC SEC evidence']));assert.equal((await beginDownload(c)).allowed,false);
 const buyer=await status(c);assert.equal(buyer.restricted,true);assert.deepEqual(buyer.operations,[]);assert.doesNotMatch(JSON.stringify(buyer),/SYNTHETIC source investigation|SEC evidence/);
 const admin=await asActor(c.db,ids.admin,()=>call(c.db,'delivery_order_status',[c.order]));assert.equal(admin.operations.length,1);assert.match(admin.operations[0].reason,/source investigation/);
 await assert.rejects(c.db.exec('delete from commerce_private.delivery_operator_events'),/immutable/i);
}));
