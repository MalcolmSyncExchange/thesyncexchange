import test from 'node:test';
import assert from 'node:assert/strict';

import {asActor,database,ids,quote} from './helpers/artist-baseline-db.mjs';

const qaBuyer='8ffc95e8-0e8f-428e-ac26-925d6bc98fcd';
const qaSession='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherSession='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const gateOrder='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const assetId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const digest='a'.repeat(64);

const one=async(db,sql)=>(await db.query(sql)).rows[0];
const value=async(db,sql)=>(await one(db,`select ${sql} as value`)).value;
const service=(db,fn)=>asActor(db,null,fn,'service_role');

async function setup() {
  const db=await database();
  await db.exec(`
    insert into auth.users(id,email) values('${qaBuyer}','qa-buyer@thesyncexchange.com');
    insert into user_profiles(id,email,role,full_name)
      values('${qaBuyer}','qa-buyer@thesyncexchange.com','buyer','Gate D QA Buyer');
    insert into buyer_profiles(user_id,company_name,industry_type,buyer_type,billing_email)
      values('${qaBuyer}','Gate D QA','QA','Producer','qa-buyer@thesyncexchange.com');
    insert into auth.sessions(id,user_id) values('${qaSession}','${qaBuyer}'),('${otherSession}','${qaBuyer}');
    insert into storage.objects(bucket_id,name,version,metadata)
      values('purchase-assets','${assetId}/master','gate-v1','{"size":100,"mimetype":"audio/wav"}');
    insert into commerce_private.asset_versions(
      id,track_id,source_object_id,source_bucket,source_path,source_version,
      object_id,object_version,sha256,byte_size,mime_type,state,approval_state
    )
    select '${assetId}',t.id,s.id,'track-audio',t.audio_file_path,s.version,
      d.id,d.version,'${digest}',100,'audio/wav','ready','approved'
    from tracks t
    join storage.objects s on s.bucket_id='track-audio' and s.name=t.audio_file_path
    join storage.objects d on d.bucket_id='purchase-assets' and d.name='${assetId}/master'
    where t.id='${ids.live}';
    insert into commerce_private.qa_fixture_designations(asset_version_id,buyer_user_id,approval_reference)
      values('${assetId}','${qaBuyer}','gate-d-local-fixture-proof');
    insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents,currency)
      values('${gateOrder}','${qaBuyer}','${ids.live}','${ids.license}',5000,'USD');
    insert into commerce_private.acceptance_grants(
      buyer_user_id,order_id,seller_user_id,track_id,license_type_id,asset_version_id,
      amount_minor,currency,provider_account,approval_reference,operator_reference
    ) values(
      '${qaBuyer}','${gateOrder}','${ids.a}','${ids.live}','${ids.license}','${assetId}',
      5000,'USD','acct_gatefixture','d1-local-approved-contract','local-security-test'
    );
  `);
  return db;
}

async function reserve(db,session=qaSession,user=qaBuyer,role='authenticated') {
  return asActor(db,user,()=>one(db,`select * from public.gate_d_reserve_acceptance('${gateOrder}')`),role,session);
}

async function prepare(db,reservation) {
  return service(db,()=>one(db,`select * from public.gate_d_prepare_checkout(
    '${reservation.grant_id}','${reservation.attempt_id}',${reservation.lease_epoch}
  )`));
}

async function bind(db,prepared,session='cs_test_gatedfixture') {
  const providerExpiresAt=new Date(prepared.provider_expires_at).toISOString();
  return service(db,()=>value(db,`public.gate_d_bind_checkout(
    '${prepared.grant_id}','${prepared.attempt_id}','${prepared.reservation_lease_token}',
    ${prepared.reservation_lease_epoch},'${prepared.stripe_parameters_sha256}',
    '${session}','${providerExpiresAt}'
  )`));
}

