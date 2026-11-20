import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import Stripe from 'stripe';
import {createHash} from 'node:crypto';
import {source} from './helpers/artist-baseline-db.mjs';
import {assertStripeSessionMatchesTrustedCheckout} from '../services/orders/checkout-pricing.ts';
function load(file,modules){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(source(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,Response,Request,Buffer,TextDecoder,console:{warn(){}},process:{env:{}},require:n=>{assert.ok(Object.hasOwn(modules,n),n);return modules[n];}});return mod.exports;}
const session={id:'cs_test_fixture',client_reference_id:'order',metadata:{orderId:'order'},payment_status:'paid',payment_intent:'pi_fixture',amount_total:5000,currency:'usd',livemode:false,created:1792540800};
const verified={providerEventId:'evt_fixture',eventType:'checkout.session.completed',paymentState:'PAID',checkoutSessionId:session.id,paymentIntentId:'pi_fixture',amountMinor:5000,refundedMinor:0,currency:'usd',evidenceSha256:'a'.repeat(64),providerCreatedAt:'2026-10-21T00:00:00Z',livemode:false};
function syncHarness({interrupt=false,missingIntent=false,production=false}={}){
 const state={order:{id:'order',buyer_user_id:'buyer',track_id:'track',license_type_id:'license',amount_cents:5000,currency:'USD',status:'pending',paid_at:null,agreement_generated_at:null,agreement_path:null,stripe_checkout_session_id:session.id},writes:0,issuance:0,retained:0,adverse:0};
 const db={from(){let values,unmapped=false;const result=()=>{if(values){Object.assign(state.order,values);state.writes++;values=null;}return{data:unmapped?null:{...state.order},error:null};};const q={select:()=>q,eq:column=>{if(column==='stripe_payment_intent_id'&&missingIntent)unmapped=true;return q;},update:v=>{values=v;return q;},maybeSingle:async()=>result(),then:(yes,no)=>Promise.resolve(result()).then(yes,no)};return q;}};
 const modules={stripe:{},'@/lib/env':{env:{appUrl:'https://app.invalid'}},'@/lib/server-env':{getPaymentRuntimeConfiguration:()=>({deploymentTarget:production?'production':'preview',paymentMode:'test'}),assertStripeRuntimeObject(){return{commercialRightsGranted:false};},serverEnv:{stripeSecretKey:'fixture'}},
 '@/services/orders/checkout-recovery':{},'@/services/orders/fulfillment-recovery':{retainVerifiedCheckoutPayment:async()=>state.retained++,retainAdverseCheckoutPayment:async()=>state.adverse++},
 '@/services/orders/activity':{hasProcessedOrderDedupeKey:async()=>true,appendOrderActivityLog:async()=>{}},
 '@/services/orders/checkout-pricing':{loadTrustedCheckoutDetails:async()=>({order:{...state.order},amountCents:5000,currency:'USD'}),assertStripeSessionMatchesTrustedCheckout},
 '@/services/purchase-completion/server':{recordVerifiedPurchaseCompletionEvent:async()=>({enabled:true})},
 '@/services/agreements/server':{generateAgreementArtifactForOrder:async()=>{state.issuance++;if(state.rightsRevoked)throw Error('rights revoked before issuance');if(interrupt&&state.issuance===1)throw Error('artifact interrupted');state.order.agreement_path='fixture.pdf';state.order.agreement_generated_at='2026-10-21';}},
 '@/services/supabase/admin':{createAdminSupabaseClient:()=>db},'@/services/supabase/schema-compat':{isMissingColumnError:()=>false,warnSchemaFallbackOnce(){}}};
 return {api:load('services/stripe/server.ts',modules),state};
}
test('provider retrieval/return pages and completed-unpaid events cannot fulfill',async()=>{
 const h=syncHarness();await h.api.syncOrderFromStripeSession({orderId:'order',session});
 await h.api.syncOrderFromStripeSession({orderId:'order',session:{...session,payment_status:'unpaid'},webhookEventId:'evt_unpaid',webhookEventType:'checkout.session.completed'});
 assert.equal(h.state.writes,0);assert.equal(h.state.issuance,0);assert.equal(h.state.retained,0);
});
test('same signed event retries interrupted artifact work even if activity already marks event processed',async()=>{
 const h=syncHarness({interrupt:true});const input={orderId:'order',session,verifiedEvent:verified,webhookEventId:'evt_fixture',webhookEventType:'checkout.session.completed'};
 await assert.rejects(h.api.syncOrderFromStripeSession(input),/artifact interrupted/);assert.equal(h.state.order.status,'paid');
 await h.api.syncOrderFromStripeSession(input);await h.api.syncOrderFromStripeSession(input);
 assert.equal(h.state.issuance,2);assert.equal(h.state.order.agreement_path,'fixture.pdf');assert.equal(h.state.retained,3);
});
test('refund handler retains adverse evidence before an unknown-intent lookup can fail',async()=>{
 const h=syncHarness({missingIntent:true});
 await assert.rejects(h.api.markOrderRefundedByPaymentIntent({paymentIntentId:'pi_fixture',amountMinor:5000,refundedMinor:5000,verifiedEvent:{...verified,paymentState:'REFUNDED',eventType:'charge.refunded',refundedMinor:5000}}),/known order/);
 assert.equal(h.state.adverse,1);assert.equal(h.state.writes,0);assert.equal(h.state.issuance,0);
});
test('actual Stripe signature verification routes expiration and retries processing errors with non-2xx',async()=>{
 const stripe=new Stripe('sk_test_local_fixture');const key='whsec_local_fixture';let expired=0,fail=false;
 const route=load('app/api/webhooks/stripe/route.ts',{
  '@/services/analytics/purchase':{recordVerifiedPurchase:async()=>{}},'node:crypto':{createHash},'next/cache':{revalidatePath(){}},'next/server':{NextResponse:{json:Response.json}},stripe:{},
  '@/lib/server-env':{assertStripeRuntimeObject(_c,x){if(x.livemode)throw Error('mode');},assertStripeServerConfiguration(){},hasStripeWebhookEnv:true,serverEnv:{stripeWebhookSecret:key},getServerEnvironmentDiagnostics:()=>({})},
  '@/lib/monitoring':{reportOperationalEvent(){},reportOperationalError(){}},'@/lib/maintenance-mode.mjs':{resolveMaintenanceMode:()=>({blocksApplication:false})},
  '@/services/gate-d/server':{routeGateDWebhook:async()=>({route_code:'ordinary'})},
  '@/services/stripe/server':{getStripeServerClient:()=>stripe,expireOrderCheckout:async()=>{expired++;if(fail)throw Error('DB outage');}}
 });
 const payload=JSON.stringify({id:'evt_expired',type:'checkout.session.expired',livemode:false,created:1792540800,data:{object:{...session,status:'expired',payment_status:'unpaid'}}});
 const send=signature=>route.POST(new Request('https://app.invalid/api/webhooks/stripe',{method:'POST',headers:{'stripe-signature':signature},body:payload}));
 assert.equal((await send('invalid')).status,400);assert.equal(expired,0);
 const signature=stripe.webhooks.generateTestHeaderString({payload,secret:key});assert.equal((await send(signature)).status,200);assert.equal(expired,1);
 fail=true;assert.equal((await send(signature)).status,500);assert.equal(expired,2);
});

