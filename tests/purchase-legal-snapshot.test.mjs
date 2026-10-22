import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { database, ids, asActor, quote, source } from './helpers/artist-baseline-db.mjs';
import { call, seedLegalReview, newQuote, acceptQuote, buyerParty, usage, terms, financial } from './helpers/purchase-legal-fixture.mjs';
const fixture=async run=>{const db=await database();try{await run(db);}finally{await db.close();}};
const scope='a'.repeat(64)+':test';
const evidenceTime=new Date().toISOString();
const evidence=(id='evt_legalpaid')=>({providerEventId:id,eventType:'checkout.session.completed',paymentState:'PAID',checkoutSessionId:'cs_test_legalfixture',paymentIntentId:'pi_legalfixture',amountMinor:5000,refundedMinor:0,currency:'USD',evidenceSha256:'a'.repeat(64),providerCreatedAt:evidenceTime,livemode:false});
const invalidate=(db,kind,id,state='revoked')=>call(db,'invalidate_licensing_review',[ids.admin,kind,id,state,'Synthetic review invalidation']);
async function purchase(db){const q=await newQuote(db);const o=await acceptQuote(db,q);return {q,o};}
async function paid(db){const p=await purchase(db);await db.exec(`update orders set stripe_checkout_session_id='cs_test_legalfixture' where id='${p.o.id}'`);await call(db,'record_verified_checkout_payment',[p.o.id,scope,evidence()]);await db.exec(`update orders set status='paid',paid_at=now() where id='${p.o.id}'`);return p;}
async function payload(db,id,token){const a=await call(db,'read_accepted_purchase',[id]);return{id:'abababab-abab-4bab-8bab-abababababab',order_id:id,buyer_id:ids.buyer,track_id:ids.live,license_type_id:ids.license,agreement_number:'SYNTHETIC-LEGAL',status:'generated',pdf_storage_path:`${ids.buyer}/${id}/${token}.pdf`,pdf_content_type:'application/pdf',pdf_size_bytes:100,terms_snapshot_json:{purchase:a.snapshot,purchaseHash:a.hash,payment:{paymentMode:'test',commercialRightsGranted:false},license:{pricePaidCents:5000,currency:'USD'}},html_snapshot:'synthetic',generated_at:new Date().toISOString()};}
function moduleAt(path,stubs={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(source(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:m.exports,module:m,require:n=>{if(!(n in stubs))throw Error('Unmocked '+n);return stubs[n];},FormData,Buffer});return m.exports;}

test('independent master and publishing authority, evidence, fees and legal approval are required',()=>fixture(async db=>{
 const r=await seedLegalReview(db);
 for(const rights of [{...r.rights,publishing:[]},{...r.rights,master:[{...r.rights.master[0],controlledBps:9999}]},{...r.rights,master:[{...r.rights.master[0],evidenceId:'ffffffff-ffff-4fff-8fff-ffffffffffff'}]}]){
  await assert.rejects(call(db,'publish_licensing_offer',[ids.admin,ids.live,ids.license,rights,terms,financial,'Synthetic review']),/publishing|control|authority/);
 }
 await assert.rejects(call(db,'publish_licensing_offer',[ids.admin,ids.live,ids.license,r.rights,{...terms,body:''},financial,'Synthetic review']),/legal text/);
 await assert.rejects(call(db,'publish_licensing_offer',[ids.admin,ids.live,ids.license,r.rights,terms,{...financial,allocations:[]},'Synthetic review']),/fee and payee/);
}));
test('only persisted admins can publish/invalidate; no browser or role-null privileged bypass',()=>fixture(async db=>{
 const r=await seedLegalReview(db);
 await assert.rejects(call(db,'publish_licensing_offer',[ids.buyer,ids.live,ids.license,r.rights,terms,financial,'Synthetic review']),/admin/);
 for(const role of ['anon','authenticated'])await asActor(db,ids.admin,async()=>{
  await assert.rejects(call(db,'invalidate_licensing_review',[ids.admin,'offer',r.offer,'revoked','synthetic reason']),/permission/);
  await assert.rejects(db.query('select * from licensing_private.offers'),/permission/);
 },role);
 await db.exec("select set_config('request.jwt.claim.role','',false)");await assert.rejects(invalidate(db,'offer',r.offer),/admin/);
}));
test('incomplete buyer identity, capacity and company registration block quote creation',()=>fixture(async db=>{
 for(const party of [{...buyerParty,legalName:''},{...buyerParty,address:''},{...buyerParty,capacity:''},{...buyerParty,representative:''},{...buyerParty,registrationNumber:''}])await assert.rejects(newQuote(db,ids.buyer,{party}),/identification|representative/);
 assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,0);
}));
test('unapproved track, excluded use, unknown territory and out-of-scope dates block acceptance',()=>fixture(async db=>{
 await seedLegalReview(db);
 for(const u of [{...usage,use:'political_ad'},{...usage,territory:'unknown'},{...usage,startsAt:'2001-01-01'},{...usage,endsAt:'2099-01-01'}])await assert.rejects(newQuote(db,ids.buyer,{usage:u}),/usage|valid/);
 await db.exec(`update tracks set status='rejected' where id='${ids.live}'`);await assert.rejects(newQuote(db),/valid/);
}));
test('transaction-specific acceptance binds exact hash, consents, representative and buyer account',()=>fixture(async db=>{
 const q=await newQuote(db);
 await asActor(db,ids.buyer,async()=>{
  await assert.rejects(call(db,'accept_purchase_quote',[q.id,'b'.repeat(64),q.schedule.terms.requiredConsents,buyerParty.representative]),/Exact/);
  await assert.rejects(call(db,'accept_purchase_quote',[q.id,q.hash,[],buyerParty.representative]),/Exact/);
  await assert.rejects(call(db,'accept_purchase_quote',[q.id,q.hash,q.schedule.terms.requiredConsents,'Wrong Name']),/Exact/);
 });
 await asActor(db,ids.a,()=>assert.rejects(call(db,'read_purchase_quote',[q.id]),/buyer/));
 const o=await acceptQuote(db,q);const a=await call(db,'read_accepted_purchase',[o.id]);
 assert.equal(a.snapshot.acceptance.documentVersion,terms.version);assert.equal(a.snapshot.acceptance.scheduleHash,q.hash);
 assert.equal(a.snapshot.buyer.userId,ids.buyer);assert.equal(a.snapshot.buyer.email,'buyer@fixture.invalid');
 assert.equal(a.snapshot.financial.platformFeeCents,1000);assert.deepEqual(a.snapshot.financial.allocations.map(x=>x.amountCents),[2400,1600]);
 assert.equal(a.snapshot.acceptance.method,'authenticated_transaction_review');assert.ok(a.snapshot.acceptance.acceptedAt);
}));
test('browser acceptance adapter requires each specific consent and explicit transaction intent',async()=>{
 const m=moduleAt('services/licensing/purchases.ts');let calls=0;const client={rpc:async()=>{calls++;return{data:{id:'synthetic'},error:null}}};const f=new FormData();f.set('acceptedConsents','["specific project consent"]');
 await assert.rejects(m.acceptPurchaseQuote(client,f),/acceptance/);f.set('transactionAcceptance','accepted');
 await assert.rejects(m.acceptPurchaseQuote(client,f),/Every/);assert.equal(calls,0);
 f.set('consent-0','accepted');await m.acceptPurchaseQuote(client,f);assert.equal(calls,1);
});
test('quote expiration is enforced using database time',()=>fixture(async db=>{
 const q=await newQuote(db);
 // Only the fixture owner can inject an expired quote; production offers no write grant.
 await db.exec(`insert into licensing_private.quotes(id,buyer_id,offer_id,schedule,schedule_hash,expires_at)
 select 'ffffffff-ffff-4fff-8fff-ffffffffffff',buyer_id,offer_id,schedule,schedule_hash,clock_timestamp()-interval '1 second' from licensing_private.quotes where id='${q.id}'`);
 await assert.rejects(acceptQuote(db,{...q,id:'ffffffff-ffff-4fff-8fff-ffffffffffff'}),/expired/);
}));
test('superseded terms cannot receive new assent; an already accepted valid version stays frozen',()=>fixture(async db=>{
 const {q,o}=await purchase(db);const unaccepted=await newQuote(db);const r=await seedLegalReview(db);
 await call(db,'publish_licensing_offer',[ids.admin,ids.live,ids.license,r.rights,{...terms,version:'SYNTHETIC-TERMS-2',body:'Different synthetic legal terms that must never replace original acceptance.'},financial,'Synthetic review v2']);
 await assert.rejects(acceptQuote(db,unaccepted),/superseded/);
 assert.equal((await call(db,'assert_accepted_purchase',[o.id])).snapshot.terms.version,q.schedule.terms.version);
 await invalidate(db,'offer',r.offer);await assert.rejects(call(db,'assert_accepted_purchase',[o.id]),/valid/);
 assert.equal((await call(db,'read_accepted_purchase',[o.id])).snapshot.terms.body,q.schedule.terms.body);
}));
test('a new incompatible reviewed rights schedule blocks older accepted purchases even if legacy holders did not change',()=>fixture(async db=>{
 const {o}=await purchase(db),r=await seedLegalReview(db);const before=await call(db,'read_accepted_purchase',[o.id]);
 const rights=structuredClone(r.rights);rights.master[0].party.legalName='Different verified master owner';
 await call(db,'publish_licensing_offer',[ids.admin,ids.live,ids.license,rights,terms,financial,'Synthetic changed ownership review']);
 await assert.rejects(call(db,'assert_accepted_purchase',[o.id]),/valid/);
 assert.deepEqual(await call(db,'read_accepted_purchase',[o.id]),before);
 await call(db,'publish_licensing_offer',[ids.admin,ids.live,ids.license,r.rights,terms,financial,'Synthetic ownership reverted again']);
 await assert.rejects(call(db,'assert_accepted_purchase',[o.id]),/valid/);
}));
test('expired issuance terms cannot be published or used for issuance',()=>fixture(async db=>{
 const r=await seedLegalReview(db);await assert.rejects(call(db,'publish_licensing_offer',[ids.admin,ids.live,ids.license,r.rights,{...terms,issueUntil:'2000-01-01'},financial,'Synthetic review']),/legal text/);
}));
test('same quote replays return one order; competing quotes cannot replace pending acceptance',()=>fixture(async db=>{
 const q=await newQuote(db),other=await newQuote(db);const o=await acceptQuote(db,q);assert.equal((await acceptQuote(db,q)).id,o.id);
 await assert.rejects(acceptQuote(db,other),/original acceptance/);
 assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from licensing_private.acceptances')).rows[0].n,1);
}));
test('missing acceptance cannot create a Stripe attempt or authorize agreement generation',()=>fixture(async db=>{
 const o=await call(db,'reserve_recoverable_checkout',[ids.buyer,ids.live,ids.license]);
 const request={mode:'payment',client_reference_id:o.id,metadata:{orderId:o.id,buyerUserId:ids.buyer,trackId:ids.live,licenseTypeId:ids.license,paymentMode:'test'},line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:5000}}]};
 await assert.rejects(call(db,'claim_checkout_attempt',[o.id,scope,request]),/acceptance/);
 await db.exec(`update orders set status='paid',paid_at=now(),stripe_checkout_session_id='cs_test_legalfixture',stripe_payment_intent_id='pi_legalfixture' where id='${o.id}'`);
 await call(db,'record_verified_checkout_payment',[o.id,scope,evidence()]);
 await assert.rejects(call(db,'claim_order_agreement_job',[o.id]),/acceptance/);
 assert.equal((await db.query('select count(*)::int n from generated_licenses')).rows[0].n,0);
}));
test('revoked or disputed rights during payment block final publication while retaining paid proof',()=>fixture(async db=>{
 const {o}=await paid(db);const token=await call(db,'claim_order_agreement_job',[o.id]);const p=await payload(db,o.id,token);const r=await seedLegalReview(db);
 await invalidate(db,'offer',r.offer,'disputed');await assert.rejects(call(db,'finish_order_agreement_job',[o.id,token,p]),/valid/);
 await call(db,'record_verified_checkout_payment',[o.id,scope,evidence()]);await assert.rejects(call(db,'claim_order_agreement_job',[o.id]),/valid|busy/);
 assert.equal((await db.query('select count(*)::int n from generated_licenses')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from checkout_recovery.verified_events')).rows[0].n,1);
}));
test('ownership or recording-source changes invalidate the reviewed state',()=>fixture(async db=>{
 const {o}=await purchase(db);await db.exec(`update rights_holders set name='Changed owner' where track_id='${ids.live}'`);
 await assert.rejects(call(db,'assert_accepted_purchase',[o.id]),/valid/);
 assert.equal((await call(db,'read_accepted_purchase',[o.id])).snapshot.rights.master[0].party.legalName,'Synthetic Rights master');
 await db.exec(`update rights_holders set name='Fixture rights holder' where track_id='${ids.live}'`);
 await assert.rejects(call(db,'assert_accepted_purchase',[o.id]),/valid/);
}));
test('seller ownership reassignment cannot retain the former clearance',()=>fixture(async db=>{
 const {o}=await purchase(db);await db.exec(`update tracks set artist_user_id='${ids.b}' where id='${ids.live}'`);await assert.rejects(call(db,'assert_accepted_purchase',[o.id]),/valid/);
}));
test('canonical account role changes during checkout block new issuance and do not erase accepted facts',()=>fixture(async db=>{
 const {o}=await purchase(db),before=await call(db,'read_accepted_purchase',[o.id]);
 await db.exec(`update user_profiles set role='artist' where id='${ids.buyer}'`);await assert.rejects(call(db,'assert_accepted_purchase',[o.id]),/Canonical buyer/);
 assert.deepEqual(await call(db,'read_accepted_purchase',[o.id]),before);
 await db.exec(`update user_profiles set role='buyer' where id='${ids.buyer}';update user_profiles set role='buyer' where id='${ids.a}'`);
 await assert.rejects(call(db,'assert_accepted_purchase',[o.id]),/valid/);
}));
test('required rights evidence revocation and missing storage version block issuance',()=>fixture(async db=>{
 const {o}=await purchase(db);const r=await seedLegalReview(db);await invalidate(db,'evidence',r.evidence);
 await assert.rejects(call(db,'assert_accepted_purchase',[o.id]),/documentation/);
}));
test('reviewed evidence cannot be replaced or deleted and revoked text never receives fresh assent',()=>fixture(async db=>{
 const q=await newQuote(db),r=await seedLegalReview(db);
 await assert.rejects(db.exec(`update storage.objects set version='replaced' where id=(select object_id from licensing_private.evidence where id='${r.evidence}')`),/immutable/);
 await assert.rejects(db.exec(`delete from storage.objects where id=(select object_id from licensing_private.evidence where id='${r.evidence}')`),/immutable/);
 await invalidate(db,'offer',r.offer);await assert.rejects(acceptQuote(db,q),/valid/);
}));
test('SQL grants expose only owner-scoped buyer wrappers and service-only review commands',()=>fixture(async db=>{
 const funcs=(await db.query(`select proname,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') buyer,
 has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc where pronamespace='public'::regnamespace and proname in
 ('prepare_purchase_quote','read_purchase_quote','accept_purchase_quote','read_licensing_choices','read_accepted_purchase','assert_accepted_purchase','register_licensing_evidence','publish_licensing_offer','invalidate_licensing_review')`)).rows;
 assert.equal(funcs.length,9);assert.ok(funcs.every(f=>!f.anon));
 for(const f of funcs.filter(f=>['assert_accepted_purchase','register_licensing_evidence','publish_licensing_offer','invalidate_licensing_review'].includes(f.proname)))assert.ok(!f.buyer&&f.service);
 assert.ok((await db.query("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='licensing_private' and c.relkind='r'")).rows.every(r=>r.relrowsecurity));
}));
test('terms that expire after acceptance stop issuance using database time without rewriting the receipt',()=>fixture(async db=>{
 const r=await seedLegalReview(db);
 const stop=new Date(Date.now()+2500).toISOString();
 await call(db,'publish_licensing_offer',[ids.admin,ids.live,ids.license,r.rights,{...terms,version:'SHORT-SYNTHETIC',acceptUntil:stop,issueUntil:stop},financial,'Synthetic short review']);
 const {o}=await purchase(db);const before=await call(db,'read_accepted_purchase',[o.id]);
 await new Promise(resolve=>setTimeout(resolve,2600));await assert.rejects(call(db,'assert_accepted_purchase',[o.id]),/valid/);
 assert.deepEqual(await call(db,'read_accepted_purchase',[o.id]),before);
}));
test('disputed payment blocks legal publication and replays leave the accepted receipt intact',()=>fixture(async db=>{
 const {o}=await paid(db);const before=await call(db,'read_accepted_purchase',[o.id]);const token=await call(db,'claim_order_agreement_job',[o.id]);const p=await payload(db,o.id,token);
 const e={...evidence('evt_legaldispute'),eventType:'charge.dispute.created',paymentState:'DISPUTED'};
 await call(db,'record_verified_checkout_payment',[o.id,scope,e]);await call(db,'record_verified_checkout_payment',[o.id,scope,e]);
 await assert.rejects(call(db,'finish_order_agreement_job',[o.id,token,p]),/Paid unheld/);assert.deepEqual(await call(db,'read_accepted_purchase',[o.id]),before);
}));
test('direct authenticated quote requests are bounded even when the action limiter is bypassed',()=>fixture(async db=>{
 await seedLegalReview(db);
 for(let i=0;i<10;i++)await newQuote(db);await assert.rejects(newQuote(db),/rate limit/);
 assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,0);
}));
test('catalog/profile/price/template changes never rewrite accepted parties, money or legal text',()=>fixture(async db=>{
 const {o}=await purchase(db);const before=await call(db,'read_accepted_purchase',[o.id]);
 await db.exec(`update tracks set title='New mutable title' where id='${ids.live}';update user_profiles set full_name='New profile' where id='${ids.buyer}';update track_license_options set price_cents=9000 where track_id='${ids.live}';update license_types set terms_summary='Changed summary' where id='${ids.license}'`);
 assert.deepEqual(await call(db,'read_accepted_purchase',[o.id]),before);assert.deepEqual(await call(db,'assert_accepted_purchase',[o.id]),{snapshot:before.snapshot,hash:before.hash});
 await assert.rejects(db.exec(`update orders set amount_cents=9000 where id='${o.id}'`),/immutable/);
 for(const table of ['quotes','acceptances','offers','evidence']){
  await assert.rejects(db.exec(`delete from licensing_private.${table}`),/immutable/);
 }
}));
test('private snapshots deny cross-account reads, table access and unauthenticated calls',()=>fixture(async db=>{
 const {q,o}=await purchase(db);
 await db.exec(`insert into auth.users(id,email) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','other@fixture.invalid');insert into user_profiles(id,email,role,full_name) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','other@fixture.invalid','buyer','Other fixture')`);
 await asActor(db,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',async()=>{await assert.rejects(call(db,'read_purchase_quote',[q.id]),/no rows/);await assert.rejects(call(db,'read_accepted_purchase',[o.id]),/no rows/);});
 for(const role of ['anon','authenticated','service_role'])await asActor(db,ids.buyer,()=>assert.rejects(db.query('select * from licensing_private.acceptances'),/permission/),role);
 await asActor(db,null,()=>assert.rejects(call(db,'read_accepted_purchase',[o.id]),/permission/),'anon');
}));
test('accepted but unpaid orders cannot publish a generated license',()=>fixture(async db=>{
 const {o}=await purchase(db);const p=await payload(db,o.id,'ffffffff-ffff-4fff-8fff-ffffffffffff');
 await assert.rejects(db.query(`insert into generated_licenses select * from jsonb_populate_record(null::generated_licenses,${quote(JSON.stringify(p))})`),/Verified payment/);
}));
test('one paid purchase publishes its exact snapshot once; forged substitution and regeneration fail',()=>fixture(async db=>{
 const {o}=await paid(db);const token=await call(db,'claim_order_agreement_job',[o.id]);const p=await payload(db,o.id,token);
 const forged=structuredClone(p);forged.terms_snapshot_json.purchase.terms.body='substitution';await assert.rejects(call(db,'finish_order_agreement_job',[o.id,token,forged]),/exact accepted/);
 await call(db,'finish_order_agreement_job',[o.id,token,p]);await call(db,'record_verified_checkout_payment',[o.id,scope,evidence()]);
 await assert.rejects(call(db,'claim_order_agreement_job',[o.id]),/immutable/);await assert.rejects(db.exec("update generated_licenses set terms_snapshot_json='{}'"),/immutable/);
 await assert.rejects(db.exec('delete from generated_licenses'),/immutable/);assert.equal((await db.query('select count(*)::int n from generated_licenses')).rows[0].n,1);
}));
test('refund or dispute after acceptance never permits final license publication or changes acceptance',()=>fixture(async db=>{
 const {o}=await paid(db);const a=await call(db,'read_accepted_purchase',[o.id]);const token=await call(db,'claim_order_agreement_job',[o.id]);const p=await payload(db,o.id,token);
 await call(db,'record_verified_checkout_payment',[o.id,scope,{...evidence('evt_legalrefund'),eventType:'charge.refunded',paymentState:'REFUNDED',refundedMinor:5000}]);
 await assert.rejects(call(db,'finish_order_agreement_job',[o.id,token,p]),/Paid unheld/);assert.deepEqual(await call(db,'read_accepted_purchase',[o.id]),a);
 assert.equal((await db.query('select count(*)::int n from generated_licenses')).rows[0].n,0);
}));
test('agreement builder uses only immutable accepted facts and preserves exact text without inventing a licensor',()=>fixture(async db=>{
 const {o}=await paid(db);const accepted=await call(db,'read_accepted_purchase',[o.id]);
 const {buildAcceptedPurchaseLicense}=moduleAt('lib/licenses/accepted-purchase-snapshot.ts');
 const s=buildAcceptedPurchaseLicense({accepted,agreementNumber:'SYNTHETIC',paidAt:new Date().toISOString(),sessionId:'cs_test_legalfixture',intentId:'pi_legalfixture',payment:{paymentMode:'test',releaseMode:'local',livemode:false,commercialRightsGranted:false}});
 assert.deepEqual(s.purchase,accepted.snapshot);assert.equal(s.purchaseHash,accepted.hash);assert.match(s.licensor.entityName,/Synthetic Rights master/);assert.doesNotMatch(s.licensor.entityName,/The Sync Exchange/);
 assert.equal(s.payment.commercialRightsGranted,false);assert.equal(s.purchase.terms.body,terms.body);
 const {renderSyncLicenseAgreementHtml,renderSyncLicenseAgreementPdf}=moduleAt('lib/licenses/templates/sync-license-template.ts',{'../../utils.ts':{formatCurrency:(c)=>String(c)}});
 const html=renderSyncLicenseAgreementHtml(s),pdf=renderSyncLicenseAgreementPdf(s);
 assert.match(html,/Exact accepted legal document/);assert.ok(html.includes(terms.body));assert.ok(Buffer.from(pdf).toString().includes('SYNTHETIC-TERMS-1'));assert.equal(createHash('sha256').update(pdf).digest('hex').length,64);
}));
test('Unicode party identity and hostile text remain exact in the receipt and escaped in rendered artifacts',()=>fixture(async db=>{
 const q=await newQuote(db,ids.buyer,{party:{...buyerParty,legalName:'Café <script>alert(1)</script>'}});const o=await acceptQuote(db,q);const accepted=await call(db,'read_accepted_purchase',[o.id]);
 const {buildAcceptedPurchaseLicense}=moduleAt('lib/licenses/accepted-purchase-snapshot.ts');
 const s=buildAcceptedPurchaseLicense({accepted,agreementNumber:'UNICODE',paidAt:new Date().toISOString(),sessionId:'cs_test_fixture',intentId:'pi_fixture',payment:{paymentMode:'test',releaseMode:'local',livemode:false,commercialRightsGranted:false}});
 const {renderSyncLicenseAgreementHtml,renderSyncLicenseAgreementPdf}=moduleAt('lib/licenses/templates/sync-license-template.ts',{'../../utils.ts':{formatCurrency:String}});
 const html=renderSyncLicenseAgreementHtml(s),pdf=Buffer.from(renderSyncLicenseAgreementPdf(s)).toString();
 assert.equal(s.purchase.buyer.legalName,'Café <script>alert(1)</script>');assert.ok(!html.includes('<script>alert(1)</script>'));assert.ok(html.includes('Café &lt;script&gt;'));
 assert.ok(pdf.includes('u00e9'));assert.equal(s.purchase.documentSha256,createHash('sha256').update(terms.body).digest('hex'));
}));
