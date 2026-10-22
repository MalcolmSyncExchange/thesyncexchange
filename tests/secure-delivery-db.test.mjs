import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createHash} from 'node:crypto';
import {database,ids,asActor} from './helpers/artist-baseline-db.mjs';
import {call,terms,financial,buyerParty,usage,acceptQuote} from './helpers/purchase-legal-fixture.mjs';
import {seedDelivery,beginDownload,finishDownload,assetsFor,deliveryAsset} from './helpers/secure-delivery-fixture.mjs';
const withFixture=async(run,options)=>{const db=await database();try{await run(await seedDelivery(db,options));}finally{await db.close();}};
test('PK08 defaults OFF, private audit tables/grants deny all client roles, including service direct reads',async()=>{
 const db=await database();try{
 assert.equal((await db.query('select delivery_enabled from commerce_private.capabilities')).rows[0].delivery_enabled,false);
 for(const role of ['anon','authenticated','service_role']) await asActor(db,ids.buyer,async()=>{
  for(const table of ['license_delivery_sets','delivery_authorizations','delivery_outcomes','delivery_restrictions','delivery_revocations','delivery_tickets','delivery_ticket_redemptions'])
   await assert.rejects(db.query(`select * from commerce_private.${table}`),/permission denied/);
 },role);
 }finally{await db.close();}
});
test('accepted manifest freezes exact per-license asset versions and hash in the existing contract; two variants activate',()=>withFixture(async ctx=>{
 const x=(await ctx.db.query(`select * from commerce_private.contract_context where contract_id='${ctx.contract}'`)).rows[0];
 const a=(await ctx.db.query(`select * from licensing_private.acceptances where order_id='${ctx.order}'`)).rows[0];
 assert.equal(x.purchase_hash,a.snapshot_hash);assert.deepEqual(x.delivery_manifest,a.snapshot.deliveryManifest);
 assert.equal(x.delivery_manifest.length,2);assert.ok(x.delivery_manifest.every(v=>v.sha256&&v.objectVersion&&v.byteSize===100));
 assert.deepEqual(ctx.entitlements.map(e=>e.asset_type),['instrumental','master']);assert.ok(ctx.entitlements.every(e=>e.state==='active'));
 const assets=await assetsFor(ctx);assert.equal(assets.length,2);assert.ok(assets.every(a=>a.available));
 assert.ok(assets.every(a=>!Object.keys(a).some(k=>/path|bucket|snapshot|email/.test(k))));
 const d=await beginDownload(ctx);assert.equal(d.allowed,true);assert.equal(await finishDownload(ctx,d),true);
 assert.deepEqual((await ctx.db.query('select outcome,transfer_completion_observed from commerce_private.delivery_outcomes')).rows,[{outcome:'bytes_prepared',transfer_completion_observed:false}]);
}));
test('unlisted license deliverables and forged entitlement IDs cannot join an accepted purchase',()=>withFixture(async ctx=>{
 await assert.rejects(ctx.db.exec(`insert into order_asset_entitlements(contract_id,order_id,buyer_user_id,asset_version_id,asset_type)
 values('${ctx.contract}','${ctx.order}','${ids.buyer}','${ctx.excluded}','clean')`),/manifest/);
 assert.equal((await beginDownload(ctx,randomUUID(),ids.buyer,randomUUID())).allowed,false);
 assert.equal((await ctx.db.query('select count(*)::int n from order_asset_entitlements')).rows[0].n,2);
}));
test('stems, alternate mixes and supporting materials require their own explicit reviewed license manifest',()=>withFixture(async ctx=>{
 const stems=await deliveryAsset(ctx.db,'stems'),alternate=await deliveryAsset(ctx.db,'alternate'),supporting=await deliveryAsset(ctx.db,'supporting');
 const tier=randomUUID();await ctx.db.exec(`insert into license_types(id,name,slug,code,description,default_price_cents,terms_summary) values('${tier}','Synthetic stems tier','synthetic-stems-tier','synthetic-stems-tier','Synthetic only',5000,'Synthetic only');
 insert into track_license_options(track_id,license_type_id,price_cents,active) values('${ids.live}','${tier}',5000,true)`);
 const offer=await call(ctx.db,'publish_licensing_offer',[ids.admin,ids.live,tier,ctx.review.rights,{...terms,version:'SYNTHETIC-STEM-LICENSE'},financial,'SYNTHETIC optional deliverables']);
 await call(ctx.db,'review_license_deliverables',[ids.admin,offer,[{assetVersionId:stems,label:'Stem bundle'},{assetVersionId:alternate,label:'Alternate mix'},{assetVersionId:supporting,label:'Supporting material'}],'SYNTHETIC explicit optional files']);
 const q=await asActor(ctx.db,ids.buyer,()=>call(ctx.db,'prepare_purchase_quote',[ids.live,tier,buyerParty,usage]));
 const accepted=await acceptQuote(ctx.db,q);
 await call(ctx.db,'prepare_purchase_completion_checkout',[accepted.id,'local','acct_fixture']);
 assert.deepEqual((await ctx.db.query(`select asset_type from order_asset_entitlements where order_id='${accepted.id}' order by asset_type`)).rows.map(x=>x.asset_type),['alternate','stems','supporting']);
 const denied=await call(ctx.db,'begin_asset_download',[ids.buyer,accepted.id,ctx.entitlement,randomUUID(),ctx.session]);assert.equal(denied.allowed,false);
 assert.equal((await beginDownload(ctx)).allowed,true);
}));
test('missing, pending and unpaid entitlements cannot authorize bytes',()=>withFixture(async ctx=>{
 assert.equal((await beginDownload(ctx)).allowed,false);assert.ok((await assetsFor(ctx)).every(a=>!a.available));
 await assert.rejects(ctx.db.exec(`update order_asset_entitlements set state='active' where id='${ctx.entitlement}'`),/prerequisites|payment/i);
},{paid:false}));
test('canonical role changes deny delivery even when the previous buyer still has a session',()=>withFixture(async ctx=>{
 await ctx.db.exec(`update user_profiles set role='artist' where id='${ids.buyer}'`);
 await assert.rejects(beginDownload(ctx),/Canonical buyer/);
 await assert.rejects(assetsFor(ctx),/buyer/i);
}));
test('real session evidence is owner-derived; logout/revocation during preparation denies final release',()=>withFixture(async ctx=>{
 const session=randomUUID();await ctx.db.exec(`insert into auth.sessions(id,user_id) values('${session}','${ids.buyer}')`);
 await assert.rejects(call(ctx.db,'begin_asset_download',[ids.buyer,ctx.order,ctx.entitlement,randomUUID(),null]),/session/);
 const verified=await asActor(ctx.db,ids.buyer,()=>call(ctx.db,'verify_asset_download_session',[]),'authenticated',session);assert.equal(verified,session);
 await asActor(ctx.db,ids.a,()=>assert.rejects(call(ctx.db,'verify_asset_download_session',[]),/session/),'authenticated',session);
 const d=await call(ctx.db,'begin_asset_download',[ids.buyer,ctx.order,ctx.entitlement,randomUUID(),session]);assert.equal(d.allowed,true);
 await ctx.db.exec(`delete from auth.sessions where id='${session}'`);assert.equal(await finishDownload(ctx,d),false);
 assert.equal((await ctx.db.query('select outcome from commerce_private.delivery_outcomes')).rows[0].outcome,'revoked');
}));
test('cross-account access and forged entitlement IDs are denied without disclosing Storage coordinates',()=>withFixture(async ctx=>{
 const other=randomUUID();await ctx.db.exec(`insert into auth.users(id,email) values('${other}','other@fixture.invalid');insert into user_profiles(id,email,role,full_name) values('${other}','other@fixture.invalid','buyer','Other fixture')`);
 await assert.rejects(assetsFor(ctx,other),/unavailable/);
 const otherSession=randomUUID();await ctx.db.exec(`insert into auth.sessions(id,user_id) values('${otherSession}','${other}')`);
 const denied=await call(ctx.db,'begin_asset_download',[other,ctx.order,ctx.entitlement,randomUUID(),otherSession]);assert.deepEqual(denied,{allowed:false,reason:'unavailable'});
 for(const actor of [ids.a,ids.admin])await asActor(ctx.db,actor,()=>assert.rejects(call(ctx.db,'begin_asset_download',[ids.buyer,ctx.order,ctx.entitlement,randomUUID(),ctx.session]),/permission denied/));
 assert.equal((await ctx.db.query("select count(*)::int n from commerce_private.delivery_authorizations where decision='denied'")).rows[0].n,1);
}));
test('duplicate request keys and completed authorizations cannot release bytes twice',()=>withFixture(async ctx=>{
 const key=randomUUID(),d=await beginDownload(ctx,key);
 assert.deepEqual(await beginDownload(ctx,key),{allowed:false,reason:'duplicate_request'});
 assert.equal(await finishDownload(ctx,d),true);assert.equal(await finishDownload(ctx,d),false);
 assert.equal((await ctx.db.query('select count(*)::int n from commerce_private.delivery_authorizations')).rows[0].n,1);
}));
test('large-file ticket stores only a digest, redeems once, and preserves final rights/payment rechecks',()=>withFixture(async ctx=>{
 const d=await beginDownload(ctx),token='c'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
 await call(ctx.db,'create_asset_delivery_ticket',[ids.buyer,d.authorizationId,hash]);
 const stored=(await ctx.db.query('select * from commerce_private.delivery_tickets')).rows[0];assert.equal(stored.token_hash,hash);assert.doesNotMatch(JSON.stringify(stored),new RegExp(token));
 const redeemed=await call(ctx.db,'redeem_asset_delivery_ticket',[hash]);assert.equal(redeemed.allowed,true);assert.equal(redeemed.buyerId,ids.buyer);assert.equal(redeemed.assetVersionId,ctx.master);
 assert.deepEqual(await call(ctx.db,'redeem_asset_delivery_ticket',[hash]),{allowed:false});
 await call(ctx.db,'restrict_order_delivery',[ids.admin,ctx.order,'SYNTHETIC post-ticket restriction']);
 assert.equal(await finishDownload(ctx,d),false);
}));
test('withdrawn rights deny ticket redemption before any Storage access and durably record revocation',()=>withFixture(async ctx=>{
 const d=await beginDownload(ctx),hash='c'.repeat(64);await call(ctx.db,'create_asset_delivery_ticket',[ids.buyer,d.authorizationId,hash]);
 await call(ctx.db,'invalidate_licensing_review',[ids.admin,'evidence',ctx.review.evidence,'disputed','SYNTHETIC disputed authority']);
 assert.deepEqual(await call(ctx.db,'redeem_asset_delivery_ticket',[hash]),{allowed:false});
 assert.equal((await ctx.db.query('select outcome from commerce_private.delivery_outcomes')).rows[0].outcome,'revoked');
}));
test('authenticated scope denials are actor-derived and cannot mint tickets or enumerate real targets',()=>withFixture(async ctx=>{
 await asActor(ctx.db,ids.a,()=>call(ctx.db,'record_asset_access_denial',[randomUUID(),randomUUID(),randomUUID()]));
 const denial=(await ctx.db.query("select actor_id,reason from commerce_private.delivery_authorizations where decision='denied'")).rows[0];assert.equal(denial.actor_id,ids.a);assert.equal(denial.reason,'perimeter_denial');
 await asActor(ctx.db,ids.admin,()=>assert.rejects(call(ctx.db,'redeem_asset_delivery_ticket',['c'.repeat(64)]),/permission denied/));
}));
test('two in-flight transfers per buyer; a completed failure permits a fresh authorization',()=>withFixture(async ctx=>{
 const a=await beginDownload(ctx),b=await beginDownload(ctx);assert.equal(a.allowed,true);assert.equal(b.allowed,true);
 assert.deepEqual(await beginDownload(ctx),{allowed:false,reason:'rate_limited'});
 assert.equal(await finishDownload(ctx,a,'storage_failed'),false);assert.equal((await beginDownload(ctx)).allowed,true);
}));
test('expired authorization records expiry; renewal requires a new checked request',()=>withFixture(async ctx=>{
 const d=await beginDownload(ctx);
 // Disposable owner-only clock fixture. The application cannot edit this row.
 await ctx.db.exec(`alter table commerce_private.delivery_authorizations disable trigger retain_delivery;
 update commerce_private.delivery_authorizations set expires_at=clock_timestamp()-interval '1 second' where id='${d.authorizationId}';
 alter table commerce_private.delivery_authorizations enable trigger retain_delivery`);
 assert.equal(await finishDownload(ctx,d),false);
 assert.equal((await ctx.db.query('select outcome from commerce_private.delivery_outcomes')).rows[0].outcome,'expired');
 assert.equal((await beginDownload(ctx)).allowed,true);
}));
for(const [name,state,type,refund] of [['full refund','REFUNDED','charge.refunded',5000],['partial refund','PARTIALLY_REFUNDED','charge.refunded',1000],['dispute','DISPUTED','charge.dispute.created',0],['failed payment','PAYMENT_FAILED','checkout.session.async_payment_failed',0]]) {
 test(`${name} during Storage I/O denies final delivery, records revocation and preserves accepted evidence`,()=>withFixture(async ctx=>{
  const d=await beginDownload(ctx);const before=(await ctx.db.query(`select snapshot_hash from licensing_private.acceptances where order_id='${ctx.order}'`)).rows[0].snapshot_hash;
  await call(ctx.db,'record_purchase_completion_event',[ctx.order,'acct_fixture','evt_deliveryadverse',type.startsWith('charge.')?null:'cs_test_fixture','pi_fixture',type,state,5000,refund,'USD','b'.repeat(64),'2026-10-22T01:00:00Z']);
  assert.equal(await finishDownload(ctx,d),false);assert.equal((await beginDownload(ctx)).allowed,false);
  assert.equal((await ctx.db.query('select outcome from commerce_private.delivery_outcomes')).rows[0].outcome,'revoked');
  assert.equal((await ctx.db.query('select count(*)::int n from commerce_private.delivery_revocations')).rows[0].n,2);
  assert.equal((await ctx.db.query('select snapshot_hash from licensing_private.acceptances')).rows[0].snapshot_hash,before);
  assert.equal((await ctx.db.query("select count(*)::int n from generated_licenses where status='generated'")).rows[0].n,1);
 }));
}
for(const reason of ['rights','ownership_change','checkout_hold','license','administrative','fixture','asset_retired','capability']) test(`${reason} restriction during download fails the final recheck`,()=>withFixture(async ctx=>{
 const d=await beginDownload(ctx);
 if(reason==='rights')await call(ctx.db,'invalidate_licensing_review',[ids.admin,'evidence',ctx.review.evidence,'revoked','SYNTHETIC withdrawal']);
 if(reason==='ownership_change')await ctx.db.exec(`update rights_holders set name='SYNTHETIC changed ownership' where track_id='${ids.live}'`);
 if(reason==='checkout_hold')await call(ctx.db,'hold_checkout_order',[ctx.order,'dispute']);
 if(reason==='license')await ctx.db.exec(`update order_asset_entitlements set state='revoked',reason_code='license_revoked' where id='${ctx.entitlement}'`);
 if(reason==='administrative')await call(ctx.db,'restrict_order_delivery',[ids.admin,ctx.order,'SYNTHETIC administrative investigation']);
 if(reason==='fixture')await ctx.db.exec(`update commerce_private.qa_fixture_designations set revoked_at=now() where asset_version_id='${ctx.master}'`);
 if(reason==='asset_retired')await ctx.db.exec(`update commerce_private.asset_versions set retired_at=now() where id='${ctx.master}'`);
 if(reason==='capability')await ctx.db.exec('update commerce_private.capabilities set delivery_enabled=false');
 assert.equal(await finishDownload(ctx,d),false);assert.equal((await beginDownload(ctx)).allowed,false);
}));
test('new asset replacement and new reviewed license do not alter an earlier delivery manifest',()=>withFixture(async ctx=>{
 const replacement=await deliveryAsset(ctx.db,'master','replacement');
 const offer=await call(ctx.db,'publish_licensing_offer',[ids.admin,ids.live,ids.license,ctx.review.rights,{...terms,version:'SYNTHETIC-NEXT'},financial,'SYNTHETIC replacement review']);
 await call(ctx.db,'review_license_deliverables',[ids.admin,offer,[{assetVersionId:replacement,label:'Replacement master'}],'SYNTHETIC replacement assets']);
 const old=await beginDownload(ctx);assert.equal(old.allowed,true);assert.equal(old.assetVersionId,ctx.master);
 await assert.rejects(call(ctx.db,'review_license_deliverables',[ids.admin,ctx.review.offer,[],'Late edited review']),/precede/);
 await assert.rejects(ctx.db.exec(`update commerce_private.contract_context set delivery_manifest='[]' where contract_id='${ctx.contract}'`),/immutable/i);
 await assert.rejects(ctx.db.exec(`update storage.objects set version='replacement' where name='${ctx.master}/master'`),/immutable/i);
}));
test('durable audit failure prevents authorization; outcomes and revocation records are append-only',()=>withFixture(async ctx=>{
 await ctx.db.exec("create function commerce_private.fail_delivery_fixture() returns trigger language plpgsql as $$begin raise exception 'synthetic audit outage';end$$;create trigger audit_outage before insert on commerce_private.delivery_authorizations for each row execute function commerce_private.fail_delivery_fixture()");
 await assert.rejects(beginDownload(ctx),/audit outage/);
 await ctx.db.exec('drop trigger audit_outage on commerce_private.delivery_authorizations');
 const d=await beginDownload(ctx);await finishDownload(ctx,d);
 for(const table of ['delivery_authorizations','delivery_outcomes'])await assert.rejects(ctx.db.exec(`delete from commerce_private.${table}`),/immutable/i);
 const audit=await asActor(ctx.db,ids.admin,()=>call(ctx.db,'read_order_delivery_audit',[ctx.order]));assert.equal(audit.attempts.length,1);
 assert.doesNotMatch(JSON.stringify(audit),/purchase-assets|\/master|Bearer|service_role/);
 await asActor(ctx.db,ids.buyer,()=>assert.rejects(call(ctx.db,'read_order_delivery_audit',[ctx.order]),/admin/));
}));
test('private Storage enumeration remains denied even with permissive future policies',()=>withFixture(async ctx=>{
 await ctx.db.exec('create policy future_broad_policy on storage.objects for all to authenticated using(true) with check(true)');
 for(const actor of [ids.buyer,ids.a,ids.admin])await asActor(ctx.db,actor,async()=>assert.equal((await ctx.db.query("select * from storage.objects where bucket_id='purchase-assets'")).rows.length,0));
}));
