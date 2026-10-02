import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadRoute(event,{signatureValid=true}={}) {
 const calls=[];
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
 return {POST:route.exports.POST,calls};
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
