import {startMarketplaceFixture,anonKey,serviceKey} from './buyer-marketplace-provider-fixture.mjs';
import {contract,quotePurchase,issued,ids,service,buyer} from './licensing-system-fixture.mjs';
import {terms,financial} from './purchase-legal-fixture.mjs';
import {ensureSourceReview} from './immutable-source-fixture.mjs';
import {buildAcceptedPurchaseLicense} from '../../lib/licenses/accepted-purchase-snapshot.ts';
import {renderUnicodeAgreementPdf} from '../../lib/licenses/templates/unicode-agreement-pdf.ts';
import {createHash} from 'node:crypto';
export {anonKey,serviceKey};
export async function startLicensingFixture(){let purchase,pdf,pdfPath,offer;
 const f=await startMarketplaceFixture({
  async initialize({db,original}){
   offer=await service(db,'publish_licensing_offer',[ids.admin,ids.live,ids.license,original.rights.rights,{...terms,licenseContract:contract()},financial,'SYNTHETIC browser contract review']);await ensureSourceReview(db,offer);
   // Existing pending System06 fixture orders have no purchase evidence and are
   // removed only from this disposable synthetic database before this journey.
   await db.exec('delete from orders');const q=await quotePurchase(db,{buyer:{legalName:'Café Élise Müller 山田太郎',representative:'Élise Müller'}});purchase=await issued(db,{q,publish:false});
   const snapshot=buildAcceptedPurchaseLicense({accepted:purchase.accepted,agreementNumber:purchase.payload.agreement_number,paidAt:'2026-10-24T00:00:00Z',sessionId:purchase.evidence.checkoutSessionId,intentId:purchase.evidence.paymentIntentId,payment:{paymentMode:'test',releaseMode:'local',livemode:false,commercialRightsGranted:false}});pdf=await renderUnicodeAgreementPdf(snapshot);pdfPath=purchase.payload.pdf_storage_path;snapshot.pdfSha256=createHash('sha256').update(pdf).digest('hex');
   purchase.payload.pdf_size_bytes=pdf.length;purchase.payload.terms_snapshot_json=snapshot;await service(db,'finish_order_agreement_job',[purchase.order.id,purchase.token,purchase.payload]);
  },
  async rest(req,res,ctx,{db,execute,json}){if(ctx.url.pathname!=='/rest/v1/order_activity_log')return false;if(!ctx.service||req.method!=='POST')throw Object.assign(Error('Synthetic audit access denied'),{code:'42501'});const row=ctx.body,keys=Object.keys(row),allowed=['order_id','actor_id','source','event_type','message','metadata','dedupe_key'];if(keys.some(k=>!allowed.includes(k))||row.order_id!==purchase.order.id||row.event_type!=='agreement_download_authorized')throw Object.assign(Error('Synthetic audit contract rejected'),{code:'42501'});await execute(ctx,()=>db.query('insert into public.order_activity_log('+keys.map(k=>'"'+k+'"').join(',')+') values('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',keys.map(k=>row[k]!==null&&typeof row[k]==='object'?JSON.stringify(row[k]):row[k])));json(res,null,201);return true;},
  async storage(req,res,ctx){if(!ctx.url.pathname.includes('/agreements/'))return false;if(!ctx.service||req.method!=='GET'||!decodeURIComponent(ctx.url.pathname).endsWith('/'+pdfPath)){res.writeHead(403);res.end();return true;}res.writeHead(200,{'content-type':'application/pdf','content-length':pdf.length});res.end(pdf);return true;}
 });return {...f,order:purchase.order.id,offer,accepted:purchase.accepted,agreement:purchase.payload.agreement_number,pdfSha256:createHash('sha256').update(pdf).digest('hex'),record:()=>f.withDatabase(db=>buyer(db,'license_record',[purchase.order.id]))};
}
