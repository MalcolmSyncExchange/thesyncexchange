import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database,ids,asActor,quote,source} from './helpers/artist-baseline-db.mjs';
import {approvedSource,createApprovedSource,ensureSourceReview,sourceHash} from './helpers/immutable-source-fixture.mjs';
import {seedLegalReview,newQuote,acceptQuote,call,terms,financial,claimFixtureAgreement} from './helpers/purchase-legal-fixture.mjs';
import {deliverAsset} from '../services/delivery/transfer.mjs';
import {seedDelivery,beginDownload,finishDownload,deliveryAsset,deliveryBytes} from './helpers/secure-delivery-fixture.mjs';
const fixture=async fn=>{const db=await database();try{await fn(db);}finally{await db.close();}};
const revision=async(db,s)=>Number((await db.query(`select revision from submission_media.submissions where id=${quote(s)}`)).rows[0].revision);
const rows=async(db,t)=>(await db.query(`select count(*)::int n from ${t}`)).rows[0].n;
const trace=(db,order)=>asActor(db,ids.admin,()=>call(db,'read_order_source_chain',[order]));
test('complete canonical submission, technical result, Artist assent, Admin approval, rights, legal, paid issuance and audited delivery lifecycle',()=>fixture(async db=>{
 const c=await seedDelivery(db),d=await beginDownload(c);assert.equal(d.allowed,true);assert.equal(await finishDownload(c,d),true);
 const chain=await trace(db,c.order),p=(await call(db,'read_accepted_purchase',[c.order])).snapshot;
 assert.equal(chain.source.snapshot.masterSha256,sourceHash);assert.equal(chain.source.snapshot.rightsOfferId,c.review.offer);
 assert.equal(chain.source.snapshot.deliverableSources.length,2);assert.equal(chain.license.purchaseHash,chain.purchaseHash);
 assert.equal(chain.verifiedPaymentEvents.length,1);assert.equal(chain.entitlements.filter(n=>n.state==='active').length,2);
 assert.equal(p.sourceEvidence.hash,chain.source.hash);assert.equal(await rows(db,'commerce_private.delivery_outcomes'),1);
 assert.ok(await rows(db,'submission_media.events')>=10);
 assert.doesNotMatch(JSON.stringify(chain),/\/uploads\/|submission-source|lease_token|service_role|object_path|source_path|signedURL/);
}));
test('missing source review blocks a quote without manufacturing provenance',()=>fixture(async db=>{
 const r=await seedLegalReview(db);
 await assert.rejects(asActor(db,ids.buyer,()=>call(db,'prepare_purchase_quote',[ids.live,ids.license,{},{ }])),/party/);
 const {buyerParty,usage}=await import('./helpers/purchase-legal-fixture.mjs');
 await assert.rejects(asActor(db,ids.buyer,()=>call(db,'prepare_purchase_quote',[ids.live,ids.license,buyerParty,usage])),/source evidence/);
 assert.equal(await rows(db,'licensing_private.source_reviews'),0);assert.equal(await rows(db,'orders'),0);
 assert.ok(r.offer);
}));
test('an unreviewed deliverable cannot enter an approved purchase source schedule',()=>fixture(async db=>{
 await db.exec("insert into storage.buckets(id,name,public) values('track-audio','track-audio',false) on conflict do nothing");
 await db.exec('update commerce_private.capabilities set foundation_enabled=true,asset_preparation_enabled=true');
 const r=await seedLegalReview(db),s=await approvedSource(db),a=await deliveryAsset(db,'master','UNLINKED');
 await call(db,'review_license_deliverables',[ids.admin,r.offer,[{assetVersionId:a,label:'Unlinked fixture'}],'SYNTHETIC manifest']);
 await assert.rejects(call(db,'review_purchase_source',[ids.admin,r.offer,s.submission,await revision(db,s.submission),'SYNTHETIC source review']),/source link/);
 await assert.rejects(call(db,'link_approved_delivery_source',[ids.admin,a,s.submission,s.master,'SYNTHETIC forged master link']),/must match/);
}));
test('stale submission revision and cross-track/submission links fail closed',()=>fixture(async db=>{
 const r=await seedLegalReview(db),s=await approvedSource(db);
 await assert.rejects(call(db,'review_purchase_source',[ids.admin,r.offer,s.submission,0,'SYNTHETIC stale review']),/revision/);
 await assert.rejects(call(db,'review_purchase_source',[ids.admin,r.offer,randomUUID(),0,'SYNTHETIC foreign submission']),/no rows/);
}));
for(const point of ['before_acceptance','before_provider','before_issuance'])test(`master replacement ${point} rejects stale purchase and retains the original evidence`,()=>fixture(async db=>{
 const q=await newQuote(db),s=await approvedSource(db);const order=point==='before_acceptance'?null:await acceptQuote(db,q);
 const replacement=await createApprovedSource(db,s.submission);assert.notEqual(replacement.master,s.master);
 if(!order)await assert.rejects(acceptQuote(db,q),/changed incompatibly/);
 else {
  await assert.rejects(call(db,'assert_accepted_purchase',[order.id]),/changed incompatibly/);
  assert.equal((await call(db,'read_accepted_purchase',[order.id])).snapshot.sourceEvidence.snapshot.masterId,s.master);
  if(point==='before_issuance')await assert.rejects(claimFixtureAgreement(db,order.id),/changed incompatibly/);
 }
 assert.equal(await rows(db,'generated_licenses'),0);
}));
test('replacement after issuance keeps original source bytes, legal hash and entitlements',()=>fixture(async db=>{
 const c=await seedDelivery(db),s=await approvedSource(db),before=await call(db,'read_accepted_purchase',[c.order]);
 const replacement=await createApprovedSource(db,s.submission);assert.notEqual(replacement.master,s.master);
 assert.deepEqual(await call(db,'read_accepted_purchase',[c.order]),before);
 const d=await beginDownload(c);assert.equal(d.allowed,true);assert.equal(d.assetVersionId,c.master);assert.equal(await finishDownload(c,d),true);
 assert.equal((await trace(db,c.order)).license.purchaseHash,before.hash);
}));
test('catalog title edit and revert cannot revive pending review; historical schedule remains exact',()=>fixture(async db=>{
 const q=await newQuote(db),o=await acceptQuote(db,q),before=await call(db,'read_accepted_purchase',[o.id]);
 await db.exec(`update tracks set title='Edited' where id='${ids.live}';update tracks set title='live' where id='${ids.live}'`);
 await assert.rejects(call(db,'assert_accepted_purchase',[o.id]),/changed incompatibly/);assert.deepEqual(await call(db,'read_accepted_purchase',[o.id]),before);
}));
test('metadata edit after issuance preserves original catalog and legal evidence',()=>fixture(async db=>{
 const c=await seedDelivery(db),before=await call(db,'read_accepted_purchase',[c.order]);
 await db.exec(`update tracks set title='Later title',genre='Later genre' where id='${ids.live}'`);
 assert.equal((await beginDownload(c)).allowed,true);assert.deepEqual(await call(db,'read_accepted_purchase',[c.order]),before);
}));
for(const reason of ['rights','catalog','source_restriction','source_unavailable'])test(`${reason} changes between download admission and release deny delivery and preserve issued records`,()=>fixture(async db=>{
 const c=await seedDelivery(db),d=await beginDownload(c),before=await call(db,'read_accepted_purchase',[c.order]);
 if(reason==='rights')await call(db,'invalidate_licensing_review',[ids.admin,'evidence',c.review.evidence,'disputed','SYNTHETIC rights dispute']);
 if(reason==='catalog')await db.exec(`update tracks set status='rejected' where id='${ids.live}'`);
 if(reason==='source_restriction')await call(db,'restrict_purchase_source',[ids.admin,before.snapshot.sourceEvidence.id,'SYNTHETIC source investigation']);
 // Bucket visibility models an external availability/configuration discrepancy;
 // original object deletion and replacement are separately rejected below.
 if(reason==='source_unavailable')await db.exec("update storage.buckets set public=true where id='submission-source'");
 assert.equal(await finishDownload(c,d),false);assert.equal((await beginDownload(c)).allowed,false);
 assert.deepEqual(await call(db,'read_accepted_purchase',[c.order]),before);assert.equal(await rows(db,'generated_licenses'),1);
}));
test('source links, reviews, validated objects and historical evidence cannot be rewritten or deleted',()=>fixture(async db=>{
 const c=await seedDelivery(db),s=await approvedSource(db);
 for(const t of ['source_reviews','source_asset_links','source_status_events']) {
  if(t==='source_status_events')await call(db,'restrict_purchase_source',[ids.admin,(await trace(db,c.order)).source.id,'SYNTHETIC retained event']);
  await assert.rejects(db.exec(`delete from licensing_private.${t}`),/immutable|retained/i);
 }
 await assert.rejects(db.exec(`update licensing_private.source_reviews set snapshot='{}'`),/immutable/i);
 await assert.rejects(db.exec(`update submission_media.assets set sha256=decode('${'f'.repeat(64)}','hex') where id='${s.master}'`),/immutable/i);
 await assert.rejects(db.exec(`delete from storage.objects where id=(select storage_object_id from submission_media.assets where id='${s.master}')`),/foreign key|retained|immutable/i);
}));
test('API roles cannot read or mutate private provenance; only canonical Admin can read the chain',()=>fixture(async db=>{
 const c=await seedDelivery(db),s=await approvedSource(db);
 for(const role of ['anon','authenticated','service_role','submission_media_broker'])for(const t of ['source_revisions','source_reviews','source_asset_links','source_status_events']) {
  assert.equal((await db.query(`select has_table_privilege('${role}','licensing_private.${t}','select') ok`)).rows[0].ok,false);
  await assert.rejects(asActor(db,ids.buyer,()=>db.query(`select * from licensing_private.${t}`),role),/permission/);
 }
 for(const user of [ids.a,ids.b,ids.buyer])await assert.rejects(asActor(db,user,()=>call(db,'read_order_source_chain',[c.order])),/admin/);
 await assert.rejects(asActor(db,ids.buyer,()=>call(db,'reserve_approved_source_delivery',[ids.admin,s.submission,s.master])),/permission/);
 await assert.rejects(call(db,'reserve_approved_source_delivery',[ids.buyer,s.submission,s.master]),/admin/);
 assert.ok(await trace(db,c.order));
}));
for(const state of ['PAYMENT_FAILED','PARTIALLY_REFUNDED','REFUNDED','DISPUTED'])test(`${state}, duplicate adverse events and late success cannot detach entitlements from immutable source evidence`,()=>fixture(async db=>{
 const c=await seedDelivery(db),before=await call(db,'read_accepted_purchase',[c.order]);
 const event=[c.order,'acct_fixture','evt_pk04'+state.replaceAll('_',''),state==='PAYMENT_FAILED'?'cs_test_fixture':null,'pi_fixture',state==='DISPUTED'?'charge.dispute.created':state.includes('REFUND')?'charge.refunded':'checkout.session.async_payment_failed',state,5000,state==='REFUNDED'?5000:state==='PARTIALLY_REFUNDED'?500:0,'USD','f'.repeat(64),'2026-10-22T02:00:00Z'];
 await call(db,'record_purchase_completion_event',event);await call(db,'record_purchase_completion_event',event);
 await call(db,'record_purchase_completion_event',[c.order,'acct_fixture','evt_pk04late','cs_test_fixture','pi_fixture','checkout.session.completed','PAID',5000,0,'USD','e'.repeat(64),'2026-10-22T03:00:00Z']);
 assert.equal((await beginDownload(c)).allowed,false);assert.deepEqual(await call(db,'read_accepted_purchase',[c.order]),before);assert.equal(await rows(db,'generated_licenses'),1);
}));
test('unpaid workflow cannot issue, while interrupted delivery retains one source/purchase/license and can retry safely',()=>fixture(async db=>{
 const c=await seedDelivery(db,{paid:false});assert.equal((await beginDownload(c)).allowed,false);
 await assert.rejects(call(db,'claim_order_agreement_job',[c.order]),/paid|payment/i);assert.equal(await rows(db,'generated_licenses'),0);
}));
test('Storage failure and duplicate authorization outcome cannot mutate or replace the issued source',()=>fixture(async db=>{
 const c=await seedDelivery(db),before=await trace(db,c.order),d=await beginDownload(c);
 assert.equal(await finishDownload(c,d,'storage_failed'),false);const retry=await beginDownload(c);assert.equal(retry.allowed,true);assert.equal(await finishDownload(c,retry),true);assert.equal(await finishDownload(c,retry),false);
 assert.equal((await trace(db,c.order)).source.hash,before.source.hash);assert.equal(await rows(db,'generated_licenses'),1);
}));
test('PK04 reuses canonical media and preserves exact PK07/03/06/08 guards and OIDs',()=>{
 const sql=source('supabase/migrations/20261022191602_immutable_source_integration.sql');assert.doesNotMatch(sql,/create table.*(assets|submissions)\s*\(/i);
 assert.match(sql,/create or replace function licensing_private.assert_purchase/);assert.match(sql,/Verified payment required for legal issuance/);assert.match(sql,/create trigger zz_freeze_source_quote/);
 assert.doesNotMatch(sql,/create policy.*storage\.objects|alter table storage\.|update.*capabilities|delete from/i);
});

test('actual delivery handler returns only hash-verified licensed bytes after database authorization and final recheck',()=>fixture(async db=>{
 const c=await seedDelivery(db);
 const response=await deliverAsset(new Request('http://localhost/download',{method:'POST',headers:{origin:'http://localhost'}}),c.order,c.entitlement,{
  appOrigin:'http://localhost',randomUUID,authenticate:async()=>{await asActor(db,ids.buyer,()=>call(db,'verify_asset_download_session',[]),'authenticated',c.session);return {id:ids.buyer,role:'buyer'};},
  ownsOrder:async buyer=>asActor(db,buyer,async()=>Boolean((await db.query(`select id from orders where id='${c.order}'`)).rows.length)),
  deny:async()=>{throw Error('Unexpected denial');},begin:async(_b,_o,_e,key)=>beginDownload(c,key),
  read:async()=>deliveryBytes,finish:async(_b,id,outcome)=>finishDownload(c,{authorizationId:id},outcome)
 });
 assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),deliveryBytes);
 assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(await rows(db,'commerce_private.delivery_outcomes'),1);
}));

