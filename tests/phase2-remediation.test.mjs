import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { calculateFunnel } from '../lib/analytics/intelligence/funnel.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { buildSECReadModels } from '../lib/analytics/intelligence/read-models.ts';
import { readAnalyticsSource } from '../lib/analytics/intelligence/source-reader.ts';
import { dashboardRequest } from '../lib/analytics/intelligence/dashboard.ts';
import { eventSchemas } from '../lib/analytics/schema.ts';
import { PGlite } from '@electric-sql/pglite';
import { database, fixtureBootstrapSql, pgliteDigestFixtureSql, adaptMigrationForPGlite, seedDatabase, ids } from './helpers/artist-baseline-db.mjs';
const range={startInclusive:'2026-01-01T00:00:00Z',endExclusive:'2026-01-03T00:00:00Z'};
const request={range,environment:'preview',timezone:'UTC',granularity:'hour',now:new Date('2026-02-01'),maxStepLagMs:86400000};
const observations=Array.from({length:101},(_,i)=>({eventId:`event-${i}`,actorId:`private-actor-${i}`,actorRole:'buyer',event:'track_preview_started',trackId:`track-${String(i).padStart(3,'0')}`,occurredAt:'2026-01-01T01:00:00Z',environment:'preview',isTest:false,isInternal:false}));
const source={state:'available',type:'fixture',observations,instrumentedEvents:Object.keys(eventSchemas),queriedRange:{startInclusive:'2025-12-01',endExclusive:'2026-02-01'},observedThrough:'2025-12-01',coverageVerified:false,lastUpdatedAt:null};
test('track pagination exposes total, stable ordering and every track exactly once without changing totals',()=>{
 const reports=[1,2,3].map(trackPage=>buildSECReadModels(source,{...request,trackPage}));
 assert.deepEqual(reports.map(r=>r.tracks.length),[50,50,1]);
 assert.equal(reports[0].trackPage.total,101);assert.equal(reports[0].trackPage.pages,3);
 const ids=reports.flatMap(r=>r.tracks.map(t=>t.trackId));assert.deepEqual(ids,observations.map(r=>r.trackId));
 for(const report of reports){assert.equal(report.marketplace.find(c=>c.id==='track_preview_started').metric.value,101);assert.ok(!JSON.stringify(report).includes('private-actor'));}
 assert.throws(()=>buildSECReadModels(source,{...request,trackPage:4}),/out_of_range/);
});
test('hourly range limits reject rather than truncate and dashboard rejects invalid pages',()=>{
 assert.throws(()=>buildSECReadModels(source,{...request,range:{...range,endExclusive:'2026-01-09'}}),/at most seven days/);
 assert.throws(()=>dashboardRequest({start:'2026-01-01',end:'2026-01-09',interval:'hour'}),/at most seven days/);
 for(const trackPage of ['0','1.5','Infinity','11'])assert.throws(()=>dashboardRequest({start:'2026-01-01',end:'2026-01-03',trackPage}),/invalid_track_page/);
});
test('expired aggregation deadline never returns a complete report',()=>assert.throws(()=>buildSECReadModels(source,{...request,deadlineAt:Date.now()-1}),/report_deadline/));
test('timestamp lower bounds retain equal-time rows and exact half-open buckets',()=>{
 const data=buildSECReadModels(source,request);assert.equal(data.series[0].metrics.find(c=>c.id==='track_preview_started').metric.value,0);assert.equal(data.series[1].metrics.find(c=>c.id==='track_preview_started').metric.value,101);assert.equal(data.series[2].metrics.find(c=>c.id==='track_preview_started').metric.value,0);
});
test('shared source deadline aborts a stalled page and returns no evidence',async()=>{
 const keepAlive=setInterval(()=>{},100);let calls=0,signal;
 try{const result=await readAnalyticsSource({readBudgetMs:20,authorizeAdmin:async()=>true,openReader:()=>async q=>{signal=q.signal;calls++;return new Promise(()=>{});}},range,'preview',Object.keys(eventSchemas));assert.equal(result.state,'unavailable_source');assert.equal(result.observations.length,0);assert.equal(calls,1);assert.equal(signal.aborted,true);}finally{clearInterval(keepAlive);}
});
test('authorization shares the deadline and never opens a client on timeout or denial',async()=>{
 const keepAlive=setInterval(()=>{},100);let opened=false;
 try{await assert.rejects(readAnalyticsSource({readBudgetMs:20,authorizeAdmin:()=>new Promise(()=>{}),openReader:()=>{opened=true;}},range,'preview',[]),/report_deadline/);assert.equal(opened,false);await assert.rejects(readAnalyticsSource({authorizeAdmin:async()=>false,openReader:()=>{opened=true;}},range,'preview',[]),/admin_required/);assert.equal(opened,false);}finally{clearInterval(keepAlive);}
});
test('preview tests and internal evidence remain excluded after optimization',()=>{
 const data=buildSECReadModels({...source,observations:observations.map(r=>({...r,isTest:true}))},request);assert.equal(data.marketplace.find(c=>c.id==='track_preview_started').metric.value,0);assert.equal(data.trackPage.total,0);assert.equal(data.marketplace[0].coverage.finalized,false);
});
test('reporting index migration is idempotent and preserves service-role-only boundaries',async()=>{
 const db=await database();try{const sql=readFileSync(new URL('../supabase/migrations/20261011210517_analytics_reporting_index.sql',import.meta.url),'utf8');await db.exec(sql);const index=(await db.query("select indexdef from pg_indexes where indexname='analytics_outbox_reporting_time_id'")).rows[0].indexdef;assert.match(index,/environment, occurred_at, id/);assert.match(index,/is_test = false/);assert.match(index,/is_internal = false/);const grants=(await db.query("select grantee from information_schema.role_table_grants where table_name='analytics_outbox' and grantee in ('anon','authenticated')")).rows;assert.equal(grants.length,0);}finally{await db.close();}
});

