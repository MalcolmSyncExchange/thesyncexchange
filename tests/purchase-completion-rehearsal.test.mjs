import test from 'node:test';
import assert from 'node:assert/strict';
import {database,source,ids} from './helpers/artist-baseline-db.mjs';
const captured=JSON.parse(source('tests/fixtures/purchase-completion/production-shape.json'));
const migration=source('supabase/migrations/20261002045900_purchase_completion_foundation.sql');
const tables=['orders','generated_licenses','order_activity_log','tracks','rights_holders'];
const inventory=`select table_name as "table",column_name as "column",udt_name as type,is_nullable as nullable,column_default as "default"
 from information_schema.columns where table_schema='public' and table_name in (${tables.map(x=>`'${x}'`).join(',')}) order by table_name,ordinal_position`;
test('Disposable PR27 schema matches captured production commerce columns; seven ledger entries are evidence, not replay instructions',async()=>{
 const db=await database('pr27');try{
 const local=(await db.query(inventory)).rows;
 const production=captured.columns.filter(x=>tables.includes(x.table));
 const sort=rows=>rows.map(x=>JSON.stringify(Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))))).sort();
 assert.deepEqual(sort(local),sort(production));
 assert.equal(captured.migrations.length,7);
 // Existing safety constraints are checked semantically; historical production
 // NOT VALID flags are retained as provenance, never repaired by this migration.
 const constraints=(await db.query(`select conrelid::regclass::text as "table",pg_get_constraintdef(oid) as definition
 from pg_constraint where conrelid in ('public.orders'::regclass,'public.generated_licenses'::regclass)`)).rows;
 for(const table of ['orders','generated_licenses']) {
  const normalize=s=>s.replace(/ NOT VALID/g,'');
  for(const c of captured.constraints.filter(x=>x.table===table))
   assert.ok(constraints.some(x=>x.table===table&&normalize(x.definition)===normalize(c.definition)),`${table}: ${c.definition}`);
 }
 }finally{await db.close();}
});
test('Additive migration preserves pre-existing order/agreement/activity rows and protected schema',async()=>{
 const db=await database('pr27');try{
 await db.exec(`insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents,currency,status,paid_at)
 values('${ids.order}','${ids.buyer}','${ids.live}','${ids.license}',5000,'USD','fulfilled',now());
 insert into generated_licenses(order_id,buyer_id,track_id,agreement_number,status,pdf_storage_path)
 values('${ids.order}','${ids.buyer}','${ids.live}','LEGACY-KEEP','generated','legacy/keep.pdf');
 insert into order_activity_log(order_id,source,event_type,message) values('${ids.order}','system','legacy_fixture','Preserve')`);
 const beforeColumns=(await db.query(inventory)).rows;
 const beforeRows=(await db.query('select row_to_json(o) as row from orders o union all select row_to_json(g) from generated_licenses g union all select row_to_json(a) from order_activity_log a')).rows;
 const beforePolicies=(await db.query("select * from pg_policies where schemaname='public' order by tablename,policyname")).rows;
 await db.exec(migration);
 assert.deepEqual((await db.query(inventory)).rows,beforeColumns);
 assert.deepEqual((await db.query('select row_to_json(o) as row from orders o union all select row_to_json(g) from generated_licenses g union all select row_to_json(a) from order_activity_log a')).rows,beforeRows);
 const afterPolicies=(await db.query("select * from pg_policies where schemaname='public' and policyname not like 'commerce_%' order by tablename,policyname")).rows;
 assert.deepEqual(afterPolicies,beforePolicies);
 assert.equal((await db.query('select count(*)::int n from order_delivery_contracts')).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname in ('guard_referenced_media_version','guard_commerce_storage_version')")).rows[0].n,2);
 }finally{await db.close();}
});
