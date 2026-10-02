// Pure, offline and read-only. SAFE_TO_MAP means a manual mapping candidate,
// never authorization to backfill, regenerate, grant rights or issue downloads.
export function classifyLegacyOrder(order) {
 const reasons=[];
 let classification;
 if(!['paid','fulfilled'].includes(order.status)) {
  classification='DO_NOT_BACKFILL';reasons.push('Not an eligible completed payment; pending/refunded/held records need separate handling.');
 } else if(!order.has_paid_at || !order.has_payment_intent || order.agreement_status!=='generated' || !order.has_agreement_path) {
  classification='INCOMPLETE';
  if(!order.has_paid_at)reasons.push('Missing paid timestamp.');
  if(!order.has_payment_intent)reasons.push('Missing provider payment reference.');
  if(order.agreement_status!=='generated' || !order.has_agreement_path)reasons.push('Missing generated-license artifact evidence; existing order status is insufficient.');
 } else {
  const mismatched=order.snapshot_order_matches===false || order.snapshot_buyer_matches===false || order.snapshot_track_matches===false ||
   (order.snapshot_amount!=null && Number(order.snapshot_amount)!==order.amount_cents) ||
   (order.snapshot_currency!=null && order.snapshot_currency!==order.currency);
  if(mismatched){classification='DO_NOT_BACKFILL';reasons.push('Existing snapshot contradicts order identity, amount or currency.');}
  else {
   if(order.test_session!==true)reasons.push('TEST Checkout identity not established.');
   if(order.payment_classification?.paymentMode!=='test' || order.payment_classification?.commercialRightsGranted!==false)
    reasons.push('Explicit immutable TEST/non-commercial classification missing.');
   if(!order.snapshot_order_matches || !order.snapshot_buyer_matches || !order.snapshot_track_matches || order.snapshot_amount==null || order.snapshot_currency==null)
    reasons.push('Historical snapshot does not establish every required purchase binding.');
   if(!order.verified_payment_evidence)reasons.push('No normalized verified payment evidence; legacy activity is not a substitute.');
   if(!order.frozen_seller_rights)reasons.push('Seller/rightsholder context at purchase is not established.');
   if(!order.frozen_asset_version)reasons.push('Immutable purchase-time file version/hash is absent.');
   classification=reasons.length?'AMBIGUOUS':'SAFE_TO_MAP';
   if(!reasons.length)reasons.push('All mapping evidence present; explicit reviewed migration still required.');
  }
 }
 return {orderId:order.id ?? null,classification,reasons,masterEntitlement:'DENIED',mutationPerformed:false};
}