test('source-copy SQL rejects forged hashes and browser roles before a new version can be sealed',()=>fixture(async db=>{
 await db.exec('update commerce_private.capabilities set foundation_enabled=true,asset_preparation_enabled=true');const s=await approvedSource(db);
 const id=await call(db,'reserve_approved_source_delivery',[ids.admin,s.submission,s.master]);
 await assert.rejects(call(db,'seal_approved_master_copy',[ids.admin,id,'f'.repeat(64),100,'audio/wav','Synthetic review']),/Verified approved/);
 for(const role of ['anon','authenticated'])for(const command of ['read_approved_master_copy','seal_approved_master_copy']) {
  const args=command==='read_approved_master_copy'?[ids.admin,id]:[ids.admin,id,sourceHash,100,'audio/wav','Synthetic review'];
  await assert.rejects(asActor(db,ids.buyer,()=>call(db,command,args),role),/permission/);
 }
 assert.equal((await db.query(`select state from commerce_private.asset_versions where id='${id}'`)).rows[0].state,'pending');
}));

test('generic upload MIME does not replace the technically validated canonical delivery format',()=>fixture(async db=>{
 await db.exec('update commerce_private.capabilities set foundation_enabled=true,asset_preparation_enabled=true');
 const s=await createApprovedSource(db,null,{mime:'application/octet-stream'});
 const id=await call(db,'reserve_approved_source_delivery',[ids.admin,s.submission,s.master]);
 const copy=await call(db,'read_approved_master_copy',[ids.admin,id]);assert.equal(copy.mimeType,'audio/wav');assert.equal(copy.sha256,sourceHash);
}));
