import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const buyer='8ffc95e8-0e8f-428e-ac26-925d6bc98fcd';
const order='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const grant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const attempt='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const lease='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const expires='2026-10-04T00:30:00.000Z';

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
}

function loadGateServer({rpcHandler,stripeCreate,storage,receiptRenderer,runtime}={}) {
  const loadedModule={exports:{}};
  const stripeCalls=[];
  const admin={
    rpc:async(name,args)=>rpcHandler ? rpcHandler(name,args) : ({data:null,error:null}),
    storage:{from:()=>storage || ({})}
  };
  const stripe={checkout:{sessions:{
    create:async(params,options)=>{
      stripeCalls.push({params,options});
      if(stripeCreate)return stripeCreate(params,options,stripeCalls.length);
      return checkoutSession();
    },
    retrieve:async()=>checkoutSession()
  }}};
  const stubs={
    'server-only':{},
    'node:crypto':{createHash,timingSafeEqual},
    '@/lib/env':{env:{appUrl:'https://example.invalid'},getDeploymentTarget:()=> 'production'},
    '@/lib/server-env':{
      assertStripeServerConfiguration(){},
      getPaymentRuntimeConfiguration:()=>runtime || ({deploymentTarget:'production',releaseMode:'production_beta',paymentMode:'test',livePaymentsEnabled:false}),
      getPurchaseCompletionAdapterConfiguration:()=>({requested:false}),
      serverEnv:{stripeAccountId:'acct_gatefixture'}
    },
    '@/lib/gate-d/receipt':{
      gateDReceiptObjectPath:id=>`gate-d/${id}/receipt-v1.pdf`,
      renderGateDReceipt:receiptRenderer || (()=>{throw Error('unused');})
    },
    '@/services/stripe/server':{getStripeServerClient:()=>stripe,getOrderConfirmationUrl:id=>`https://example.invalid/buyer/orders/${id}`},
    '@/services/supabase/admin':{createAdminSupabaseClient:()=>admin}
  };
  vm.runInNewContext(compile('../services/gate-d/server.ts'),{
    module:loadedModule,exports:loadedModule.exports,Buffer,URL,console,require:name=>{
      assert.ok(Object.hasOwn(stubs,name),`Unmocked dependency: ${name}`);return stubs[name];
    }
  });
  return {...loadedModule.exports,stripeCalls};
}

function checkoutSession(overrides={}) {
  return {
    id:'cs_test_gatedfixture',livemode:false,client_reference_id:order,amount_total:5000,
    currency:'usd',expires_at:Math.floor(new Date(expires).getTime()/1000),
    url:'https://checkout.stripe.test/c/pay/cs_test_gatedfixture',...overrides
  };
}

function prepared(digest) {
  return {
    grant_id:grant,attempt_id:attempt,reservation_lease_token:lease,reservation_lease_epoch:1,
    stripe_idempotency_key:`gate-d:${attempt}`,stripe_parameters_sha256:digest,
    provider_expires_at:expires,order_id:order,amount_minor:5000,currency:'USD',
    track_title:'Gate D Track',track_slug:'gate-d-track',license_name:'Standard'
  };
}

test('canonical Checkout digest is stable and parameter drift stops before Stripe dispatch',async()=>{
  let trusted;
  const h=loadGateServer({rpcHandler:async name=>name==='gate_d_prepare_checkout'
    ? {data:[trusted],error:null}:{data:null,error:null}});
  const canonical=`gate-d-v1|mode=payment|payment_method_types=card|order=${order}|amount=5000|currency=usd|expires=${Math.floor(new Date(expires).getTime()/1000)}`;
  const digest=createHash('sha256').update(canonical).digest('hex');
  assert.equal(h.gateDCheckoutParameterDigest({orderId:order,amountMinor:5000,currency:'USD',providerExpiresAt:expires}),digest);
  trusted=prepared('0'.repeat(64));
  await assert.rejects(h.prepareGateDCheckout({grant_id:grant,attempt_id:attempt,lease_epoch:1}),/digest mismatch/);
  assert.equal(h.stripeCalls.length,0);
});

test('non-production Gate D classifier bypasses private RPCs and preserves ordinary webhook flow',async()=>{
  let rpcCalls=0;
  const h=loadGateServer({
    runtime:{deploymentTarget:'preview',releaseMode:'preview',paymentMode:'test',livePaymentsEnabled:false},
    rpcHandler:async()=>{rpcCalls+=1;return {data:null,error:null};}
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await h.routeGateDWebhook({
    checkoutSessionId:'cs_test_ordinaryfixture',orderHint:null,livemode:false
  }))),{route_code:'ordinary',grant_id:null,order_id:null,grant_state:null});
  assert.equal(rpcCalls,0);
});

