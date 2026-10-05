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

function loadGateServer({rpcHandler,stripeCreate,storage,receiptRenderer,runtime,appUrl='https://example.invalid'}={}) {
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
    '@/lib/env':{env:{appUrl},getDeploymentTarget:()=> 'production'},
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
    '@/services/stripe/server':{getStripeServerClient:()=>stripe},
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

function stable(value) {
  if(value===null || ['boolean','number','string'].includes(typeof value))return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
  const keys=Object.keys(value).filter(key=>value[key]!==undefined).sort();
  return `{${keys.map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}

function requestSpec(facts={}) {
  const source={orderId:order,amountMinor:5000,currency:'USD',providerExpiresAt:expires,
    trackTitle:'Gate D Track',trackSlug:'gate-d-track',licenseName:'Standard',appUrl:'https://example.invalid',...facts};
  return {
    cancel_url:`${source.appUrl}/buyer/checkout/${source.trackSlug}?error=Gate%20D%20TEST%20checkout%20was%20canceled.`,
    client_reference_id:source.orderId,
    expires_at:Math.floor(new Date(source.providerExpiresAt).getTime()/1000),
    line_items:[{price_data:{currency:source.currency.toLowerCase(),product_data:{
      description:'The Sync Exchange production-beta TEST acceptance checkout.',
      name:`${source.trackTitle} - ${source.licenseName}`
    },unit_amount:source.amountMinor},quantity:1}],
    mode:'payment',payment_method_types:['card'],
    success_url:`${source.appUrl}/license-confirmation/${source.orderId}?session_id={CHECKOUT_SESSION_ID}`
  };
}

function prepared(overrides={}) {
  const source={
    grant_id:grant,attempt_id:attempt,reservation_lease_token:lease,reservation_lease_epoch:1,
    stripe_idempotency_key:`gate-d:${attempt}`,
    provider_expires_at:expires,order_id:order,amount_minor:5000,currency:'USD',
    track_title:'Gate D Track',track_slug:'gate-d-track',license_name:'Standard',...overrides
  };
  const spec=requestSpec({orderId:source.order_id,amountMinor:source.amount_minor,currency:source.currency,
    providerExpiresAt:source.provider_expires_at,trackTitle:source.track_title,trackSlug:source.track_slug,
    licenseName:source.license_name});
  source.stripe_request_spec=stable(spec);
  source.stripe_parameters_sha256=createHash('sha256').update(source.stripe_request_spec).digest('hex');
  return source;
}

test('canonical Checkout request is deterministic and database/app drift stops before Stripe dispatch',async()=>{
  let trusted;
  const h=loadGateServer({rpcHandler:async name=>name==='gate_d_prepare_checkout'
    ? {data:[trusted],error:null}:{data:null,error:null}});
  const spec=requestSpec();
  const reordered={success_url:spec.success_url,payment_method_types:spec.payment_method_types,mode:spec.mode,
    line_items:spec.line_items,expires_at:spec.expires_at,client_reference_id:spec.client_reference_id,cancel_url:spec.cancel_url};
  assert.equal(h.gateDCanonicalCheckoutParameters(spec),h.gateDCanonicalCheckoutParameters(reordered));
  assert.equal(h.gateDCheckoutParameterDigest(spec),createHash('sha256').update(stable(spec)).digest('hex'));
  trusted=prepared();
  trusted.stripe_parameters_sha256='0'.repeat(64);
  await assert.rejects(h.prepareGateDCheckout({grant_id:grant,attempt_id:attempt,lease_epoch:1}),/parameter drift/);
  assert.equal(h.stripeCalls.length,0);
});

test('every Checkout request input drift rejects locally before Stripe',async()=>{
  const factCases=[
    ['product title',{track_title:'Different Track'}],
    ['license description',{license_name:'Different License'}],
    ['slug',{track_slug:'different-slug'}],
    ['amount',{amount_minor:5001}],
    ['currency',{currency:'EUR'}],
    ['expiry',{provider_expires_at:'2026-10-04T00:31:00.000Z'}],
    ['order reference',{order_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}]
  ];
  for(const [label,changes] of factCases) {
    const h=loadGateServer();
    const candidate={...prepared(),...changes};
    await assert.rejects(h.createGateDStripeCheckout(candidate),/parameter drift/,label);
    assert.equal(h.stripeCalls.length,0,label);
  }
  const requestCases=[
    ['product description',request=>request.line_items[0].price_data.product_data.description='changed'],
    ['success path',request=>request.success_url=request.success_url.replace('/license-confirmation/','/changed/')],
    ['cancel path',request=>request.cancel_url=request.cancel_url.replace('/buyer/checkout/','/changed/')],
    ['payment method',request=>request.payment_method_types=['link']]
  ];
  for(const [label,mutate] of requestCases) {
    const h=loadGateServer();
    const candidate=prepared();
    const request=JSON.parse(candidate.stripe_request_spec);mutate(request);
    candidate.stripe_request_spec=stable(request);
    candidate.stripe_parameters_sha256=createHash('sha256').update(candidate.stripe_request_spec).digest('hex');
    await assert.rejects(h.createGateDStripeCheckout(candidate),/parameter drift/,label);
    assert.equal(h.stripeCalls.length,0,label);
  }
  const changedApp=loadGateServer({appUrl:'https://changed.example.invalid'});
  await assert.rejects(changedApp.createGateDStripeCheckout(prepared()),/parameter drift/,'application URL');
  assert.equal(changedApp.stripeCalls.length,0);
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
  const h=loadGateServer({stripeCreate:async(_params,_options,n)=>{
    if(n===1)throw Error('timeout');
    return checkoutSession();
  }});
  const source=prepared();
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
  class GateDCheckoutParameterDriftError extends Error {}
  const gate={
    GATE_D_CSRF_COOKIE:'__Host-gate-d-csrf',GATE_D_QA_BUYER_ID:buyer,
    GateDCheckoutParameterDriftError,
    safeEqual:(a,b)=>a===b,
    reserveGateDAcceptance:async()=>({result_code:reservationCode,grant_id:grant,attempt_id:attempt,lease_epoch:1}),
    prepareGateDCheckout:async()=>prepared(),
    createGateDStripeCheckout:async()=>{
      calls.push('stripe');
      if(createResult==='timeout')throw Error('timeout');
      if(createResult==='drift')throw new GateDCheckoutParameterDriftError('drift');
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

  const drift=loadCheckoutRoute({createResult:'drift'});
  assert.equal((await drift.POST(checkoutRequest())).status,503);
  assert.deepEqual(drift.calls,['stripe','parameter_drift']);

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

function receiptHarness({preexisting=true,mismatch=false,readbackType='application/pdf',downloadError=false,sealSequence=[]}={}) {
  const calls=[];
  const bytes=Buffer.from('%PDF-1.4 exact Gate D receipt fixture');
  const artifact={bytes,sha256:createHash('sha256').update(bytes).digest('hex'),byteSize:bytes.byteLength,mimeType:'application/pdf'};
  const jobs={asset_preparation:'11111111-1111-4111-8111-111111111111',receipt_generation:'22222222-2222-4222-8222-222222222222',transaction_projection:'33333333-3333-4333-8333-333333333333'};
  let sealAttempt=0;
  const rpcHandler=async(name,args)=>{
    calls.push([name,args]);
    if(name==='gate_d_claim_job')return {data:[{job_id:jobs[args.p_task],contract_id:'44444444-4444-4444-8444-444444444444',task:args.p_task,revision:1,event_id:'55555555-5555-4555-8555-555555555555',lease_token:'66666666-6666-4666-8666-666666666666',lease_until:expires}],error:null};
    if(name==='gate_d_prepare_receipt')return {data:[{receipt_id:'77777777-7777-4777-8777-777777777777',object_path:`gate-d/${grant}/receipt-v1.pdf`,order_id:order,payment_date:'2026-10-04T00:00:00Z',track_title:'Track',license_name:'Standard',amount_minor:5000,currency:'USD',payment_intent_id:'pi_fixture'}],error:null};
    if(name==='gate_d_seal_receipt') {
      const outcome=sealSequence[sealAttempt++];
      if(outcome?.error)return {data:null,error:outcome.error};
      if(outcome?.missing)return {data:[{}],error:null};
      return {data:[{object_id:'88888888-8888-4888-8888-888888888888',object_version:'v1'}],error:null};
    }
    if(name==='gate_d_consume_acceptance')return {data:'consumed',error:null};
    return {data:'complete',error:null};
  };
  let stored=preexisting?(mismatch?Buffer.from('different receipt bytes'):bytes):null;
  let uploadCount=0;
  const storage={
    upload:async(_path,body,options)=>{
      uploadCount+=1;calls.push(['storage_upload',{options}]);
      if(stored)return {data:null,error:{message:'already exists'}};
      stored=Buffer.from(body);return {data:{},error:null};
    },
    download:async()=>downloadError
      ? {data:null,error:{message:'temporary transport failure'}}
      : {data:stored?new Blob([stored],{type:readbackType}):null,error:null}
  };
  const h=loadGateServer({rpcHandler,storage,receiptRenderer:()=>artifact});
  return {h,calls,artifact,get uploadCount(){return uploadCount;}};
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
  assert.equal(calls.find(([name])=>name==='storage_upload')[1].options.upsert,false);
});

test('receipt retry mismatch applies a security hold and cannot seal or consume',async()=>{
  const {h,calls}=receiptHarness({mismatch:true});
  await assert.rejects(h.runGateDAcceptanceJobs(grant),/readback mismatch/);
  assert.equal(calls.some(([name])=>name==='gate_d_apply_security_hold'),true);
  assert.equal(calls.some(([name])=>name==='gate_d_seal_receipt'),false);
  assert.equal(calls.some(([name])=>name==='gate_d_consume_acceptance'),false);
});

test('receipt seal transport failure remains retryable and retry adopts the same object',async()=>{
  const harness=receiptHarness({preexisting:false,sealSequence:[{error:{message:'connection lost',code:'08006'}},{}]});
  await assert.rejects(harness.h.runGateDAcceptanceJobs(grant),/connection lost/);
  assert.equal(harness.calls.some(([name,args])=>name==='gate_d_finish_job' && args.p_error_code==='receipt_seal_retryable'),true);
  assert.equal(harness.calls.some(([name])=>name==='gate_d_apply_security_hold'),false);
  assert.equal(await harness.h.runGateDAcceptanceJobs(grant),'consumed');
  const seals=harness.calls.filter(([name])=>name==='gate_d_seal_receipt');
  assert.equal(seals.length,2);
  assert.equal(seals[1][1].p_adopted,true);
  assert.equal(harness.uploadCount,2);
  assert.equal(harness.calls.filter(([name])=>name==='storage_upload').every(([,args])=>args.options.upsert===false),true);
});

test('receipt lost seal response retries exact adoption without a hold or overwrite',async()=>{
  const harness=receiptHarness({preexisting:false,sealSequence:[{error:{message:'response lost'}},{}]});
  await assert.rejects(harness.h.runGateDAcceptanceJobs(grant),/response lost/);
  assert.equal(harness.calls.some(([name])=>name==='gate_d_apply_security_hold'),false);
  assert.equal(await harness.h.runGateDAcceptanceJobs(grant),'consumed');
  assert.equal(harness.calls.filter(([name])=>name==='storage_upload').every(([,args])=>args.options.upsert===false),true);
});

test('receipt identity and MIME conflicts hold while readback transport remains retryable',async()=>{
  for(const [label,options] of [
    ['wrong MIME',{readbackType:'application/octet-stream'}],
    ['wrong object/version',{sealSequence:[{error:{message:'sealed mismatch',code:'23514'}}]}],
    ['missing seal identity',{sealSequence:[{missing:true}]}]
  ]) {
    const {h,calls}=receiptHarness(options);
    await assert.rejects(h.runGateDAcceptanceJobs(grant),/mismatch|identity/i,label);
    assert.equal(calls.some(([name])=>name==='gate_d_apply_security_hold'),true,label);
    assert.equal(calls.some(([name])=>name==='gate_d_consume_acceptance'),false,label);
  }
  const transient=receiptHarness({downloadError:true});
  await assert.rejects(transient.h.runGateDAcceptanceJobs(grant),/transport/);
  assert.equal(transient.calls.some(([name,args])=>name==='gate_d_finish_job' && args.p_error_code==='receipt_readback_retryable'),true);
  assert.equal(transient.calls.some(([name])=>name==='gate_d_apply_security_hold'),false);
});
