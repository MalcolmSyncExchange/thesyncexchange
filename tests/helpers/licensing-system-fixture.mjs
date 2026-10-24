import {randomUUID} from 'node:crypto';
import {fixture,published,ids,asActor,call,admin,service} from './catalog-management-fixture.mjs';
import {ensureSourceReview} from './immutable-source-fixture.mjs';
import {buyerParty,usage,terms,financial} from './purchase-legal-fixture.mjs';
export {fixture,published,ids,asActor,call,admin,service,buyerParty,usage,terms,financial};
export const contract=()=>({version:'SYNTHETIC-CONTRACT-1',category:'online_video',media:['Synthetic online video'],distribution:['Synthetic controlled internet distribution'],audience:'Synthetic audience up to 1000',campaign:'Synthetic single project only',restrictions:['No resale or political advertising.'],maxDurationDays:30,exclusive:false,renewal:'A new reviewed agreement and acceptance are required; no automatic renewal.',termination:'Synthetic manual legal review; a refund alone does not terminate contractual rights.',approval:{mode:'synthetic',reference:'SYNTHETIC-NOT-LEGALLY-APPROVED'},pricing:{version:'SYNTHETIC-PRICE-1',currency:'USD',sellerTier:'Synthetic standard tier',basePriceCents:5000,commissionBps:2000,rules:[{id:'SYNTHETIC-US-VIDEO',use:'online_video',territory:'US',amountCents:6001,discountCents:501,approvalReference:'SYNTHETIC-PRICE-OVERRIDE'}]}});
export const buyer=(db,name,args)=>asActor(db,ids.buyer,()=>call(db,name,args));
export async function setupContract(db,c=contract()){const p=await published(db);const offer=await service(db,'publish_licensing_offer',[ids.admin,ids.live,ids.license,p.rights.rights,{...terms,licenseContract:c},financial,'SYNTHETIC scope and pricing review']);await ensureSourceReview(db,offer);return {...p,offer,contract:c};}
export const quotePurchase=(db,changes={})=>buyer(db,'prepare_purchase_quote',[ids.live,ids.license,{...buyerParty,...changes.buyer},{...usage,...changes.usage}]);
export const accept=(db,q)=>buyer(db,'accept_purchase_quote',[q.id,q.hash,q.schedule.terms.requiredConsents,q.schedule.buyer.representative]);
export async function issued(db,{q=null,paymentState='PAID',publish=true}={}){
 q||=await quotePurchase(db);const order=await accept(db,q),session='cs_test_license'+order.id.replaceAll('-',''),intent='pi_license'+order.id.replaceAll('-','');
 await db.query('update orders set stripe_checkout_session_id=$1 where id=$2',[session,order.id]);
 const evidence={providerEventId:'evt_license'+randomUUID().replaceAll('-',''),eventType:paymentState==='PAYMENT_FAILED'?'checkout.session.async_payment_failed':'checkout.session.completed',paymentState,checkoutSessionId:session,paymentIntentId:intent,amountMinor:q.schedule.amountCents,refundedMinor:0,currency:'USD',evidenceSha256:'a'.repeat(64),providerCreatedAt:new Date().toISOString(),livemode:false};
 await service(db,'record_verified_checkout_payment',[order.id,'a'.repeat(64)+':test',evidence]);
 if(paymentState!=='PAID')return {order,q,evidence};
 await db.query("update orders set status='paid',paid_at=clock_timestamp() where id=$1",[order.id]);
 const token=await service(db,'claim_order_agreement_job',[order.id]);const accepted=await service(db,'read_accepted_purchase',[order.id]);
 const payload={id:randomUUID(),order_id:order.id,buyer_id:ids.buyer,track_id:ids.live,license_type_id:ids.license,agreement_number:'SYNTHETIC-'+order.id,status:'generated',pdf_storage_path:`${ids.buyer}/${order.id}/${token}.pdf`,pdf_content_type:'application/pdf',pdf_size_bytes:100,terms_snapshot_json:{purchase:accepted.snapshot,purchaseHash:accepted.hash,payment:{paymentMode:'test',commercialRightsGranted:false},license:{pricePaidCents:q.schedule.amountCents,currency:'USD'}},html_snapshot:'Synthetic agreement fixture only',generated_at:new Date().toISOString()};
 if(publish)await service(db,'finish_order_agreement_job',[order.id,token,payload]);return {order,q,evidence,token,payload,accepted};
}