async function paidOrder(db,session='cs_test_gatedfixture',intent='pi_gatedfixture') {
  await db.exec(`
    update orders set status='paid',paid_at=now(),stripe_payment_intent_id='${intent}'
      where id='${gateOrder}' and stripe_checkout_session_id='${session}';
    insert into generated_licenses(
      order_id,buyer_id,track_id,license_type_id,agreement_number,status,
      terms_snapshot_json,pdf_storage_path,pdf_content_type,pdf_size_bytes
    ) values(
      '${gateOrder}','${qaBuyer}','${ids.live}','${ids.license}','GATE-D-LOCAL-1','generated',
      '{"payment":{"paymentMode":"test","commercialRightsGranted":"false"},"license":{"pricePaidCents":"5000","currency":"USD"}}',
      '${qaBuyer}/${gateOrder}/agreement.pdf','application/pdf',100
    );
  `);
}

async function recordPaid(db,grant,session='cs_test_gatedfixture',intent='pi_gatedfixture',event='evt_gatedfixture') {
  return service(db,()=>value(db,`public.gate_d_record_verified_payment(
    '${grant}','${event}','${session}','${intent}','checkout.session.completed',
    5000,'USD','${digest}','2026-10-04T00:00:00Z'
  )`));
}

async function completeJobs(db,grant) {
  const asset=await service(db,()=>one(db,`select * from public.gate_d_claim_job('${grant}','asset_preparation')`));
  await service(db,()=>value(db,`public.gate_d_finish_job('${grant}','${asset.job_id}','${asset.lease_token}',true,false,null)`));

  const receipt=await service(db,()=>one(db,`select * from public.gate_d_claim_job('${grant}','receipt_generation')`));
  const snapshot=await service(db,()=>one(db,`select * from public.gate_d_prepare_receipt('${grant}','${receipt.job_id}','${receipt.lease_token}')`));
  await db.exec(`insert into storage.objects(bucket_id,name,version,metadata)
    values('order-receipts',${quote(snapshot.object_path)},'receipt-v1','{"size":40,"mimetype":"application/pdf"}')`);
  await service(db,()=>one(db,`select * from public.gate_d_seal_receipt(
    '${grant}','${receipt.job_id}','${receipt.lease_token}','${digest}',40,'application/pdf',false
  )`));
  await service(db,()=>value(db,`public.gate_d_finish_job('${grant}','${receipt.job_id}','${receipt.lease_token}',true,false,null)`));

  const projection=await service(db,()=>one(db,`select * from public.gate_d_claim_job('${grant}','transaction_projection')`));
  await service(db,()=>value(db,`public.gate_d_finish_job('${grant}','${projection.job_id}','${projection.lease_token}',true,false,null)`));
}

async function withDb(run) {
  const db=await setup();
  try { await run(db); } finally { await db.close(); }
}

test('D1 migrations are dormant and zero-data healthy before a separately inserted local fixture/grant',async()=>{
  const db=await database('repository',{seed:false});
  try {
    assert.deepEqual(await one(db,`select
      (select count(*)::int from commerce_private.asset_versions) assets,
      (select count(*)::int from commerce_private.qa_fixture_designations) designations,
      (select count(*)::int from commerce_private.acceptance_grants) grants`),
      {assets:0,designations:0,grants:0});
    assert.deepEqual(await one(db,`select foundation_enabled,asset_preparation_enabled,receipt_generation_enabled,
      entitlement_activation_enabled,transaction_projection_enabled,payment_adapter_enabled
      from commerce_private.capabilities`),{
      foundation_enabled:false,asset_preparation_enabled:false,receipt_generation_enabled:false,
      entitlement_activation_enabled:false,transaction_projection_enabled:false,payment_adapter_enabled:false
    });
  } finally { await db.close(); }
});

test('Gate D tables and helpers have no direct API-role authority; reservation has one exact grantee',()=>withDb(async db=>{
  for(const role of ['anon','authenticated','service_role']) {
    assert.equal((await one(db,`select has_table_privilege('${role}','commerce_private.acceptance_grants','select') allowed`)).allowed,false);
    assert.equal((await one(db,`select has_table_privilege('${role}','commerce_private.acceptance_grant_audit','insert') allowed`)).allowed,false);
  }
  assert.equal((await one(db,`select has_function_privilege('authenticated','public.gate_d_reserve_acceptance(uuid)','execute') allowed`)).allowed,true);
  assert.equal((await one(db,`select has_function_privilege('anon','public.gate_d_reserve_acceptance(uuid)','execute') allowed`)).allowed,false);
  assert.equal((await one(db,`select has_function_privilege('service_role','public.gate_d_prepare_checkout(uuid,uuid,bigint)','execute') allowed`)).allowed,true);
  assert.equal((await one(db,`select has_function_privilege('authenticated','public.gate_d_prepare_checkout(uuid,uuid,bigint)','execute') allowed`)).allowed,false);
  assert.equal((await one(db,`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='commerce_private' and c.relkind='S' and c.relname like 'acceptance_%'`)).n,0);
  await assert.rejects(service(db,()=>db.query('select * from commerce_private.acceptance_grants')),/permission denied/);
}));

