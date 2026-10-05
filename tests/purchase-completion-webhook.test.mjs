import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadRoute(event,{signatureValid=true,gateRouter=async()=>({route_code:'ordinary',grant_id:null,order_id:null,grant_state:null})}={}) {
 const calls=[];
 const gateCalls=[];
 const source=readFileSync(new URL('../app/api/webhooks/stripe/route.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const route={exports:{}};
 const stripe={webhooks:{constructEvent(){if(!signatureValid)throw Error('bad signature');return event;}}};
 const stubs={
  'node:crypto':{createHash},
  'next/cache':{revalidatePath(){}},
  'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  stripe:{},
  '@/lib/server-env':{
   assertStripeServerConfiguration(){},
   assertStripeRuntimeObject(_context,input){if(input.livemode)throw Error('wrong mode');},
   getServerEnvironmentDiagnostics:()=>({deploymentTarget:'preview'}),
   hasStripeWebhookEnv:true,
   serverEnv:{stripeWebhookSecret:'redacted-fixture'}
  },
  '@/lib/monitoring':{reportOperationalError(){},reportOperationalEvent(){}},
  '@/lib/maintenance-mode.mjs':{resolveMaintenanceMode:()=>({blocksApplication:false})},
  '@/services/gate-d/server':{
   routeGateDWebhook:async input=>{gateCalls.push(['route',input]);return gateRouter(input);},
   recordGateDVerifiedPayment:async input=>gateCalls.push(['payment',input]),
   requestGateDRevocation:async(...input)=>gateCalls.push(['revoke',...input]),
   runGateDAcceptanceJobs:async input=>gateCalls.push(['jobs',input])
  },
  '@/services/stripe/server':{
   getStripeServerClient:()=>stripe,
   syncOrderFromStripeSession:async input=>calls.push(['paid',input]),
   markOrderCheckoutSessionPaymentFailed:async input=>calls.push(['failed',input]),
   markOrderRefundedByPaymentIntent:async input=>{calls.push(['refund',input]);return{id:'order'};},
   recordOrderDisputeByPaymentIntent:async input=>{calls.push(['dispute',input]);return{id:'order'};}
  }
 };
 vm.runInNewContext(compiled,{module:route,exports:route.exports,Response,Request,console,process:{env:{}},require:name=>{
  assert.ok(Object.hasOwn(stubs,name),`Unmocked dependency: ${name}`);return stubs[name];
 }});
 return {POST:route.exports.POST,calls,gateCalls};
}

const payload='{"reviewed":"safe fixture"}';
const send=POST=>POST(new Request('https://security-staging.invalid/api/webhooks/stripe',{
 method:'POST',headers:{'stripe-signature':'fixture'},body:payload
}));

test('signed paid TEST event maps only reviewed fields and a raw-body digest into fulfillment',async()=>{
 const session={id:'cs_test_fixture',client_reference_id:'order',metadata:{orderId:'order'},payment_status:'paid',payment_intent:'pi_fixture',amount_total:5000,currency:'usd'};
 const h=loadRoute({id:'evt_fixture',type:'checkout.session.completed',created:1790964000,livemode:false,data:{object:session}});
 assert.equal((await send(h.POST)).status,200);assert.equal(h.calls.length,1);
 const evidence=h.calls[0][1].verifiedEvent;
 assert.deepEqual(JSON.parse(JSON.stringify(evidence)),{
  providerEventId:'evt_fixture',eventType:'checkout.session.completed',paymentState:'PAID',checkoutSessionId:'cs_test_fixture',
  paymentIntentId:'pi_fixture',amountMinor:5000,refundedMinor:0,currency:'usd',
  evidenceSha256:createHash('sha256').update(payload).digest('hex'),providerCreatedAt:'2026-10-02T18:00:00.000Z',livemode:false
 });
 assert.ok(!JSON.stringify(evidence).includes(payload));
});

test('unsigned or live events cannot reach any fulfillment adapter',async()=>{
 const event={id:'evt_fixture',type:'checkout.session.completed',created:1790964000,livemode:false,data:{object:{}}};
 const unsigned=loadRoute(event,{signatureValid:false});assert.equal((await send(unsigned.POST)).status,400);assert.equal(unsigned.calls.length,0);
 const live=loadRoute({...event,livemode:true});assert.equal((await send(live.POST)).status,400);assert.equal(live.calls.length,0);
});

test('refund and dispute mapping use the stored order session while preserving amount and state',async()=>{
 const refund=loadRoute({id:'evt_refund',type:'charge.refunded',created:1790964000,livemode:false,data:{object:{payment_intent:'pi_fixture',amount:5000,amount_refunded:1000,currency:'usd'}}});
 assert.equal((await send(refund.POST)).status,200);
 assert.deepEqual(JSON.parse(JSON.stringify(refund.calls[0][1].verifiedEvent)),{
  providerEventId:'evt_refund',eventType:'charge.refunded',paymentState:'PARTIALLY_REFUNDED',paymentIntentId:'pi_fixture',
  amountMinor:5000,refundedMinor:1000,currency:'usd',evidenceSha256:createHash('sha256').update(payload).digest('hex'),
  providerCreatedAt:'2026-10-02T18:00:00.000Z',livemode:false
 });
 const dispute=loadRoute({id:'evt_dispute',type:'charge.dispute.created',created:1790964000,livemode:false,data:{object:{payment_intent:'pi_fixture',amount:5000,currency:'usd'}}});
 assert.equal((await send(dispute.POST)).status,200);
 assert.equal(dispute.calls[0][1].verifiedEvent.paymentState,'DISPUTED');
 assert.equal(dispute.calls[0][1].verifiedEvent.checkoutSessionId,undefined);
});

test('exact bound Session routes only through Gate D, including fulfillment before browser return',async()=>{
 const orderId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const grantId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const session={id:'cs_test_gatedfixture',client_reference_id:orderId,payment_status:'paid',payment_intent:'pi_gatedfixture',amount_total:5000,currency:'usd'};
 const h=loadRoute({id:'evt_gatefixture',type:'checkout.session.completed',created:1790964000,livemode:false,data:{object:session}},
  {gateRouter:async()=>({route_code:'gate_d',grant_id:grantId,order_id:orderId,grant_state:'checkout_bound'})});
 assert.equal((await send(h.POST)).status,200);
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0][0],'paid');
 assert.deepEqual(h.gateCalls.map(call=>call[0]),['route','payment','jobs']);
 assert.equal(h.gateCalls[1][1].grantId,grantId);
 assert.equal(h.gateCalls[2][1],grantId);
});

