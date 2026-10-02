// Pure, offline and read-only. SAFE_TO_MAP means a manual mapping candidate,
// never authorization to backfill, regenerate, grant rights or issue downloads.
import {z} from 'zod';

const booleanFields=new Set(['has_paid_at','has_payment_intent','has_agreement_path','test_session','snapshot_order_matches',
 'snapshot_buyer_matches','snapshot_track_matches','verified_payment_evidence','frozen_seller_rights','frozen_asset_version',
 'has_legacy_webhook_activity','livemode','commercialRightsGranted']);
const minorUnits=z.number().int().safe().nonnegative();
const payment=z.object({paymentMode:z.enum(['test','live']),releaseMode:z.enum(['production_beta','production_live','local','preview']),
 livemode:z.boolean(),commercialRightsGranted:z.boolean()}).strict();
function validExportTimestamp(value) {
 const match=/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2})(?::?(\d{2}))?)$/.exec(value);
 if(!match)return false;
 const [,year,month,day,hour,minute,second,offsetHour='0',offsetMinute='0']=match.map((v,i)=>i===0?v:Number(v ?? 0));
 const leap=year%4===0 && (year%100!==0 || year%400===0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 return year>=1 && month>=1 && month<=12 && day>=1 && day<=days[month-1]
  && hour<=23 && minute<=59 && second<=59 && offsetHour<=23 && offsetMinute<=59;
}
// Exact sanitized export contract v1. No coercion, trimming, defaults or unknown keys.
const rowSchema=z.object({
 id:z.string().uuid(),status:z.enum(['pending','paid','fulfilled','refunded']),
 amount_cents:minorUnits.positive(),snapshot_amount:minorUnits,currency:z.literal('USD'),snapshot_currency:z.literal('USD'),
 deployment_environment:z.enum(['local','preview','production']),
 has_paid_at:z.boolean(),has_payment_intent:z.boolean(),has_agreement_path:z.boolean(),
 agreement_status:z.enum(['pending','generated','failed']).nullable(),test_session:z.boolean(),payment_classification:payment.nullable(),
 snapshot_order_matches:z.boolean(),snapshot_buyer_matches:z.boolean(),snapshot_track_matches:z.boolean(),
 verified_payment_evidence:z.boolean(),frozen_seller_rights:z.boolean(),frozen_asset_version:z.boolean(),
 // Optional export metadata is never used as payment authority.
 created_at:z.string().refine(validExportTimestamp,'invalid_timestamp').optional(),
 has_legacy_webhook_activity:z.boolean().optional()
}).strict().superRefine((row,context)=>{
 const p=row.payment_classification;
 if(p) {
  const live=p.paymentMode==='live';
  if(p.livemode!==live || p.commercialRightsGranted!==live || row.test_session===live)
   context.addIssue({code:z.ZodIssueCode.custom,path:['payment_classification'],message:'inconsistent_payment_classification'});
  const expected=row.deployment_environment==='production'?(live?'production_live':'production_beta'):row.deployment_environment;
  if(p.releaseMode!==expected || (live && row.deployment_environment!=='production'))
   context.addIssue({code:z.ZodIssueCode.custom,path:['payment_classification','releaseMode'],message:'invalid_environment'});
 }
});

export function validateLegacyOrder(input) {
 const parsed=rowSchema.safeParse(input);
 if(parsed.success) {
  // optional() permits explicit undefined in JS; the JSON export contract does not.
  const absentOptionals=['created_at','has_legacy_webhook_activity'].filter(k=>Object.hasOwn(input,k)&&input[k]===undefined);
  if(absentOptionals.length)return {valid:false,errors:absentOptionals.map(field=>({field,code:'missing_required_field'}))};
  return {valid:true,data:parsed.data,errors:[]};
 }
 const errors=parsed.error.issues.map(issue=>{
  const field=issue.path.join('.') || '$';
  const key=issue.path.at(-1);
  let code='invalid_evidence';
  if(issue.code==='unrecognized_keys')code='unexpected_field';
  else if((issue.code==='invalid_type' && issue.received==='undefined') || (issue.code==='invalid_literal' && issue.received===undefined))code='missing_required_field';
  else if(booleanFields.has(key))code='invalid_boolean';
  else if(['amount_cents','snapshot_amount'].includes(key))code='invalid_minor_units';
  else if(key==='id')code='invalid_identifier';
  else if(['deployment_environment','releaseMode'].includes(key))code='invalid_environment';
  else if(key==='paymentMode')code='invalid_payment_mode';
  else if(issue.code==='custom')code=issue.message;
  else if(['status','agreement_status','currency','snapshot_currency'].includes(key))code='invalid_enum';
  return {field,code}; // No rejected values, arbitrary unknown keys, or parser messages.
 });
 return {valid:false,errors};
}

export function classifyLegacyOrder(input) {
 const validation=validateLegacyOrder(input);
 if(!validation.valid)return {orderId:null,classification:'INVALID_INPUT',operationalOutcome:'DO_NOT_BACKFILL',safeToMap:false,
  validationErrors:validation.errors,reasons:['Invalid sanitized evidence; manual export repair required.'],masterEntitlement:'DENIED',mutationPerformed:false};
 const order=validation.data;
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
   (order.snapshot_amount!==order.amount_cents) ||
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
 return {orderId:order.id,classification,operationalOutcome:classification,safeToMap:classification==='SAFE_TO_MAP',validationErrors:[],
  reasons,masterEntitlement:'DENIED',mutationPerformed:false};
}
