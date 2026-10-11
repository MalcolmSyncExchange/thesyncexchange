import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { database, asActor, ids, source, fixtureBootstrapSql, pgliteDigestFixtureSql,
  adaptMigrationForPGlite, seedDatabase } from './helpers/artist-baseline-db.mjs';
import { sendEvent } from '../lib/analytics/transport.ts';
import { nextRetryAt, MAX_DELIVERY_ATTEMPTS } from '../lib/analytics/retry.ts';
import { assessFunnelCoverage, DEFAULT_LATE_ARRIVAL_MS } from '../lib/analytics/intelligence/coverage.ts';

const migration = 'supabase/migrations/20261011191427_analytics_delivery_reliability.sql';
const eventId = '22222222-2222-4222-8222-222222222222';
const cfg = { environment:'preview', host:'https://us.i.posthog.com', token:'phc_local_fixture', internalIds:[], testIds:[] };
const row = {id:eventId,event:'onboarding_started',actor_id:ids.buyer,actor_role:'buyer',properties:{},
  occurred_at:'2026-10-10T00:00:00Z',environment:'preview',is_internal:false,is_test:true};
const load = (path, stubs) => {
  const loadedModule={exports:{}};
  const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(code,{module:loadedModule,exports:loadedModule.exports,Request,Response,URL,AbortSignal,
    require:key=>{assert.ok(Object.hasOwn(stubs,key),`unmocked ${key}`);return stubs[key];}}, {filename:path});
  return loadedModule.exports;
};

test('typed transport classifies only fixed outcomes and preserves private-data boundary',async()=>{
  const sent=[];
  const request=async(_url,options)=>{sent.push(JSON.parse(options.body));return {ok:true,status:200};};
  assert.deepEqual(await sendEvent(cfg,row,request),{kind:'accepted',meaning:'ingestion_only'});
  assert.equal(sent[0].uuid,eventId);assert.equal(sent[0].timestamp,row.occurred_at);
  assert.equal(sent[0].properties.$ip,null);assert.equal(sent[0].properties.$geoip_disable,true);
  assert.ok(!JSON.stringify(sent[0].properties).includes('local_fixture'));
  for(const [status,kind,category] of [[429,'retryable','rate_limited'],[503,'retryable','server_error'],
    [401,'configuration','configuration_error'],[400,'permanent','client_rejected'],[302,'unknown','unknown_error']]) {
    assert.deepEqual(await sendEvent(cfg,row,async()=>({ok:false,status})),{kind,category});
  }
  assert.deepEqual(await sendEvent(cfg,row,async()=>{throw new TypeError('private URL');}),
    {kind:'retryable',category:'network_error'});
  assert.deepEqual(await sendEvent(cfg,row,async()=>{throw Object.assign(new Error('private'),{name:'TimeoutError'});}),
    {kind:'retryable',category:'timeout'});
  assert.deepEqual(await sendEvent(cfg,{...row,environment:'production'},request),
    {kind:'configuration',category:'configuration_error'});
  assert.equal(sent.length,1);
});

test('retry schedule is bounded, deterministic and ends after eight attempts',()=>{
  const now=new Date('2026-10-10T00:00:00Z');
  const delays=[60,300,900,3600,14400,43200,86400];
  assert.equal(MAX_DELIVERY_ATTEMPTS,8);
  for(let attempt=1;attempt<8;attempt++){
    assert.equal(Date.parse(nextRetryAt(attempt,now,()=>0.5))-now.getTime(),delays[attempt-1]*1000);
    assert.ok(Date.parse(nextRetryAt(attempt,now,()=>0))-now.getTime()<delays[attempt-1]*1000);
  }
  assert.equal(nextRetryAt(8,now,()=>0.5),null);
  assert.equal(nextRetryAt(0,now,()=>0.5),null);
});