test('requested series metric retains totals and unavailable states; unknown metrics reject',()=>{
 const selected=buildSECReadModels(source,{...request,seriesMetric:'track_preview_started'});
 assert.ok(selected.series.every(bucket=>bucket.metrics.length===1));assert.equal(selected.series[1].metrics[0].metric.value,101);
 const failed=buildSECReadModels({...source,state:'unavailable_source'},{...request,seriesMetric:'track_preview_started'});assert.equal(failed.series[1].metrics[0].metric.state,'unavailable_source');
 assert.throws(()=>buildSECReadModels(source,{...request,seriesMetric:'private_actor'}),/invalid_series_metric/);
});

test('release inventory covers every exact migration byte and execution packs preserve originals',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../docs/posthog-phase2-release/migration-manifest.json',import.meta.url)));
 const history=JSON.parse(readFileSync(new URL('../docs/posthog-phase2-release/hosted-history.json',import.meta.url)));
 assert.equal(manifest.migrations.length,36);assert.equal(history.migrations.length,34);
 assert.deepEqual(manifest.migrations.map(item=>item.file),readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort());
 for(const item of manifest.migrations)assert.equal(createHash('sha256').update(readFileSync(new URL(`../supabase/migrations/${item.file}`,import.meta.url))).digest('hex'),item.sha256);
 for(const item of history.migrations)assert.equal(createHash('sha256').update(readFileSync(new URL(`../supabase/migrations/${item.name}.sql`,import.meta.url))).digest('hex'),item.sha256);
 for(const [label,file,version,count] of [['reliability','20261011191427_analytics_delivery_reliability.sql','20261011191427',34],['reporting-index','20261011210517_analytics_reporting_index.sql','20261011210517',35]]){
  const pack=readFileSync(new URL(`../docs/posthog-phase2-release/${label}-execution.sql`,import.meta.url),'utf8');
  const original=readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');
  assert.ok(pack.includes(original));assert.ok(pack.includes(`array[$original_sql$${original}$original_sql$]`));
  assert.match(pack,/set local lock_timeout = '3s'/);assert.match(pack,/set local statement_timeout = '30s'/);
  assert.match(pack,/lock table public.analytics_outbox in access exclusive mode/);assert.ok(pack.includes(`<> ${count}`));
  assert.ok(pack.includes(`values ('${version}'`));assert.match(pack,/delivered_at is null or lease_until > now\(\)/);
  assert.ok(pack.endsWith('commit;\n'));assert.ok(!pack.includes('sgpubcpldfxcuhjjdcau'));
 }
});

test('funnel matching cooperatively rejects an elapsed deadline without producing conversion evidence',()=>{
 assert.throws(()=>calculateFunnel({funnel:'buyer_checkout',source:'available',environment:'preview',instrumentedEvents:Object.keys(eventSchemas),deadlineAt:Date.now()-1,observations:[{...observations[0],event:'license_selected'}],window:{...range,observedThrough:'2026-01-07',maxStepLagMs:86400000}}),/report_deadline/);
});