test('canonical paid retry still refuses an agreement after rights revocation during interruption',async()=>{
 const h=syncHarness({interrupt:true});const input={orderId:'order',session,verifiedEvent:verified,webhookEventId:'evt_fixture',webhookEventType:'checkout.session.completed'};
 await assert.rejects(h.api.syncOrderFromStripeSession(input),/artifact interrupted/);
 h.state.rightsRevoked=true;
 await assert.rejects(h.api.syncOrderFromStripeSession(input),/rights revoked/);
 assert.ok(!h.state.order.agreement_path);assert.equal(h.state.order.status,'paid');
});

test('first signed payment survives rights revocation while legal issuance remains blocked',async()=>{
 const h=syncHarness();h.state.rightsRevoked=true;
 await assert.rejects(h.api.syncOrderFromStripeSession({orderId:'order',session,verifiedEvent:verified,webhookEventId:'evt_fixture',webhookEventType:'checkout.session.completed'}),/rights revoked/);
 assert.equal(h.state.retained,1);assert.equal(h.state.order.status,'paid');assert.ok(!h.state.order.agreement_path);
});

test('shared legacy Checkout creator rejects production before acquiring a provider or privileged client',async()=>{const h=syncHarness({production:true});await assert.rejects(h.api.createStripeCheckoutSession({orderId:'order',trackTitle:'Synthetic',trackSlug:'synthetic',licenseName:'synthetic',amountCents:5000,currency:'USD'}),/release checks/);assert.equal(h.state.writes,0);assert.equal(h.state.issuance,0);});
