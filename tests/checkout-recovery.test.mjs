import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import vm from 'node:vm';
import {database,ids,quote,asActor,source} from './helpers/artist-baseline-db.mjs';
const scope='a'.repeat(64)+':test';
const call=async(db,name,args)=>(await db.query(`select public.${name}(${args.map(x=>x===null?'null':quote(typeof x==='object'?JSON.stringify(x):x)).join(',')}) as v`)).rows[0].v;
const reserve=db=>call(db,'reserve_recoverable_checkout',[ids.buyer,ids.live,ids.license]);
function request(id){return {mode:'payment',client_reference_id:id,metadata:{orderId:id,buyerUserId:ids.buyer,trackId:ids.live,licenseTypeId:ids.license,paymentMode:'test'},line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:5000}}]};}
const claim=(db,id,params=request(id))=>call(db,'claim_checkout_attempt',[id,scope,params]);
const finish=(db,id,token,session,outcome)=>call(db,'finish_checkout_attempt',[id,token,session,outcome]);
async function fixture(run){const db=await database();try{await run(db);}finally{await db.close();}}
function recovery(){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(source('services/orders/checkout-recovery.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mod.exports,module:mod,require:n=>{assert.equal(n,'node:crypto');return{createHash};}});return mod.exports;}
function client(db){return {rpc:async(name,args)=>{try{return {data:await call(db,name,Object.values(args)),error:null};}catch(e){return{data:null,error:{message:e.message}};}}};}

test('reservation retries share one pending order and refuse intentional repeats without review',()=>fixture(async db=>{
 const [a,b]=await Promise.all([reserve(db),reserve(db)]);assert.equal(a.id,b.id);assert.equal(a.created_new,true);assert.equal(b.created_new,false);
 assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,1);
 await db.exec(`update orders set status='paid' where id='${a.id}'`);await assert.rejects(reserve(db),/Existing purchase/);
}));
test('private attempt data and service functions reject browser roles and role-null bypass',()=>fixture(async db=>{
 const grants=(await db.query(`select proname,has_function_privilege('anon',oid,'execute') as anon,has_function_privilege('authenticated',oid,'execute') as authenticated
 from pg_proc where pronamespace='public'::regnamespace and proname in ('reserve_recoverable_checkout','claim_checkout_attempt','finish_checkout_attempt','checkout_has_frozen_attempt','record_verified_checkout_payment','record_checkout_adverse_event','hold_checkout_order','claim_order_agreement_job','finish_order_agreement_job')`)).rows;
 assert.equal(grants.length,9);assert.ok(grants.every(g=>!g.anon&&!g.authenticated));
 for(const role of ['anon','authenticated'])await asActor(db,ids.buyer,async()=>{
  await assert.rejects(reserve(db),/permission/);await assert.rejects(db.query('select * from checkout_recovery.attempts'),/permission/);
 },role);
 await db.exec("select set_config('request.jwt.claim.role','',false)");await assert.rejects(reserve(db),/Service role/);
}));
test('lease rejects concurrent acquisition, persists original params and stable key across interruption',()=>fixture(async db=>{
 const {id}=await reserve(db),first=await claim(db,id);assert.equal(first.outcome,'create');assert.equal((await claim(db,id)).outcome,'busy');
 assert.ok(first.request.expires_at>Date.now()/1000+23*3600);
 assert.ok(first.request.expires_at<Date.now()/1000+24*3600);
 await finish(db,id,first.token,null,'uncertain');const retry=await claim(db,id,{...request(id),customer_email:'changed@fixture.invalid'});
 assert.equal(first.key,retry.key);assert.notEqual(first.token,retry.token);assert.deepEqual(first.request,retry.request);
 await assert.rejects(finish(db,id,first.token,'cs_test_old','bound'),/lease lost/);
 await finish(db,id,retry.token,'cs_test_fixture','bound');assert.equal((await claim(db,id)).outcome,'retrieve');
 await assert.rejects(db.exec(`update orders set amount_cents=1 where id='${id}'`),/frozen/);
 await assert.rejects(db.exec(`update orders set stripe_checkout_session_id='cs_test_rebound' where id='${id}'`),/binding is frozen/);
}));
test('old unknown operations stop before key retention expires; legacy ambiguity requires reconciliation',()=>fixture(async db=>{
 const {id}=await reserve(db);await claim(db,id);
 await db.exec(`update checkout_recovery.attempts set started_at=clock_timestamp()-interval '23 hours' where order_id='${id}'`);
 assert.equal((await claim(db,id)).outcome,'reconcile');
 await db.exec(`delete from checkout_recovery.attempts;update orders set created_at=now()-interval '1 day' where id='${id}'`);
 assert.equal((await claim(db,id)).outcome,'reconcile');
}));
test('known provider expiration closes only unpaid order and permits a fresh reservation',()=>fixture(async db=>{
 const {id}=await reserve(db),a=await claim(db,id);await finish(db,id,a.token,'cs_test_expired','bound');
 await assert.rejects(finish(db,id,null,'cs_test_other','expired'),/Known session/);
 await finish(db,id,null,'cs_test_expired','expired');const next=await reserve(db);assert.notEqual(next.id,id);
 const b=await claim(db,next.id);await finish(db,next.id,b.token,'cs_test_paid','bound');await db.exec(`update orders set status='paid',paid_at=now() where id='${next.id}'`);
 await assert.rejects(finish(db,next.id,null,'cs_test_paid','expired'),/paid/);
}));
test('real recovery adapter reuses provider idempotency after response loss and retrieves bound sessions',()=>fixture(async db=>{
 const {id}=await reserve(db);const params=request(id);const sessions=new Map();let calls=0,retrieves=0,lose=true;
 const stripe={checkout:{sessions:{create:async(p,opts)=>{calls++;if(!sessions.has(opts.idempotencyKey))sessions.set(opts.idempotencyKey,{id:'cs_test_recovered',livemode:false,status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/fixture',client_reference_id:id,metadata:p.metadata,amount_total:5000,currency:'usd',expires_at:p.expires_at});
  if(lose){lose=false;throw Error('network response lost');}return sessions.get(opts.idempotencyKey);},retrieve:async()=>{retrieves++;return [...sessions.values()][0];}}}};
 const run=()=>recovery().recoverableCheckout({client:client(db),stripe,secretKey:'fixture-secret-not-real',params});
 await assert.rejects(run(),/pending order was preserved/);assert.equal(sessions.size,1);assert.equal((await run()).id,'cs_test_recovered');assert.equal(sessions.size,1);assert.equal((await run()).id,'cs_test_recovered');assert.equal(calls,2);assert.equal(retrieves,1);
 assert.equal((await db.query('select status from orders')).rows[0].status,'pending');assert.equal((await db.query('select count(*)::int n from generated_licenses')).rows[0].n,0);
}));
test('wrong provider identity, DB outage and completed-unpaid sessions cannot create paid state',()=>fixture(async db=>{
 const {id}=await reserve(db);let creates=0;
 const stripe={checkout:{sessions:{create:async()=>{creates++;return{id:'cs_test_bad',livemode:true};}}}};
 await assert.rejects(recovery().recoverableCheckout({client:client(db),stripe,secretKey:'fixture',params:request(id)}),/could not be confirmed/);
 assert.equal((await db.query('select status from orders')).rows[0].status,'pending');
 await assert.rejects(recovery().recoverableCheckout({client:{rpc:async()=>({data:null,error:{message:'offline'}})},stripe,secretKey:'fixture',params:request(id)}),/unavailable/);assert.equal(creates,1);
}));

const evidence=(id='evt_paid',state='PAID',rest={})=>({providerEventId:id,eventType:state==='PAID'?'checkout.session.completed':'charge.refunded',paymentState:state,checkoutSessionId:'cs_test_fixture',paymentIntentId:'pi_fixture',amountMinor:5000,refundedMinor:0,currency:'USD',evidenceSha256:'a'.repeat(64),providerCreatedAt:'2026-10-21T00:00:00Z',livemode:false,...rest});
const retain=(db,id,e)=>call(db,'record_verified_checkout_payment',[id,scope,e]);
async function paidOrder(db){const {id}=await reserve(db),a=await claim(db,id);await finish(db,id,a.token,'cs_test_fixture','bound');await retain(db,id,evidence());await db.exec(`update orders set status='paid',paid_at=now() where id='${id}'`);return id;}
function licensePayload(id,token){return{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',order_id:id,buyer_id:ids.buyer,track_id:ids.live,license_type_id:ids.license,agreement_number:'ALPHA-SYNTHETIC',status:'generated',terms_snapshot_json:{payment:{paymentMode:'test',commercialRightsGranted:false}},pdf_storage_path:`${ids.buyer}/${id}/${token}.pdf`,pdf_content_type:'application/pdf',pdf_size_bytes:100,html_snapshot:'synthetic',generated_at:'2026-10-21T00:00:00Z'};}

test('unpaid orders and unproven paid flags cannot claim an agreement job',()=>fixture(async db=>{
 const {id}=await reserve(db);await assert.rejects(call(db,'claim_order_agreement_job',[id]),/Paid unheld/);
 await db.exec(`update orders set status='paid',paid_at=now(),stripe_checkout_session_id='cs_test_fixture',stripe_payment_intent_id='pi_fixture' where id='${id}'`);
 await assert.rejects(call(db,'claim_order_agreement_job',[id]),/Retained verified payment/);
 assert.equal((await db.query('select count(*)::int n from generated_licenses')).rows[0].n,0);
}));
test('verified evidence replay is idempotent; conflicting duplicate, account and monetary facts fail',()=>fixture(async db=>{
 const id=await paidOrder(db);await retain(db,id,evidence());assert.equal((await db.query('select count(*)::int n from checkout_recovery.verified_events')).rows[0].n,1);
 await assert.rejects(retain(db,id,evidence('evt_paid','PAID',{evidenceSha256:'b'.repeat(64)})),/Conflicting duplicate/);
 await assert.rejects(retain(db,id,evidence('evt_bad','PAID',{amountMinor:1})),/Invalid/);
 await assert.rejects(call(db,'record_verified_checkout_payment',[id,'b'.repeat(64)+':test',evidence('evt_scope')]),/scope mismatch/);
 await assert.rejects(db.exec('delete from checkout_recovery.verified_events'),/append only/);
 await assert.rejects(db.exec("update checkout_recovery.verified_events set evidence='{}'"),/append only/);
}));
test('concurrent artifact claims, expired workers and replay publish exactly one immutable license',()=>fixture(async db=>{
 const id=await paidOrder(db);const results=await Promise.allSettled([call(db,'claim_order_agreement_job',[id]),call(db,'claim_order_agreement_job',[id])]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const old=results.find(r=>r.status==='fulfilled').value;
 await db.exec(`update checkout_recovery.agreement_jobs set lease_until=now()-interval '1 second' where order_id='${id}'`);
 const token=await call(db,'claim_order_agreement_job',[id]);assert.notEqual(old,token);
 await assert.rejects(call(db,'finish_order_agreement_job',[id,old,licensePayload(id,old)]),/Stale/);
 await call(db,'finish_order_agreement_job',[id,token,licensePayload(id,token)]);
 await assert.rejects(call(db,'finish_order_agreement_job',[id,old,null]),/Stale/);
 await assert.rejects(call(db,'claim_order_agreement_job',[id]),/immutable/);
 const licenses=(await db.query('select pdf_storage_path from generated_licenses')).rows;assert.equal(licenses.length,1);assert.ok(licenses[0].pdf_storage_path.endsWith(token+'.pdf'));
 assert.equal((await db.query('select status from orders')).rows[0].status,'fulfilled');
 await db.exec(`update orders set status='paid' where id='${id}'`);
 assert.equal((await db.query('select status from orders')).rows[0].status,'fulfilled');
 await db.exec(`update orders set status='refunded' where id='${id}';update orders set status='paid' where id='${id}'`);
 assert.equal((await db.query('select status from orders')).rows[0].status,'refunded');
}));
test('artifact interruption can retry; a refund arriving before commit prevents issuance permanently',()=>fixture(async db=>{
 const id=await paidOrder(db);let token=await call(db,'claim_order_agreement_job',[id]);await call(db,'finish_order_agreement_job',[id,token,null]);token=await call(db,'claim_order_agreement_job',[id]);
 await retain(db,id,evidence('evt_partial','PARTIALLY_REFUNDED',{refundedMinor:1000}));
 await assert.rejects(call(db,'finish_order_agreement_job',[id,token,licensePayload(id,token)]),/Paid unheld/);
 await retain(db,id,evidence('evt_latepaid'));
 await assert.rejects(call(db,'claim_order_agreement_job',[id]),/Paid unheld/);
 await assert.rejects(db.exec(`update orders set checkout_hold=false where id='${id}'`),/explicit reconciliation/);
 assert.equal((await db.query('select count(*)::int n from generated_licenses')).rows[0].n,0);
}));
test('failed event followed by stale paid evidence cannot authorize a license',()=>fixture(async db=>{
 const id=await paidOrder(db);
 await retain(db,id,evidence('evt_failed','PAYMENT_FAILED',{eventType:'checkout.session.async_payment_failed'}));await retain(db,id,evidence('evt_late'));
 await assert.rejects(call(db,'claim_order_agreement_job',[id]),/Paid unheld/);
}));
test('retrieval of completed unpaid session waits for signed reconciliation without creating a new session',()=>fixture(async db=>{
 const {id}=await reserve(db),a=await claim(db,id);await finish(db,id,a.token,'cs_test_fixture','bound');let created=0;
 await db.exec(`update checkout_recovery.attempts set scope='${createHash('sha256').update('anything').digest('hex')}:test' where order_id='${id}'`);
 const stripe={checkout:{sessions:{create:async()=>created++,retrieve:async()=>({id:'cs_test_fixture',livemode:false,status:'complete',payment_status:'unpaid',client_reference_id:id,metadata:request(id).metadata,amount_total:5000,currency:'usd',expires_at:a.request.expires_at,url:null})}}};
 await assert.rejects(recovery().recoverableCheckout({client:client(db),stripe,secretKey:'anything',params:request(id)}),/awaiting payment reconciliation/);assert.equal(created,0);
}));
test('unmapped refund/dispute inbox is durable and blocks later paid issuance before an intent is bound',()=>fixture(async db=>{
 const {id}=await reserve(db),a=await claim(db,id);await finish(db,id,a.token,'cs_test_fixture','bound');
 const adverse=evidence('evt_orphan','REFUNDED',{refundedMinor:5000});
 await call(db,'record_checkout_adverse_event',[scope,adverse]);await call(db,'record_checkout_adverse_event',[scope,adverse]);
 assert.equal((await db.query('select stripe_payment_intent_id from orders')).rows[0].stripe_payment_intent_id,null);
 assert.equal((await db.query('select count(*)::int n from checkout_recovery.adverse_inbox')).rows[0].n,1);
 await assert.rejects(call(db,'record_checkout_adverse_event',[scope,{...adverse,evidenceSha256:'b'.repeat(64)}]),/Conflicting/);
 await retain(db,id,evidence());await db.exec(`update orders set status='paid',paid_at=now() where id='${id}'`);
 await assert.rejects(call(db,'claim_order_agreement_job',[id]),/Paid unheld/);
 assert.equal((await db.query('select count(*)::int n from generated_licenses')).rows[0].n,0);
 await assert.rejects(db.exec('delete from checkout_recovery.adverse_inbox'),/append only/);
}));