test('failed or truncated source never reports a complete zero-track total',()=>{
 for(const state of ['unavailable_source','insufficient_evidence']){const report=buildSECReadModels({...source,state},{...request,trackPage:2});assert.equal(report.trackPage.total,null);assert.equal(report.trackPage.pages,null);assert.equal(report.marketplace[0].metric.value,null);}
});

async function hostedFixture() {
 const db=new PGlite();
 await db.exec(`${fixtureBootstrapSql}\n${pgliteDigestFixtureSql}`);
 const history=JSON.parse(readFileSync(new URL('../docs/posthog-phase2-release/hosted-history.json',import.meta.url))).migrations;
 for(const row of history)await db.exec(adaptMigrationForPGlite(readFileSync(new URL(`../supabase/migrations/${row.name}.sql`,import.meta.url),'utf8')));
 await seedDatabase(db);
 await db.exec('create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
 for(const row of history)await db.query('insert into supabase_migrations.schema_migrations values($1,$2,array[$3::text])',[row.version,row.name,readFileSync(new URL(`../supabase/migrations/${row.name}.sql`,import.meta.url),'utf8')]);
 await db.query("insert into public.analytics_outbox(dedupe_key,environment,event,actor_id,actor_role,properties,is_test,is_internal,delivered_at) select 'review-fixture-'||i,'preview','onboarding_started',$1,'buyer','{}'::jsonb,true,false,now() from generate_series(1,4) i",[ids.buyer]);
 return db;
}
const executionPack=label=>readFileSync(new URL(`../docs/posthog-phase2-release/${label}-execution.sql`,import.meta.url),'utf8');
test('exact approved SQL packs execute locally from the hosted-version fixture and preserve delivered history',async()=>{
 const db=await hostedFixture();try{
 const before=(await db.query('select id,occurred_at,delivered_at from analytics_outbox order by id')).rows;
 await db.exec(executionPack('reliability'));
 assert.equal((await db.query('select count(*)::int as n from supabase_migrations.schema_migrations')).rows[0].n,35);
 assert.deepEqual((await db.query('select id,occurred_at,delivered_at from analytics_outbox order by id')).rows,before);
 assert.ok((await db.query('select delivery_status,attempt_count,delivery_cycle from analytics_outbox')).rows.every(r=>r.delivery_status==='delivered'&&r.attempt_count===0&&r.delivery_cycle===0));
 await db.exec(executionPack('reporting-index'));
 assert.equal((await db.query('select count(*)::int as n from supabase_migrations.schema_migrations')).rows[0].n,36);
 for(const file of ['20261011191427_analytics_delivery_reliability','20261011210517_analytics_reporting_index']){
 const stored=(await db.query("select encode(extensions.digest(array_to_string(statements,E'\\n'),'sha256'),'hex') as hash from supabase_migrations.schema_migrations where name=$1",[file])).rows[0].hash;
 assert.equal(stored,createHash('sha256').update(readFileSync(new URL(`../supabase/migrations/${file}.sql`,import.meta.url))).digest('hex'));
 }
 }finally{await db.close();}
});
test('cutover SQL rejects divergent history/queue and rolls back a fault after DDL',async()=>{
 for(const fault of ['checksum','queue','late']){
 const db=await hostedFixture();try{
 if(fault==='checksum')await db.exec("update supabase_migrations.schema_migrations set statements=array['divergent'] where version='20261010055251'");
 else if(fault==='queue') await db.exec('update analytics_outbox set delivered_at=null where id=(select id from analytics_outbox limit 1)');
 const pack=fault==='late'?executionPack('reliability').replace('insert into supabase_migrations.schema_migrations(version,name,statements)','select 1/0;\ninsert into supabase_migrations.schema_migrations(version,name,statements)'):executionPack('reliability');
 await assert.rejects(db.exec(pack),fault==='checksum'?/checksum divergence/:fault==='queue'?/Outbox baseline changed/:/division by zero/);
 await db.exec('rollback');
 assert.equal((await db.query("select count(*)::int as n from information_schema.columns where table_name='analytics_outbox' and column_name='delivery_status'")).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int as n from supabase_migrations.schema_migrations')).rows[0].n,34);
 }finally{await db.close();}
 }
});
