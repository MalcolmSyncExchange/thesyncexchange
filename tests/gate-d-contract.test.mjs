import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

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