test('Stripe retry uses the same immutable key and parameters after timeout',async()=>{
  const digest=createHash('sha256').update(`gate-d-v1|mode=payment|payment_method_types=card|order=${order}|amount=5000|currency=usd|expires=${Math.floor(new Date(expires).getTime()/1000)}`).digest('hex');
  const h=loadGateServer({stripeCreate:async(_params,_options,n)=>{
    if(n===1)throw Error('timeout');
    return checkoutSession();
  }});
  const source=prepared(digest);
  await assert.rejects(h.createGateDStripeCheckout(source),/timeout/);
  assert.equal((await h.createGateDStripeCheckout(source)).id,'cs_test_gatedfixture');
  assert.equal(h.stripeCalls.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(h.stripeCalls[0])),JSON.parse(JSON.stringify(h.stripeCalls[1])));
  assert.equal(h.stripeCalls[0].options.idempotencyKey,`gate-d:${attempt}`);
  assert.equal(JSON.stringify(h.stripeCalls[0].params.payment_method_types),'["card"]');
  assert.equal(h.stripeCalls[0].params.client_reference_id,order);
  assert.equal(h.stripeCalls[0].params.metadata,undefined);
});

function loadCheckoutRoute({createResult='success',bindFails=false,reservationCode='reserved'}={}) {
  const loadedModule={exports:{}};
  const calls=[];
  const client={
    auth:{getUser:async()=>({data:{user:{id:buyer}},error:null})},
    from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'buyer'},error:null})})})})
  };
  const gate={
    GATE_D_CSRF_COOKIE:'__Host-gate-d-csrf',GATE_D_QA_BUYER_ID:buyer,
    safeEqual:(a,b)=>a===b,
    reserveGateDAcceptance:async()=>({result_code:reservationCode,grant_id:grant,attempt_id:attempt,lease_epoch:1}),
    prepareGateDCheckout:async()=>prepared('a'.repeat(64)),
    createGateDStripeCheckout:async()=>{
      calls.push('stripe');
      if(createResult==='timeout')throw Error('timeout');
      return checkoutSession();
    },
    bindGateDCheckout:async()=>{calls.push('bind');if(bindFails)throw Error('db failed');},
    recordGateDCheckoutFailure:async(_prepared,code)=>calls.push(code),
    recoverBoundGateDCheckout:async()=>checkoutSession()
  };
  const stubs={
    'node:crypto':{randomBytes},
    'next/headers':{cookies:async()=>({get:()=>({value:'csrf-fixture'})})},
    'next/server':{NextResponse:{json:(body,init={})=>({body,status:init.status||200,headers:init.headers,cookies:{set(){}}})}},
    '@/lib/env':{env:{appUrl:'https://example.invalid'}},
    '@/services/gate-d/server':gate,
    '@/services/supabase/server':{createServerSupabaseClient:async()=>client}
  };
  vm.runInNewContext(compile('../app/api/gate-d/checkout/route.ts'),{
    module:loadedModule,exports:loadedModule.exports,Request,URL,TextEncoder,console,require:name=>{
      assert.ok(Object.hasOwn(stubs,name),`Unmocked dependency: ${name}`);return stubs[name];
    }
  });
  return {...loadedModule.exports,calls};
}

function checkoutRequest({origin='https://example.invalid',site='same-origin'}={}) {
  return new Request('https://example.invalid/api/gate-d/checkout',{
    method:'POST',headers:{'content-type':'application/json',origin,'sec-fetch-site':site},
    body:JSON.stringify({orderId:order,csrfToken:'csrf-fixture'})
  });
}

