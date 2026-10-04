import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

import {fixtureBootstrapSql} from './helpers/artist-baseline-db.mjs';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const schema=read('supabase/migrations/20261004023232_gate_d_acceptance_schema.sql');
const functions=read('supabase/migrations/20261004023241_gate_d_acceptance_functions.sql');

test('D1 has exactly two executable Gate D migrations and no data or capability mutation',()=>{
  const files=readdirSync(new URL('supabase/migrations/',root)).filter(name=>name.includes('gate_d_acceptance'));
  assert.deepEqual(files.sort(),[
    '20261004023232_gate_d_acceptance_schema.sql',
    '20261004023241_gate_d_acceptance_functions.sql'
  ]);
  assert.doesNotMatch(`${schema}\n${functions}`,/update\s+commerce_private\.capabilities/i);
  assert.doesNotMatch(`${schema}\n${functions}`,/insert\s+into\s+commerce_private\.acceptance_grants/i);
  assert.doesNotMatch(`${schema}\n${functions}`,/insert\s+into\s+commerce_private\.qa_fixture_designations/i);
});

test('every Gate D function is a hardened definer and RPC grants are closed',()=>{
  for(const migration of [schema,functions]) {
    const declarations=[...migration.matchAll(/create function\s+[^;]+?\$\$/gis)].map(match=>match[0]);
    assert.ok(declarations.length>0);
    for(const declaration of declarations) {
      assert.match(declaration,/security definer/i);
      assert.match(declaration,/set search_path\s*=\s*''/i);
      assert.doesNotMatch(declaration,/execute\s+/i);
    }
  }
  assert.match(schema,/revoke all on commerce_private\.acceptance_grants,[\s\S]*from public,anon,authenticated,service_role/i);
  assert.match(functions,/grant execute on function public\.gate_d_reserve_acceptance\(uuid\) to authenticated/i);
  assert.match(functions,/gate_d_consume_acceptance\(uuid\)[\s\S]*to service_role/i);
  assert.doesNotMatch(functions,/grant execute[\s\S]*gate_d_prepare_checkout[\s\S]*to authenticated/i);
});

test('cleanup draft removes authority while retaining evidence and lives outside executable migrations',()=>{
  const cleanup=read('docs/gate-d-d1/cleanup-migration-draft.sql');
  assert.match(cleanup,/revoke all on function public\.gate_d_reserve_acceptance\(uuid\)/i);
  assert.match(cleanup,/drop function public\.gate_d_consume_acceptance\(uuid\)/i);
  assert.match(cleanup,/drop function commerce_private\.gate_d_require_capabilities_off\(\)/i);
  assert.doesNotMatch(cleanup,/drop\s+table/i);
  assert.doesNotMatch(cleanup,/drop\s+trigger/i);
  assert.equal(readdirSync(new URL('supabase/migrations/',root)).some(name=>name.includes('cleanup')&&name.includes('gate_d')),false);
});

test('production adapter prohibition and hidden/unlinked acceptance entry point remain intact',()=>{
  const serverEnv=read('lib/server-env.ts');
  const gateRoute=read('app/api/gate-d/checkout/route.ts');
  const gateServer=read('services/gate-d/server.ts');
  assert.match(serverEnv,/rawPurchaseCompletionAdapterEnabled === "true" && deploymentTarget === "production"/);
  assert.match(gateServer,/adapter\.requested/);
  assert.match(gateServer,/runtime\.livePaymentsEnabled/);
  assert.match(gateServer,/payment_method_types:\s*\["card"\]/);
  assert.doesNotMatch(gateServer,/metadata\s*:/);
  assert.match(gateRoute,/GATE_D_QA_BUYER_ID/);
  assert.match(gateRoute,/sec-fetch-site/);
  assert.match(gateRoute,/GATE_D_CSRF_COOKIE/);
  const linked=readdirSync(new URL('app/',root),{recursive:true})
    .filter(path=>/\.(?:ts|tsx|js|jsx|mjs)$/.test(path) && path!=='api/gate-d/checkout/route.ts')
    .some(path=>read(`app/${path}`).includes('/api/gate-d/checkout'));
  assert.equal(linked,false);
});

test('D1 remediation contracts freeze the full Stripe request and reject Connect globally',()=>{
  const gateServer=read('services/gate-d/server.ts');
  const webhook=read('app/api/webhooks/stripe/route.ts');
  for(const field of ['cancel_url','client_reference_id','expires_at','line_items','currency','product_data',
    'description','name','unit_amount','quantity','mode','payment_method_types','success_url']) {
    assert.match(gateServer,new RegExp(`\\b${field}\\b`),field);
  }
  assert.match(schema,/stripe_request_spec text/);
  assert.match(schema,/stripe_request_spec is null.*stripe_parameters_sha256 is null/);
  assert.match(functions,/stripe_request_spec = canonical_parameters/);
  assert.match(functions,/g\.stripe_request_spec is distinct from canonical_parameters/);
  assert.ok(webhook.indexOf('event.account != null')<webhook.indexOf('switch (event.type)'));
  assert.ok(functions.indexOf('if p_connect_account is not null')<functions.indexOf('where ag.checkout_session_id = p_checkout_session_id'));
  assert.match(functions,/existing\.provider_event_id = p_provider_event_id[\s\S]*existing\.evidence_sha256 = p_evidence_sha256[\s\S]*existing\.provider_created_at = p_provider_created_at/);
  assert.match(schema,/database_system.*authenticated_buyer.*stripe_webhook.*service_worker.*operator.*reconciliation/);
});

test('zero-data A then B installs, B without A fails atomically, and forward recovery succeeds',async()=>{
  const db=new PGlite();
  try {
    await db.exec(fixtureBootstrapSql);
    const prior=readdirSync(new URL('supabase/migrations/',root)).filter(file=>file.endsWith('.sql') && file<'20261004023232_gate_d_acceptance_schema.sql').sort();
    for(const file of prior)await db.exec(read(`supabase/migrations/${file}`).replace(/create extension if not exists "pgcrypto";/gi,''));
    await assert.rejects(db.exec(functions),/Gate D schema migration is missing/);
    await db.exec('rollback');
    assert.equal((await db.query(`select to_regclass('commerce_private.acceptance_grants') is null absent`)).rows[0].absent,true);
    await db.exec(schema);
    await db.exec(functions);
    assert.deepEqual((await db.query(`select
      (select count(*)::int from commerce_private.acceptance_grants) grants,
      (select count(*)::int from commerce_private.acceptance_grant_audit) audits,
      to_regprocedure('public.gate_d_prepare_checkout(uuid,uuid,bigint,text)') is not null prepared`)).rows[0],
      {grants:0,audits:0,prepared:true});
  } finally { await db.close(); }
});
