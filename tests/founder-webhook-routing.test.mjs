// Local composition test: actual environment diagnostics, webhook handler,
// Gate D service and SQL classifier. No hosted credentials or network calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,timingSafeEqual} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import Stripe from 'stripe';
import * as paymentMode from '../lib/payment-mode.mjs';
import * as deploymentTarget from '../lib/deployment-target.mjs';
import * as maintenance from '../lib/maintenance-mode.mjs';
import {database,asActor} from './helpers/artist-baseline-db.mjs';

const order='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const grant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fixtureEnv={
  NETLIFY:'true',CONTEXT:'production',NEXT_PUBLIC_APP_URL:'https://thesyncexchange.com',
  NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anon',
  SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-only',NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:'pk_test_synthetic',
  STRIPE_SECRET_KEY:'sk_test_synthetic',STRIPE_WEBHOOK_SECRET:'whsec_synthetic',
  SYNC_EXCHANGE_PAYMENT_MODE:'test',SYNC_EXCHANGE_DEMO_MODE:'false',SYNC_EXCHANGE_MAINTENANCE_MODE:'off'
};

function load(path,dependencies,variables=fixtureEnv) {
  const loadedModule={exports:{}};
  const compiled=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  vm.runInNewContext(compiled,{
    module:loadedModule,exports:loadedModule.exports,Buffer,URL,Response,Request,console:{...console,warn(){}},process:{env:variables},
    require:name=>{
      assert.ok(Object.hasOwn(dependencies,name),`Unmocked dependency: ${name}`);
      return dependencies[name];
    }
  });
  return loadedModule.exports;
}

function harness({db,account,classification,error}={}) {
  const variables={...fixtureEnv,...(account===undefined?{}:{STRIPE_ACCOUNT_ID:account})};
  const env=load('lib/env.ts',{'./deployment-target.mjs':deploymentTarget},variables);
  const serverEnv=load('lib/server-env.ts',{'@/lib/env':env,'@/lib/payment-mode.mjs':paymentMode},variables);
  const rpcCalls=[];
  const ordinary=[];
  const effects=[];
  const stripe=new Stripe(variables.STRIPE_SECRET_KEY);
  const admin={
    rpc:async(name,args)=>{
      rpcCalls.push({name,args});
      if(name!=='gate_d_route_webhook') {
        effects.push(name);
        throw Error('Unexpected Gate D side effect');
      }
      if(error)return {data:null,error:{message:'classifier unavailable'}};
      if(classification)return {data:[classification],error:null};
      // Parameterized call to the unchanged repository SQL, never a hosted DB.
      return asActor(db,null,async()=>({
        data:(await db.query('select * from public.gate_d_route_webhook($1,$2,$3,$4,$5)',[
          args.p_checkout_session_id,args.p_order_hint,args.p_provider_account,args.p_livemode,args.p_connect_account
        ])).rows,error:null
      }),'service_role');
    },
    storage:{
      from(){effects.push('storage');throw Error('Unexpected Storage access');},
      listBuckets:async()=>({data:['avatars','cover-art','track-audio','track-previews','agreements'].map(name=>({name})),error:null})
    },
    from:()=>({select:()=>({
      limit:async()=>({data:[],error:null}),
      in:async()=>({data:['digital-campaign','broadcast','exclusive-buyout'].map(slug=>({slug})),error:null})
    })})
  };
  const common={
    'server-only':{},'node:crypto':{createHash,timingSafeEqual},
    '@/lib/env':env,'@/lib/server-env':serverEnv,
    '@/services/supabase/admin':{createAdminSupabaseClient:()=>admin},
    '@/services/stripe/server':{
      getStripeServerClient:()=>stripe,
      syncOrderFromStripeSession:async input=>ordinary.push(['paid',input]),
      markOrderCheckoutSessionPaymentFailed:async input=>ordinary.push(['failed',input]),
      markOrderRefundedByPaymentIntent:async()=>{throw Error('unused');},
      recordOrderDisputeByPaymentIntent:async()=>{throw Error('unused');}
    },
    '@/lib/gate-d/receipt':{gateDReceiptObjectPath(){throw Error('Unexpected receipt');},renderGateDReceipt(){throw Error('Unexpected receipt');}},
    'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    'next/cache':{revalidatePath(){}},stripe:{},
    '@/lib/maintenance-mode.mjs':maintenance,
    '@/lib/monitoring':{reportOperationalError(){},reportOperationalEvent(){}}
  };
  const gate=load('services/gate-d/server.ts',common,variables);
  const route=load('app/api/webhooks/stripe/route.ts',{...common,'@/services/gate-d/server':gate},variables);
  const health=load('app/api/health/config/route.ts',common,variables);
  const schema=load('services/supabase/schema-compat.ts',{},variables);
  const readiness=load('app/api/health/readiness/route.ts',{
    ...common,'@/services/supabase/schema-compat':schema,
    '@/lib/storage':{storageBuckets:{avatars:'avatars',coverArt:'cover-art',trackAudio:'track-audio',trackPreviews:'track-previews',agreements:'agreements'}}
  },variables);
  return {route,gate,health,readiness,serverEnv,rpcCalls,ordinary,effects,stripe};
}