test('follow-on migration retains delivered rows and makes historical pending rows eligible',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`${fixtureBootstrapSql}\n${pgliteDigestFixtureSql}`);
    for(const file of readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(x=>x.endsWith('.sql') && x!=='20261011191427_analytics_delivery_reliability.sql').sort())
      await db.exec(adaptMigrationForPGlite(source(`supabase/migrations/${file}`)));
    await seedDatabase(db);
    await asActor(db,ids.buyer,async()=>{
      await db.query("insert into analytics_outbox(dedupe_key,environment,event,actor_id,actor_role,properties,is_internal,is_test,delivered_at) values('old-delivered','preview','onboarding_started',$1,'buyer','{}',false,true,now()),('old-pending','preview','onboarding_started',$1,'buyer','{}',false,true,null)",[ids.buyer]);
    },'service_role');
    await db.exec(source(migration));
    const rows=(await db.query("select dedupe_key,delivery_status,attempt_count,delivered_at from analytics_outbox where dedupe_key like 'old-%' order by dedupe_key")).rows;
    assert.equal(rows[0].delivery_status,'delivered');assert.ok(rows[0].delivered_at);
    assert.equal(rows[1].delivery_status,'pending');assert.equal(rows[1].attempt_count,0);
    await asActor(db,ids.buyer,async()=>{
      assert.equal((await db.query("select dedupe_key from claim_analytics_event('preview')")).rows[0].dedupe_key,'old-pending');
    },'service_role');
  } finally {await db.close();}
});

test('real SQL migration, lease state machine, hold/release, exhaustion and privileges',async t=>{
  const db=await database();
  const run=(sql,args=[])=>db.query(sql,args);
  const enqueue=key=>run('select public.enqueue_analytics_event($1,$2,$3,$4,$5,$6,$7,$8) id',
    ['preview','onboarding_started',ids.buyer,'buyer','{}',key,false,true]);
  const claim=id=>run('select * from public.claim_analytics_event($1,$2)',['preview',id]);
  const fail=(id,lease,category,retry=null)=>run('select public.fail_analytics_event($1,$2,$3,$4) ok',[id,lease,category,retry]);
  try {
    await asActor(db,ids.buyer,async()=>{
      const id=(await enqueue('reliable-one')).rows[0].id;
      assert.equal((await enqueue('reliable-one')).rows[0].id,id);
      const original=(await run('select occurred_at,actor_id from analytics_outbox where id=$1',[id])).rows[0];
      const claims=await Promise.all([claim(id),claim(id)]);
      assert.equal(claims.reduce((n,c)=>n+c.rows.length,0),1);
      const first=claims.find(c=>c.rows.length).rows[0];
      assert.equal(first.delivery_status,'processing');assert.equal(first.attempt_count,1);
      assert.equal((await fail(id,first.lease_id,'network_error',new Date(Date.now()+60000).toISOString())).rows[0].ok,true);
      assert.equal((await claim(id)).rows.length,0);
      await run("update analytics_outbox set next_retry_at=now()-interval '1 second' where id=$1",[id]);
      const second=(await claim(id)).rows[0];
      assert.equal(second.attempt_count,2);assert.notEqual(second.lease_id,first.lease_id);
      assert.equal((await run('select public.complete_analytics_event($1,$2) ok',[id,first.lease_id])).rows[0].ok,false);
      assert.equal((await run('select public.complete_analytics_event($1,$2) ok',[id,second.lease_id])).rows[0].ok,true);
      assert.equal((await claim(id)).rows.length,0);
      const delivered=(await run('select * from analytics_outbox where id=$1',[id])).rows[0];
      assert.equal(delivered.delivery_status,'delivered');assert.ok(delivered.delivered_at);
      assert.equal(delivered.occurred_at.getTime(),original.occurred_at.getTime());assert.equal(delivered.actor_id,original.actor_id);

      const heldId=(await enqueue('held-one')).rows[0].id;
      assert.equal((await run('select public.hold_analytics_event($1,$2) ok',['preview',heldId])).rows[0].ok,true);
      assert.equal((await claim(heldId)).rows.length,0);
      assert.equal((await run('select public.release_analytics_event($1,$2) ok',['preview',heldId])).rows[0].ok,true);
      assert.equal((await claim(heldId)).rows[0].attempt_count,1);
      const permanentId=(await enqueue('permanent-one')).rows[0].id;
      const permanent=(await claim(permanentId)).rows[0];
      assert.equal((await fail(permanentId,permanent.lease_id,'client_rejected')).rows[0].ok,true);
      assert.equal((await run('select delivery_status from analytics_outbox where id=$1',[permanentId])).rows[0].delivery_status,'held');
      assert.equal((await claim(permanentId)).rows.length,0);

      const interruptedId=(await enqueue('interrupted-one')).rows[0].id;
      const interrupted=(await claim(interruptedId)).rows[0];
      await run("update analytics_outbox set lease_until=now()-interval '1 second' where id=$1",[interruptedId]);
      const recovered=(await claim(interruptedId)).rows[0];
      assert.equal(recovered.attempt_count,2);assert.notEqual(recovered.lease_id,interrupted.lease_id);
      assert.equal((await run('select public.complete_analytics_event($1,$2) ok',[interruptedId,interrupted.lease_id])).rows[0].ok,false);

      const exhaustedId=(await enqueue('exhaust-one')).rows[0].id;
      for(let attempt=1;attempt<=8;attempt++){
        const current=(await claim(exhaustedId)).rows[0];assert.equal(current.attempt_count,attempt);
        assert.equal((await fail(exhaustedId,current.lease_id,'rate_limited',new Date(Date.now()+60000).toISOString())).rows[0].ok,true);
        if(attempt<8)await run("update analytics_outbox set next_retry_at=now()-interval '1 second' where id=$1",[exhaustedId]);
      }
      assert.equal((await claim(exhaustedId)).rows.length,0);
      assert.equal((await run('select delivery_status,attempt_count from analytics_outbox where id=$1',[exhaustedId])).rows[0].delivery_status,'exhausted');
      assert.equal((await run('select public.release_analytics_event($1,$2) ok',['preview',exhaustedId])).rows[0].ok,true);
      assert.equal((await claim(exhaustedId)).rows[0].attempt_count,1);
      const health=(await run('select public.get_analytics_delivery_health($1) data',['preview'])).rows[0].data;
      assert.ok(health.statuses.delivered>=1);assert.ok(!JSON.stringify(health).includes(ids.buyer));
    },'service_role');
    await db.exec(source(migration));
    assert.ok((await run("select count(*)::int n from analytics_outbox where delivery_status='delivered'")).rows[0].n>=1);
    await asActor(db,ids.buyer,async()=>{
      for(const sql of ["select public.get_analytics_delivery_health('preview')",
        "select public.claim_analytics_event('preview')",
        "select public.release_analytics_event('preview','22222222-2222-4222-8222-222222222222')"])
        await assert.rejects(()=>run(sql),/permission denied/);
      await assert.rejects(()=>run('select id from public.analytics_outbox'),/permission denied/);
    },'authenticated');
  } finally {await db.close();}
});