test('hidden checkout route enforces origin/CSRF and never returns an unbound URL',async()=>{
  const denied=loadCheckoutRoute();
  assert.equal((await denied.POST(checkoutRequest({origin:'https://evil.invalid'}))).status,403);
  assert.equal(denied.calls.length,0);
  const oversized=new Request('https://example.invalid/api/gate-d/checkout',{
    method:'POST',headers:{'content-type':'application/json',origin:'https://example.invalid','sec-fetch-site':'same-origin'},
    body:JSON.stringify({orderId:order,csrfToken:'x'.repeat(5000)})
  });
  assert.equal((await denied.POST(oversized)).status,413);
  const invalidShape=new Request('https://example.invalid/api/gate-d/checkout',{
    method:'POST',headers:{'content-type':'application/json',origin:'https://example.invalid','sec-fetch-site':'same-origin'},body:'null'
  });
  assert.equal((await denied.POST(invalidShape)).status,400);

  const inProgress=loadCheckoutRoute({reservationCode:'checkout_creation_in_progress'});
  assert.equal((await inProgress.POST(checkoutRequest())).status,409);
  assert.equal(inProgress.calls.length,0);

  const timeout=loadCheckoutRoute({createResult:'timeout'});
  const timeoutResponse=await timeout.POST(checkoutRequest());
  assert.equal(timeoutResponse.status,503);
  assert.equal(Object.hasOwn(timeoutResponse.body,'url'),false);
  assert.deepEqual(timeout.calls,['stripe','provider_timeout']);

  const failedBind=loadCheckoutRoute({bindFails:true});
  const failedResponse=await failedBind.POST(checkoutRequest());
  assert.equal(failedResponse.status,503);
  assert.equal(Object.hasOwn(failedResponse.body,'url'),false);
  assert.deepEqual(failedBind.calls,['stripe','bind','database_binding_failed']);

  const success=loadCheckoutRoute();
  const successResponse=await success.POST(checkoutRequest());
  assert.equal(successResponse.status,200);
  assert.equal(successResponse.body.url,checkoutSession().url);
  assert.deepEqual(success.calls,['stripe','bind']);
});

function receiptHarness({mismatch=false}={}) {
  const calls=[];
  const bytes=Buffer.from('%PDF-1.4 exact Gate D receipt fixture');
  const artifact={bytes,sha256:createHash('sha256').update(bytes).digest('hex'),byteSize:bytes.byteLength,mimeType:'application/pdf'};
  const jobs={asset_preparation:'11111111-1111-4111-8111-111111111111',receipt_generation:'22222222-2222-4222-8222-222222222222',transaction_projection:'33333333-3333-4333-8333-333333333333'};
  const rpcHandler=async(name,args)=>{
    calls.push([name,args]);
    if(name==='gate_d_claim_job')return {data:[{job_id:jobs[args.p_task],contract_id:'44444444-4444-4444-8444-444444444444',task:args.p_task,revision:1,event_id:'55555555-5555-4555-8555-555555555555',lease_token:'66666666-6666-4666-8666-666666666666',lease_until:expires}],error:null};
    if(name==='gate_d_prepare_receipt')return {data:[{receipt_id:'77777777-7777-4777-8777-777777777777',object_path:`gate-d/${grant}/receipt-v1.pdf`,order_id:order,payment_date:'2026-10-04T00:00:00Z',track_title:'Track',license_name:'Standard',amount_minor:5000,currency:'USD',payment_intent_id:'pi_fixture'}],error:null};
    if(name==='gate_d_seal_receipt')return {data:[{object_id:'88888888-8888-4888-8888-888888888888',object_version:'v1'}],error:null};
    if(name==='gate_d_consume_acceptance')return {data:'consumed',error:null};
    return {data:'complete',error:null};
  };
  const readback=mismatch?Buffer.from('different receipt bytes'):bytes;
  const storage={
    upload:async()=>({data:null,error:{message:'already exists'}}),
    download:async()=>({data:new Blob([readback],{type:'application/pdf'}),error:null})
  };
  const h=loadGateServer({rpcHandler,storage,receiptRenderer:()=>artifact});
  return {h,calls,artifact};
}

test('receipt retry adopts only exact bytes and seals the deterministic Storage identity',async()=>{
  const {h,calls}=receiptHarness();
  assert.equal(await h.runGateDAcceptanceJobs(grant),'consumed');
  const seal=calls.find(([name])=>name==='gate_d_seal_receipt');
  assert.ok(seal);
  assert.equal(seal[1].p_adopted,true);
  assert.equal(seal[1].p_grant_id,grant);
  assert.equal(seal[1].p_mime_type,'application/pdf');
  assert.equal(calls.filter(([name])=>name==='gate_d_finish_job').length,3);
  assert.equal(calls.at(-1)[0],'gate_d_consume_acceptance');
});

test('receipt retry mismatch applies a security hold and cannot seal or consume',async()=>{
  const {h,calls}=receiptHarness({mismatch:true});
  await assert.rejects(h.runGateDAcceptanceJobs(grant),/readback mismatch/);
  assert.equal(calls.some(([name])=>name==='gate_d_apply_security_hold'),true);
  assert.equal(calls.some(([name])=>name==='gate_d_seal_receipt'),false);
  assert.equal(calls.some(([name])=>name==='gate_d_consume_acceptance'),false);
});
