import {createHash,randomUUID} from 'node:crypto';
import {ids,asActor,quote} from './artist-baseline-db.mjs';
import {seedLegalReview,newQuote,acceptQuote,call,incorporatePurchase,claimFixtureAgreement} from './purchase-legal-fixture.mjs';
export const deliveryBytes=new Uint8Array(100).fill(65);
export const deliveryHash=createHash('sha256').update(deliveryBytes).digest('hex');
export const service=(db,name,args)=>call(db,name,args);
export async function deliveryAsset(db,kind='master',suffix=kind) {
 const object=randomUUID();
 await db.exec(`insert into storage.objects(id,bucket_id,name,version,metadata) values('${object}','track-audio','${ids.a}/variants/${suffix}.wav','v1','{"size":100,"mimetype":"audio/wav"}')`);
 const id=await call(db,'reserve_delivery_variant',[ids.admin,ids.live,object,kind]);
 await db.exec(`insert into storage.objects(bucket_id,name,version,metadata) values('purchase-assets','${id}/master','sealed-v1','{"size":100,"mimetype":"audio/wav"}')`);
 await db.query(`select commerce_private.seal_asset('${id}','${deliveryHash}',100,'audio/wav')`);
 await db.exec(`insert into commerce_private.qa_fixture_designations(asset_version_id,buyer_user_id,approval_reference) values('${id}','${ids.buyer}','SYNTHETIC ONLY PK08')`);
 return id;
}
export async function seedDelivery(db,{paid=true,activate=true}={}) {
 await db.exec("insert into storage.buckets(id,name,public) values('track-audio','track-audio',false) on conflict(id) do nothing");
 await db.exec(`update commerce_private.capabilities set foundation_enabled=true,asset_preparation_enabled=true,payment_adapter_enabled=true,
 receipt_generation_enabled=true,entitlement_activation_enabled=true,transaction_projection_enabled=true,delivery_enabled=true`);
 const review=await seedLegalReview(db);
 const master=await deliveryAsset(db),instrumental=await deliveryAsset(db,'instrumental'),excluded=await deliveryAsset(db,'clean');
 await call(db,'review_license_deliverables',[ids.admin,review.offer,[{assetVersionId:master,label:'Synthetic WAV master'},{assetVersionId:instrumental,label:'Synthetic instrumental'}],'SYNTHETIC license-specific manifest review']);
 const q=await newQuote(db),accepted=await acceptQuote(db,q);
 const result=(await db.query(`select * from public.prepare_purchase_completion_checkout('${accepted.id}','local','acct_fixture')`)).rows[0];
 const session=randomUUID();await db.exec(`insert into auth.sessions(id,user_id) values('${session}','${ids.buyer}')`);
 const ctx={db,order:accepted.id,contract:result.contract_id,master,instrumental,excluded,review,quote:q,session};
 if(paid) {
  const path=await claimFixtureAgreement(db,ctx.order);
  await call(db,'record_purchase_completion_event',[ctx.order,'acct_fixture','evt_deliverypaid','cs_test_fixture','pi_fixture','checkout.session.completed','PAID',5000,0,'USD','a'.repeat(64),'2026-10-22T00:00:00Z']);
  const snapshot=await incorporatePurchase(db,ctx.order,{payment:{paymentMode:'test',commercialRightsGranted:false},license:{pricePaidCents:5000,currency:'USD'},pdfSha256:deliveryHash});
  await db.exec(`insert into generated_licenses(order_id,buyer_id,track_id,license_type_id,agreement_number,status,pdf_storage_path,pdf_content_type,pdf_size_bytes,terms_snapshot_json,generated_at)
  values('${ctx.order}','${ids.buyer}','${ids.live}','${ids.license}','SYNTHETIC-PK08','generated',${quote(path)},'application/pdf',100,${quote(JSON.stringify(snapshot))},now())`);
  if(activate) {
   const j=(await db.query("select * from public.claim_purchase_completion_job('entitlement_activation')")).rows[0];
   await call(db,'finish_purchase_completion_job',[j.id,j.lease_token,true,false,null]);
  }
 }
 ctx.entitlements=(await db.query(`select * from order_asset_entitlements where order_id='${ctx.order}' order by asset_type`)).rows;
 ctx.entitlement=ctx.entitlements.find(x=>x.asset_type==='master').id;
 return ctx;
}
export const beginDownload=(ctx,request=randomUUID(),buyer=ids.buyer,entitlement=ctx.entitlement)=>call(ctx.db,'begin_asset_download',[buyer,ctx.order,entitlement,request,ctx.session]);
export const finishDownload=(ctx,authorization,outcome='bytes_prepared',buyer=ids.buyer)=>call(ctx.db,'finish_asset_download',[buyer,authorization.authorizationId,outcome]);
export const assetsFor=(ctx,buyer=ids.buyer)=>asActor(ctx.db,buyer,()=>call(ctx.db,'read_order_assets',[ctx.order]));