test('coverage requires independent source verification and an elapsed late allowance',()=>{
  const end='2026-10-10T00:00:00Z';
  const input={windowEndExclusive:end,observedThrough:'2026-10-11T00:00:00Z',sourceCoverageVerified:true};
  assert.equal(DEFAULT_LATE_ARRIVAL_MS,86400000);
  assert.deepEqual(assessFunnelCoverage({...input,now:new Date('2026-10-09T23:59:59Z')}).states,
    ['observation_window_open','source_coverage_verified']);
  assert.deepEqual(assessFunnelCoverage({...input,now:new Date('2026-10-10T12:00:00Z')}).states,
    ['observation_window_closed','late_arrival_allowance_active','source_coverage_verified']);
  assert.equal(assessFunnelCoverage({...input,now:new Date('2026-10-11T01:00:00Z'),sourceCoverageVerified:false}).finalized,false);
  assert.equal(assessFunnelCoverage({...input,now:new Date('2026-10-11T01:00:00Z'),observedThrough:end}).finalized,false);
  const final=assessFunnelCoverage({...input,now:new Date('2026-10-11T01:00:00Z')});
  assert.equal(final.finalized,true);assert.ok(final.states.includes('finalized_funnel_result'));
});

test('worker stops at ten attempts, counts acceptance, and stops on an empty claim',async()=>{
  let attempts=0;
  const worker=load('services/analytics/worker.ts',{
    'server-only':{},'./server':{attemptDelivery:async()=>{attempts++;return attempts===2?'failed':'accepted';}}
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await worker.runAnalyticsDeliveryBatch(100))),{attempted:10,accepted:9});
  assert.equal(attempts,10);
  const empty=load('services/analytics/worker.ts',{
    'server-only':{},'./server':{attemptDelivery:async()=>{attempts++;return 'empty';}}
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await empty.runAnalyticsDeliveryBatch())),{attempted:0,accepted:0});
  const unavailable=load('services/analytics/worker.ts',{
    'server-only':{},'./server':{attemptDelivery:async()=> 'unavailable'}
  });
  await assert.rejects(()=>unavailable.runAnalyticsDeliveryBatch(),/analytics_delivery_unavailable/);
});

