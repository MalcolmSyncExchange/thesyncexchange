// Execute the actual migration against the complete current schema in memory.
// This has no hosted connection, credentials, persisted DB, or PostHog transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import { database, asActor, ids, source } from './helpers/artist-baseline-db.mjs';

test('real analytics SQL: current schema compatibility, privileges, deduplication, quotas, leases and purchase guard',async t=>{
 const db=await database();
 const enqueue=(key,event='onboarding_started',environment='preview',props={},actor=ids.buyer)=>db.query(
  'select public.enqueue_analytics_event($1,$2,$3,$4,$5,$6,$7,$8) as id',
  [environment,event,actor,'buyer',JSON.stringify(props),key,false,true]);
 const claim=(id,environment='preview')=>db.query('select * from public.claim_analytics_event($1,$2)',[environment,id]);
 try {
  await t.test('migration is idempotent and RLS with service-role-only grants survives reapplication',async()=>{
   await db.exec(source('supabase/migrations/20260915072720_analytics_purchase_outbox.sql'));
   assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.analytics_outbox'::regclass")).rows[0].relrowsecurity,true);
   for(const role of ['anon','authenticated']) {
    await asActor(db,ids.buyer,async()=>{
     await assert.rejects(()=>db.query('select * from public.analytics_outbox'),/permission denied/);
     await assert.rejects(()=>enqueue('forbidden'),/permission denied/);
     await assert.rejects(()=>claim(null),/permission denied/);
     await assert.rejects(()=>db.query('update public.analytics_outbox set delivered_at=now()'),/permission denied/);
    },role);
   }
  });
  await t.test('environment-scoped dedupe preserves UUID, identity and event time after repeated calls',async()=>{
   await asActor(db,ids.buyer,async()=>{
    const first=(await enqueue('one')).rows[0].id;
    const again=(await enqueue('one')).rows[0].id;
    const prod=(await enqueue('one','onboarding_started','production')).rows[0].id;
    assert.equal(first,again);assert.notEqual(prod,first);
    const before=(await db.query('select * from analytics_outbox where id=$1',[first])).rows[0];
    await enqueue('one');
    assert.deepEqual((await db.query('select * from analytics_outbox where id=$1',[first])).rows[0],before);
   },'service_role');
  });
  await t.test('leases prevent a second claim, recover after expiry, reject stale acknowledgement and stop after delivery',async()=>{
   await asActor(db,ids.buyer,async()=>{
    const id=(await enqueue('lease')).rows[0].id;
    assert.equal((await claim(id,'production')).rows.length,0);
    const first=(await claim(id)).rows[0];
    assert.equal((await claim(id)).rows.length,0);
    await db.query("update analytics_outbox set lease_until=now()-interval '1 second' where id=$1",[id]);
    const second=(await claim(id)).rows[0];assert.notEqual(first.lease_id,second.lease_id);
    const ack=lease=>db.query('update analytics_outbox set delivered_at=now(),lease_until=null where id=$1 and lease_id=$2 returning id',[id,lease]);
    assert.equal((await ack(first.lease_id)).rows.length,0);
    assert.equal((await ack(second.lease_id)).rows.length,1);
    assert.equal((await claim(id)).rows.length,0);
   },'service_role');
  });
  await t.test('paid-order guard rejects pending/wrong owner/wrong track and deduplicates a persisted purchase',async()=>{
   await db.query('insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents,currency) values($1,$2,$3,$4,5000,\'USD\')',[ids.order,ids.buyer,ids.live,ids.license]);
   const props={order_id:ids.order,track_id:ids.live,license_type:'broadcast',payment_mode:'test'};
   await asActor(db,ids.buyer,()=>assert.rejects(()=>enqueue('purchase','purchase_verified','preview',props),/analytics_purchase_not_persisted/),'service_role');
   await db.query("update orders set status='paid',paid_at=now() where id=$1",[ids.order]);
   await asActor(db,ids.buyer,async()=>{
    await assert.rejects(()=>enqueue('wrong','purchase_verified','preview',{...props,track_id:ids.draft}),/analytics_purchase_not_persisted/);
    await assert.rejects(()=>enqueue('owner','purchase_verified','preview',props,ids.a),/analytics_purchase_not_persisted/);
    const first=(await enqueue('purchase','purchase_verified','preview',props)).rows[0].id;
    assert.equal((await enqueue('purchase','purchase_verified','preview',props)).rows[0].id,first);
   },'service_role');
  });
  await t.test('browser quota cannot prevent a valid paid purchase, and day quota is enforced',async()=>{
   await asActor(db,ids.buyer,async()=>{
    const props={order_id:ids.order,track_id:ids.live};
    await db.exec("delete from analytics_outbox");
    for(let i=0;i<120;i++)assert.ok((await enqueue('quota'+i)).rows[0].id);
    assert.equal((await enqueue('quota-exceeded')).rows[0].id,null);
    assert.ok((await enqueue('purchase-after-quota','purchase_verified','preview',props)).rows[0].id);
    await db.exec("delete from analytics_outbox");
    await db.query("insert into analytics_outbox(dedupe_key,environment,event,actor_id,actor_role,properties,is_internal,is_test,occurred_at) select 'day'||i,'preview','onboarding_started',$1,'buyer','{}',false,true,now()-interval '2 hours' from generate_series(1,3000) i",[ids.buyer]);
    assert.equal((await enqueue('day-exceeded')).rows[0].id,null);
   },'service_role');
  });
 } finally {await db.close();}
});
