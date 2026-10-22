// Synthetic, disposable fixtures only. Never imported by application code.
import {approvedSource,ensureSourceReview} from './immutable-source-fixture.mjs';
import { ids, quote, asActor } from './artist-baseline-db.mjs';
export const legalIds={object:'10101010-1010-4010-8010-101010101010'};
export const party=(id='master')=>({id,legalName:'Synthetic Rights '+id,entityType:'individual',jurisdiction:'Fixture jurisdiction',address:'123 Synthetic Address'});
export const buyerParty={legalName:'Synthetic Buyer',entityType:'company',registrationNumber:'FIXTURE-ONLY',jurisdiction:'Fixture jurisdiction',address:'456 Synthetic Address',representative:'Synthetic Representative',capacity:'Authorized fixture representative'};
const future=new Date(Date.now()+365*86400000).toISOString(),past=new Date(Date.now()-86400000).toISOString();
export const usage={project:'Synthetic production',use:'online_video',territory:'US',startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+2*86400000).toISOString()};
export const terms={version:'SYNTHETIC-TERMS-1',body:'Synthetic local testing terms only. No commercial rights or legal approval. This exact text must survive catalog and template changes.',platformRole:'Synthetic limited agent for identified rightsholders; fixture only.',approvalReference:'SYNTHETIC-NOT-FOUNDER-APPROVED',requiredConsents:['I confirm this specific synthetic project and usage.','I acknowledge the stated restrictions and outside-clearance obligations.'],acceptUntil:future,issueUntil:future};
export const financial={commissionBps:2000,policyVersion:'ALPHA-SYNTHETIC',approvalReference:'SYNTHETIC-ONLY',allocations:[{partyId:'master',bps:6000},{partyId:'publishing',bps:4000}]};
export const sqlCall=(name,args)=>`select public.${name}(${args.map(v=>v===null?'null':quote(typeof v==='object'?JSON.stringify(v):v)).join(',')}) as value`;
export const call=async(db,name,args)=>(await db.query(sqlCall(name,args))).rows[0].value;
const ready=new WeakMap();
export async function seedLegalReview(db) {
 if(ready.has(db))return ready.get(db);
 await approvedSource(db);
 await db.exec(`insert into storage.objects(id,bucket_id,name,version,metadata) values('${legalIds.object}','purchase-assets','synthetic-authority.txt','synthetic-v1','{"size":200}')`);
 const evidence=await call(db,'register_licensing_evidence',[ids.admin,legalIds.object,'a'.repeat(64),'SYNTHETIC authority review',future]);
 const rights={seller:{...party('seller'),userId:ids.a},recordingIdentifier:'SYNTHETIC-RECORDING-1',workIdentifier:'SYNTHETIC-WORK-1',
 master:[{party:party(),ownershipBps:10000,controlledBps:10000,evidenceId:evidence,authority:'owner'}],
 publishing:[{party:party('publishing'),ownershipBps:10000,controlledBps:10000,evidenceId:evidence,authority:'owner'}],
 scope:{uses:['online_video'],territories:['US'],restrictions:['No resale. Outside public-performance permissions are excluded and remain the buyer responsibility.'],excludedUses:['political_ad'],validFrom:past,validUntil:future,
 outsideClearances:['public_performance','distribution','third_party_samples','performer_likeness','other_permissions'].map(kind=>({kind,responsibility:'buyer_responsibility',description:'Synthetic outside-clearance review; buyer obtains any applicable permissions.'}))}};
 const offer=await call(db,'publish_licensing_offer',[ids.admin,ids.live,ids.license,rights,terms,financial,'SYNTHETIC full review']);
 const result={evidence,rights,offer};ready.set(db,result);return result;
}
export async function newQuote(db,buyer=ids.buyer,overrides={}) {
 await seedLegalReview(db);const current=(await db.query(`select offer_id from licensing_private.offer_heads where track_id='${ids.live}' and license_type_id='${ids.license}'`)).rows[0];await ensureSourceReview(db,current.offer_id);
 return asActor(db,buyer,()=>call(db,'prepare_purchase_quote',[ids.live,ids.license,overrides.party||buyerParty,overrides.usage||usage]));
}
export const acceptQuote=(db,q,buyer=ids.buyer)=>asActor(db,buyer,()=>call(db,'accept_purchase_quote',[q.id,q.hash,q.schedule.terms.requiredConsents,q.schedule.buyer.representative]));

// Older payment/worker tests construct orders directly to isolate payment
// behavior. Give those named synthetic orders explicit legal fixtures without
// adding a production migration/adoption bypass. Real acceptance is exercised
// through authenticated public RPCs by purchase-legal-snapshot.test.mjs.
export async function seedFixtureAcceptance(db,orderId) {
 if((await db.query(`select 1 from licensing_private.acceptances where order_id=${quote(orderId)}`)).rows.length)return;
 await seedLegalReview(db);
 const {buyer_user_id:buyer}= (await db.query(`select buyer_user_id from orders where id=${quote(orderId)}`)).rows[0];
 const q=await newQuote(db,buyer);
 await db.exec(`insert into licensing_private.acceptances(order_id,quote_id,buyer_id,snapshot,snapshot_hash)
 select ${quote(orderId)},id,buyer_id,s,licensing_private.hash_json(s) from licensing_private.quotes q
 cross join lateral(select q.schedule||jsonb_build_object('orderId',${quote(orderId)},'quoteId',q.id,'quotedAt',q.created_at,
 'acceptance',jsonb_build_object('buyerId',q.buyer_id,'acceptedAt',clock_timestamp(),'method','explicit_synthetic_fixture','scheduleHash',q.schedule_hash,'termsHash',q.schedule->>'termsHash',
 'documentVersion',q.schedule#>>'{terms,version}','representative',q.schedule#>>'{buyer,representative}','capacity',q.schedule#>>'{buyer,capacity}',
 'consents',q.schedule#>'{terms,requiredConsents}','statement','Synthetic test acceptance only. No commercial rights.')) s) x where q.id=${quote(q.id)} on conflict(order_id) do nothing`);
}
export async function incorporatePurchase(db,orderId,payload) {
 await seedFixtureAcceptance(db,orderId);
 const a=(await db.query(`select snapshot,snapshot_hash from licensing_private.acceptances where order_id=${quote(orderId)}`)).rows[0];
 return {...payload,purchase:a.snapshot,purchaseHash:a.snapshot_hash};
}
export async function claimFixtureAgreement(db,orderId,session='cs_test_fixture',intent='pi_fixture') {
 await seedFixtureAcceptance(db,orderId);
 await db.exec(`update orders set stripe_checkout_session_id=${quote(session)} where id=${quote(orderId)}`);
 await call(db,'record_verified_checkout_payment',[orderId,'a'.repeat(64)+':test',{
  providerEventId:'evt_syntheticlegal'+orderId.replaceAll('-',''),eventType:'checkout.session.completed',paymentState:'PAID',checkoutSessionId:session,paymentIntentId:intent,
  amountMinor:5000,refundedMinor:0,currency:'USD',evidenceSha256:'a'.repeat(64),providerCreatedAt:'2026-10-22T00:00:00Z',livemode:false
 }]);
 await db.exec(`update orders set status='paid',paid_at=now() where id=${quote(orderId)}`);
 const token=await call(db,'claim_order_agreement_job',[orderId]);
 const buyer=(await db.query(`select buyer_user_id from orders where id=${quote(orderId)}`)).rows[0].buyer_user_id;
 return `${buyer}/${orderId}/${token}.pdf`;
}