test('reservation fails closed for missing, malformed, deleted, foreign-role and foreign-user sessions',()=>withDb(async db=>{
  assert.equal((await reserve(db,'')).result_code,'unavailable');
  assert.equal((await reserve(db,'malformed')).result_code,'unavailable');
  assert.equal((await reserve(db,qaSession,ids.a)).result_code,'unavailable');
  await assert.rejects(reserve(db,qaSession,qaBuyer,'anon'),/permission denied/);
  await db.exec(`delete from auth.sessions where id='${qaSession}'`);
  assert.equal((await reserve(db,qaSession)).result_code,'unavailable');
  await db.exec(`insert into auth.sessions(id,user_id) values('${qaSession}','${ids.a}')`);
  assert.equal((await reserve(db,qaSession)).result_code,'unavailable');
}));

test('reservation binds one immutable attempt/session/key and lease recovery only rotates its worker fence',()=>withDb(async db=>{
  const first=await reserve(db);
  assert.equal(first.result_code,'reserved');
  const before=await one(db,`select attempt_id,stripe_idempotency_key,reservation_lease_token,reservation_lease_epoch
    from commerce_private.acceptance_grants where id='${first.grant_id}'`);
  const other=await reserve(db,otherSession);
  assert.equal(other.result_code,'unavailable');
  await db.exec(`update commerce_private.acceptance_grants set reservation_lease_until=now()-interval '1 second'
    where id='${first.grant_id}'`);
  const recovered=await reserve(db);
  const after=await one(db,`select attempt_id,stripe_idempotency_key,reservation_lease_token,reservation_lease_epoch
    from commerce_private.acceptance_grants where id='${first.grant_id}'`);
  assert.equal(recovered.result_code,'reservation_recovered');
  assert.equal(after.attempt_id,before.attempt_id);
  assert.equal(after.stripe_idempotency_key,before.stripe_idempotency_key);
  assert.notEqual(after.reservation_lease_token,before.reservation_lease_token);
  assert.equal(after.reservation_lease_epoch,before.reservation_lease_epoch+1);
  assert.equal(Object.hasOwn(recovered,'reservation_lease_token'),false);
}));

test('global partial index permits retained terminal history but rejects two nonterminal grants',()=>withDb(async db=>{
  await assert.rejects(db.exec(`insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents,currency)
    values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','${qaBuyer}','${ids.live}','${ids.license}',5000,'USD');
    insert into commerce_private.acceptance_grants(
      buyer_user_id,order_id,seller_user_id,track_id,license_type_id,asset_version_id,
      amount_minor,currency,provider_account,approval_reference,operator_reference
    ) values('${qaBuyer}','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','${ids.a}','${ids.live}',
      '${ids.license}','${assetId}',5000,'USD','acct_gatefixture','second','operator')`),/unique|duplicate/);
  const grant=(await one(db,'select id from commerce_private.acceptance_grants')).id;
  await db.exec(`update commerce_private.acceptance_grants set state='revoked',revoked_at=now() where id='${grant}'`);
  await db.exec(`insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents,currency)
    values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','${qaBuyer}','${ids.live}','${ids.license}',5000,'USD');
    insert into commerce_private.acceptance_grants(
      buyer_user_id,order_id,seller_user_id,track_id,license_type_id,asset_version_id,
      amount_minor,currency,provider_account,approval_reference,operator_reference
    ) values('${qaBuyer}','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','${ids.a}','${ids.live}',
      '${ids.license}','${assetId}',5000,'USD','acct_gatefixture','second','operator')`);
  assert.equal((await one(db,'select count(*)::int n from commerce_private.acceptance_grants')).n,2);
}));