function event(overrides={}) {
  return {id:'evt_synthetic',type:'checkout.session.completed',created:1790964000,livemode:false,
    data:{object:{id:'cs_test_synthetic',client_reference_id:order,payment_status:'paid',
      payment_intent:'pi_synthetic',amount_total:5000,currency:'usd'}},...overrides};
}

function send(h,input=event(),{badSignature=false,missingSignature=false}={}) {
  const payload=JSON.stringify(input);
  const signature=h.stripe.webhooks.generateTestHeaderString({payload,secret:'whsec_synthetic'});
  return h.route.POST(new Request('https://synthetic.invalid/api/webhooks/stripe',{
    method:'POST',headers:missingSignature?{}:{'stripe-signature':badSignature?`${signature}broken`:signature},body:payload
  }));
}

test('production-beta TEST composition with absent Gate D account routes signed ordinary events and stays dormant',async()=>{
  const db=await database('repository',{seed:false});
  try {
    const h=harness({db});
    assert.equal(h.serverEnv.serverEnv.stripeAccountId,undefined);
    const before=(await db.query('select * from commerce_private.capabilities')).rows;
    for(const key of ['foundation_enabled','payment_adapter_enabled','asset_preparation_enabled',
      'receipt_generation_enabled','entitlement_activation_enabled','transaction_projection_enabled']) {
      assert.equal(before[0][key],false,key);
    }
    assert.equal((await db.query('select count(*)::int n from commerce_private.acceptance_grants')).rows[0].n,0);
    const health=await h.health.GET();
    assert.equal(health.status,200);
    assert.equal((await health.json()).livePaymentsEnabled,false);
    const readiness=await h.readiness.GET();
    assert.equal(readiness.status,200);
    assert.equal((await readiness.json()).status,'healthy');
    for(const type of ['checkout.session.completed','checkout.session.async_payment_succeeded']) {
      assert.equal((await send(h,event({type}))).status,200);
    }
    const failed=event({type:'checkout.session.async_payment_failed'});
    failed.data.object.payment_status='unpaid';
    assert.equal((await send(h,failed)).status,200);
    // A replay continues to the existing ordinary adapter with the same evidence.
    assert.equal((await send(h)).status,200);
    assert.deepEqual(h.ordinary.map(([kind])=>kind),['paid','paid','failed','paid']);
    assert.equal(h.ordinary[0][1].verifiedEvent.evidenceSha256,h.ordinary[3][1].verifiedEvent.evidenceSha256);
    assert.equal(h.rpcCalls.length,4);
    assert.ok(h.rpcCalls.every(({args})=>args.p_provider_account===null));
    assert.deepEqual(h.effects,[]);
    assert.deepEqual((await db.query('select * from commerce_private.capabilities')).rows,before);
    for(const table of ['acceptance_grants','fulfillment_jobs','payment_events']) {
      assert.equal((await db.query(`select count(*)::int n from commerce_private.${table}`)).rows[0].n,0);
    }
  } finally {await db.close();}
});

test('real Stripe signature verification and TEST mode reject input before Gate D classification',async()=>{
  const h=harness();
  for(const options of [{badSignature:true},{missingSignature:true}]) {
    assert.equal((await send(h,event(),options)).status,400);
  }
  assert.equal((await send(h,event({livemode:true}))).status,400);
  assert.equal((await send(h,event({account:'acct_connected'}))).status,400);
  assert.deepEqual(h.rpcCalls,[]);
  assert.deepEqual(h.ordinary,[]);
  assert.deepEqual(h.effects,[]);
});

test('Gate D positive execution still requires its reviewed configuration after classification',async()=>{
  const classification={route_code:'gate_d',grant_id:grant,order_id:order,grant_state:'checkout_bound'};
  for(const account of [undefined,'not-an-account']) {
    // Defensive contract test: even a positive classifier result cannot skip
    // runtime authority. Real SQL null/mismatch behavior is covered separately.
    const h=harness({account,classification});
    assert.equal((await send(h)).status,500);
    assert.equal(h.rpcCalls.length,1);
    assert.deepEqual(h.ordinary,[]);
    assert.deepEqual(h.effects,[]);
  }
});

test('retained Gate D conflicts and classifier failures never fall through to ordinary processing',async()=>{
  for(const account of [undefined,'acct_wrong']) {
    const h=harness({account,classification:{route_code:'conflict',grant_id:grant,order_id:order,grant_state:'checkout_bound'}});
    assert.equal((await send(h)).status,500);
    assert.deepEqual(h.ordinary,[]);
    assert.deepEqual(h.effects,[]);
  }
  const failed=harness({error:true});
  assert.equal((await send(failed)).status,500);
  assert.deepEqual(failed.ordinary,[]);
});