test('admin endpoint rejects unauthorized users before privileged reads or retry',async()=>{
  for(const role of [null,'buyer','artist']){
    let privileged=0;
    const route=load('app/api/admin/analytics/retry/route.ts',{
      '@/services/analytics/actor':{getAnalyticsActor:async()=>role?{id:ids.buyer,role}:null},
      '@/services/analytics/server':{analyticsConfig:()=>{privileged++;return cfg;},deliverEvent:async()=>{privileged++;return true;}},
      '@/services/analytics/worker':{runAnalyticsDeliveryBatch:async()=>{privileged++;return {attempted:1,accepted:1};}},
      '@/services/supabase/admin':{createAdminSupabaseClient:()=>{privileged++;return {};}}
    });
    assert.equal((await route.GET()).status,403);
    assert.equal((await route.POST(new Request('https://app.invalid/api/admin/analytics/retry',{method:'POST',
      headers:{origin:'https://app.invalid','content-type':'application/json'},body:'{"action":"run_due"}'}))).status,403);
    assert.equal(privileged,0);
  }
});

test('admin health and intervention expose only safe fields and require explicit IDs',async()=>{
  const calls=[];
  const db={rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='get_analytics_delivery_health'?{statuses:{held:1},failures:{client_rejected:1}}:true,error:null};},
    from:table=>{assert.equal(table,'analytics_outbox');return {select(fields){assert.ok(!fields.includes('properties'));assert.ok(!fields.includes('actor_id'));return this;},
      eq(){return this;},in(){return this;},order(){return this;},limit:async()=>({data:[{id:eventId,event:'onboarding_started',delivery_status:'held',failure_category:'client_rejected'}],error:null})};}};
  const route=load('app/api/admin/analytics/retry/route.ts',{
    '@/services/analytics/actor':{getAnalyticsActor:async()=>({id:ids.buyer,role:'admin'})},
    '@/services/analytics/server':{analyticsConfig:()=>cfg,deliverEvent:async()=>{calls.push(['retry']);return true;}},
    '@/services/analytics/worker':{runAnalyticsDeliveryBatch:async()=>({attempted:0,accepted:0})},
    '@/services/supabase/admin':{createAdminSupabaseClient:()=>db}
  });
  const health=await route.GET();assert.equal(health.status,200);
  assert.equal(health.headers.get('cache-control'),'no-store');
  assert.ok(!(await health.text()).includes('properties'));
  const post=body=>route.POST(new Request('https://app.invalid/api/admin/analytics/retry',{method:'POST',
    headers:{origin:'https://app.invalid','content-type':'application/json'},body:JSON.stringify(body)}));
  assert.equal((await post({action:'release'})).status,400);
  assert.equal((await post({action:'hold',id:eventId})).status,200);
  assert.equal((await post({action:'release',id:eventId})).status,200);
  assert.equal((await post({action:'retry',id:eventId})).status,200);
  assert.ok(calls.some(([name])=>name==='hold_analytics_event'));
  assert.ok(calls.some(([name])=>name==='release_analytics_event'));
  assert.equal((await route.POST(new Request('https://app.invalid/api/admin/analytics/retry',{method:'POST',
    headers:{origin:'https://evil.invalid','content-type':'application/json'},body:'{"action":"run_due"}'}))).status,403);
});
