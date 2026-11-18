import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
import {fixture as provider,mediaTestSocket,mediaTestPort} from './helpers/submission-media-postgres.mjs';
import {enable,source,collect,claim,finish,ids,call} from './helpers/notifications-fixture.mjs';
async function fixture(fn){const base=await provider(),config={host:mediaTestSocket,port:mediaTestPort,user:'slice3_fixture_admin',database:base.name},c=new pg.Client(config);await c.connect();const db={query:(s,p)=>c.query(s,p),exec:s=>c.query(s)};try{await db.exec("set request.jwt.claim.role='service_role'");await enable(db);await db.exec("insert into storage.buckets(id,name,public) values('rights-evidence','rights-evidence',false) on conflict do nothing");await fn(db,{...config,user:'postgres'});}finally{await c.end();await base.close();}}
async function pair(config,fn){const clients=[new pg.Client(config),new pg.Client(config)];try{for(const c of clients){await c.connect();await c.query("set request.jwt.claim.role='service_role'");}await fn(...clients);}finally{for(const c of clients)await c.end();}}
test('native email: concurrent collectors discover one immutable notification; private schema not API-readable',()=>fixture(async(db,config)=>{
 await source(db);await pair(config,async(a,b)=>{const results=await Promise.all([call(a,'collect_notification_events',[200]),call(b,'collect_notification_events',[200])]);assert.equal(results.reduce((a,b)=>a+b,0),1);});assert.equal((await db.query('select count(*)::int n from notifications_private.outbox')).rows[0].n,1);
 assert.equal((await db.query("select rolsuper from pg_roles where rolname='postgres'")).rows[0].rolsuper,false);
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_schema_privilege($1,'notifications_private','USAGE') v",[role])).rows[0].v,false);
}));
test('native email: simultaneous workers claim one message; interrupted lease keeps same key and fences stale finisher',()=>fixture(async(db,config)=>{
 await source(db);await collect(db);let first;await pair(config,async(a,b)=>{const r=await Promise.all([claim(a),claim(b)]);assert.equal(r.filter(Boolean).length,1);first=r.find(Boolean);});
 await db.query("update notifications_private.outbox set lease_until=clock_timestamp()-interval '1 second' where id=$1",[first.id]);const second=await claim(db);assert.equal(second.id,first.id);assert.notEqual(second.lease,first.lease);assert.equal(await finish(db,first),false);assert.equal(await finish(db,second),true);
}));
test('native email: concurrent signed event ingestion is once in effect and complaint cannot be overwritten by delivery',()=>fixture(async(db,config)=>{
 await source(db);await collect(db);const c=await claim(db);await finish(db,c,'accepted','native_provider');const args=['msg_native','a'.repeat(64),'native_provider','email.complained',new Date().toISOString()];
 await pair(config,async(a,b)=>{const r=await Promise.all([call(a,'ingest_notification_event',args),call(b,'ingest_notification_event',args)]);assert.deepEqual(r.sort(),['duplicate','recorded']);});
 await call(db,'ingest_notification_event',['msg_late','b'.repeat(64),'native_provider','email.delivered',new Date().toISOString()]);assert.equal((await db.query('select state from notifications_private.outbox where id=$1',[c.id])).rows[0].state,'complained');assert.equal((await db.query('select count(*)::int n from notifications_private.suppressions')).rows[0].n,1);
}));

test('native email: contractual termination cancels queued license availability while preserving original payment and source evidence',()=>fixture(async db=>{
 const {seedDelivery}=await import('./helpers/secure-delivery-fixture.mjs');const {admin,randomUUID}=await import('./helpers/sec-fixture.mjs');const c=await seedDelivery(db);await collect(db);
 await admin(db,()=>call(db,'license_lifecycle_command',[c.order,0,randomUUID(),'terminate','SYNTHETIC termination','SYNTHETIC reviewed authority']));await collect(db);while(await claim(db)){}
 assert.equal((await db.query("select count(*)::int n from notifications_private.outbox where kind in('license_ready','assets_ready') and state='canceled'")).rows[0].n,2);assert.equal((await db.query("select count(*)::int n from notifications_private.outbox where source_key like '%lifecycle:%'")).rows[0].n,2);assert.equal((await db.query('select count(*)::int n from generated_licenses where order_id=$1',[c.order])).rows[0].n,1);
}));