test('prepare and bind derive trusted facts, retain capabilities OFF, and route Gate D only by exact Session',()=>withDb(async db=>{
  const reservation=await reserve(db);
  const prepared=await prepare(db,reservation);
  assert.equal(prepared.order_id,gateOrder);
  assert.equal(prepared.amount_minor,5000);
  assert.equal(prepared.currency,'USD');
  assert.match(prepared.stripe_parameters_sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(await one(db,`select state,commercial_rights_granted from order_asset_entitlements`),
    {state:'pending',commercial_rights_granted:false});
  assert.equal(await bind(db,prepared),'checkout_bound');
  const exact=await service(db,()=>one(db,`select * from public.gate_d_route_webhook(
    'cs_test_gatedfixture','${gateOrder}','acct_gatefixture',false,null)`));
  assert.equal(exact.route_code,'gate_d');
  const conflict=await service(db,()=>one(db,`select * from public.gate_d_route_webhook(
    'cs_test_unboundfixture','${gateOrder}','acct_gatefixture',false,null)`));
  assert.equal(conflict.route_code,'conflict');
  const ordinary=await service(db,()=>one(db,`select * from public.gate_d_route_webhook(
    'cs_test_ordinaryfixture',null,'acct_gatefixture',false,null)`));
  assert.equal(ordinary.route_code,'ordinary');
  const connect=await service(db,()=>one(db,`select * from public.gate_d_route_webhook(
    'cs_test_gatedfixture','${gateOrder}','acct_gatefixture',false,'acct_connected')`));
  assert.equal(connect.route_code,'conflict');
  await assert.rejects(service(db,()=>one(db,`select * from public.gate_d_route_webhook(
    'malformed','${gateOrder}','acct_gatefixture',false,null)`)),/Invalid Gate D webhook/);
}));

test('stale checkout worker cannot bind after lease recovery and entitlement activation is never claimable',()=>withDb(async db=>{
  const reservation=await reserve(db);
  const stale=await prepare(db,reservation);
  await db.exec(`update commerce_private.acceptance_grants set reservation_lease_until=now()-interval '1 second'
    where id='${stale.grant_id}'`);
  const recovered=await reserve(db);
  const current=await prepare(db,recovered);
  await assert.rejects(bind(db,stale,'cs_test_stale'),/Stale|mismatched/);
  assert.equal(await bind(db,current),'checkout_bound');
  await assert.rejects(service(db,()=>one(db,`select * from public.gate_d_claim_job(
    '${current.grant_id}','entitlement_activation')`)),/not claimable/);
}));

test('verified payment creates exactly four jobs, three claimable jobs complete, and final consume is atomic/idempotent',()=>withDb(async db=>{
  const reservation=await reserve(db);
  const prepared=await prepare(db,reservation);
  await bind(db,prepared);
  await paidOrder(db);
  await recordPaid(db,prepared.grant_id);
  assert.deepEqual((await db.query(`select task from commerce_private.fulfillment_jobs order by task`)).rows.map(r=>r.task),
    ['asset_preparation','entitlement_activation','receipt_generation','transaction_projection']);
  const activation=await one(db,`select state,attempts,lease_token,lease_until from commerce_private.fulfillment_jobs
    where task='entitlement_activation'`);
  assert.deepEqual(activation,{state:'pending',attempts:0,lease_token:null,lease_until:null});
  await completeJobs(db,prepared.grant_id);
  const consumed=await service(db,()=>value(db,`public.gate_d_consume_acceptance('${prepared.grant_id}')`));
  assert.equal(consumed,'consumed');
  assert.equal(await service(db,()=>value(db,`public.gate_d_consume_acceptance('${prepared.grant_id}')`)),'consumed');
  assert.deepEqual(await one(db,`select state,security_hold_state from commerce_private.acceptance_grants`),
    {state:'consumed',security_hold_state:'none'});
  const entitlement=(await one(db,'select entitlement_id from commerce_private.acceptance_grants')).entitlement_id;
  assert.equal(await service(db,()=>value(db,`commerce_private.can_deliver(
    '${entitlement}','${qaBuyer}')`)),false);
  assert.equal((await one(db,`select count(*)::int n from order_receipts`)).n,1);
  assert.equal((await one(db,`select count(*)::int n from artist_transaction_records`)).n,1);
}));

test('incomplete final invariant is retained as an audit failure and never consumes',()=>withDb(async db=>{
  const reservation=await reserve(db);
  const prepared=await prepare(db,reservation);
  await bind(db,prepared);
  await paidOrder(db);
  await recordPaid(db,prepared.grant_id);
  const result=await service(db,()=>value(db,`public.gate_d_consume_acceptance('${prepared.grant_id}')`));
  assert.notEqual(result,'consumed');
  assert.equal((await one(db,'select state from commerce_private.acceptance_grants')).state,'paid_verified');
  assert.equal((await one(db,`select count(*)::int n from commerce_private.acceptance_grant_audit
    where event_type='acceptance_invariant_failed'`)).n,1);
}));

test('RPCs revalidate confused-deputy job identities and reject any enabled capability',()=>withDb(async db=>{
  const reservation=await reserve(db);
  const prepared=await prepare(db,reservation);
  await bind(db,prepared);
  await paidOrder(db);
  await recordPaid(db,prepared.grant_id);
  const activation=await one(db,`select id from commerce_private.fulfillment_jobs where task='entitlement_activation'`);
  await assert.rejects(service(db,()=>value(db,`public.gate_d_finish_job(
    '${prepared.grant_id}','${activation.id}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,false,null)`)),/job\/grant mismatch/);
  await assert.rejects(service(db,()=>one(db,`select * from public.gate_d_prepare_receipt(
    '${prepared.grant_id}','${activation.id}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')`)),/receipt lease mismatch/);
  await db.exec(`update commerce_private.capabilities set foundation_enabled=true where singleton`);
  await assert.rejects(service(db,()=>value(db,`public.gate_d_consume_acceptance('${prepared.grant_id}')`)),/capabilities OFF/);
  assert.equal((await one(db,`select state from commerce_private.acceptance_grants`)).state,'paid_verified');
}));

test('late signed payment after verified unpaid revocation is preserved, held, and cannot reopen the grant',()=>withDb(async db=>{
  const reservation=await reserve(db);
  const prepared=await prepare(db,reservation);
  await bind(db,prepared);
  await service(db,()=>value(db,`public.gate_d_request_revocation('${prepared.grant_id}','operator_requested')`));
  assert.equal(await service(db,()=>value(db,`public.gate_d_reconcile_revocation(
    '${prepared.grant_id}','cs_test_gatedfixture','unpaid_expired')`)),'revoked');
  await paidOrder(db);
  await recordPaid(db,prepared.grant_id,'cs_test_gatedfixture','pi_gatedfixture','evt_lategatedpayment');
  assert.deepEqual(await one(db,`select state,security_hold_state,security_hold_reason from commerce_private.acceptance_grants`),
    {state:'revoked',security_hold_state:'applied',security_hold_reason:'terminal_late_payment'});
  assert.equal((await one(db,`select state from order_asset_entitlements`)).state,'suspended');
  assert.equal((await one(db,`select count(*)::int n from commerce_private.acceptance_grant_audit
    where event_type='terminal_payment_preserved'`)).n,1);
  assert.equal((await one(db,`select count(*)::int n from commerce_private.fulfillment_jobs`)).n,0);
}));

test('audit is append-only, typed, sequenced, and contains no unrestricted JSON column',()=>withDb(async db=>{
  await reserve(db);
  const rows=(await db.query('select sequence,event_type from commerce_private.acceptance_grant_audit order by sequence')).rows;
  assert.deepEqual(rows.map(r=>r.sequence),rows.map((_,i)=>i+1));
  await assert.rejects(db.exec(`update commerce_private.acceptance_grant_audit set safe_result_code='changed'`),/append-only/);
  assert.equal((await one(db,`select count(*)::int n from information_schema.columns
    where table_schema='commerce_private' and table_name='acceptance_grant_audit' and data_type='jsonb'`)).n,0);
  assert.equal((await one(db,`select count(*)::int n from information_schema.columns
    where table_schema='commerce_private' and table_name='acceptance_grant_audit'
      and column_name in ('reservation_lease_token','stripe_idempotency_key','stripe_parameters_sha256')`)).n,0);
}));