test('unbound Gate D order conflict is retryable and never reaches ordinary fulfillment',async()=>{
 const orderId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const session={id:'cs_test_unboundfixture',client_reference_id:orderId,payment_status:'paid',payment_intent:'pi_gatefixture',amount_total:5000,currency:'usd'};
 const h=loadRoute({id:'evt_conflict',type:'checkout.session.completed',created:1790964000,livemode:false,data:{object:session}},
  {gateRouter:async()=>({route_code:'conflict',grant_id:null,order_id:orderId,grant_state:'reserved'})});
 assert.equal((await send(h.POST)).status,500);
 assert.equal(h.calls.length,0);
 assert.deepEqual(h.gateCalls.map(call=>call[0]),['route']);
});

test('Gate D failed payment requests revocation with the verified webhook actor path',async()=>{
 const orderId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const grantId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const session={id:'cs_test_gatedfixture',client_reference_id:orderId,payment_status:'unpaid'};
 const failed=loadRoute({id:'evt_failed',type:'checkout.session.async_payment_failed',created:1790964000,livemode:false,data:{object:session}},
  {gateRouter:async()=>({route_code:'gate_d',grant_id:grantId,order_id:orderId,grant_state:'checkout_bound'})});
 assert.equal((await send(failed.POST)).status,200);
 assert.deepEqual(failed.gateCalls.map(call=>call[0]),['route','revoke']);
 assert.equal(failed.calls.length,0);

});

test('every non-null Connect context is rejected before Gate D classification or ordinary fulfillment',async()=>{
 const orderId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const checkout=id=>({id,client_reference_id:orderId,payment_status:'paid',payment_intent:'pi_fixture',amount_total:5000,currency:'usd'});
 const cases=[
  ['exact Gate D Session','checkout.session.completed',checkout('cs_test_gatedfixture')],
  ['unknown Session','checkout.session.completed',checkout('cs_test_unknownfixture')],
  ['ordinary order','checkout.session.completed',checkout('cs_test_ordinaryfixture')],
  ['failed payment','checkout.session.async_payment_failed',{...checkout('cs_test_failedfixture'),payment_status:'unpaid'}],
  ['refund','charge.refunded',{payment_intent:'pi_fixture',amount:5000,amount_refunded:5000,currency:'usd'}],
  ['dispute','charge.dispute.created',{payment_intent:'pi_fixture',amount:5000,currency:'usd'}],
  ['unhandled','customer.created',{id:'cus_fixture'}]
 ];
 for(const [label,type,object] of cases) {
  const h=loadRoute({id:`evt_${type.replaceAll('.','_')}`,account:'acct_connected',type,created:1790964000,livemode:false,data:{object}});
  assert.equal((await send(h.POST)).status,400,label);
  assert.equal(h.gateCalls.length,0,label);
  assert.equal(h.calls.length,0,label);
 }
 const malformed=loadRoute({id:'evt_malformed_connect',account:{id:'acct_connected'},type:'checkout.session.completed',created:1790964000,livemode:false,data:{object:checkout('cs_test_fixture')}});
 assert.equal((await send(malformed.POST)).status,400);
 assert.equal(malformed.gateCalls.length,0);
 assert.equal(malformed.calls.length,0);

 const live=loadRoute({id:'evt_live_connect',account:'acct_connected',type:'checkout.session.completed',created:1790964000,livemode:true,data:{object:checkout('cs_live_fixture')}});
 assert.equal((await send(live.POST)).status,400);
 assert.equal(live.gateCalls.length,0);
 assert.equal(live.calls.length,0);
});
