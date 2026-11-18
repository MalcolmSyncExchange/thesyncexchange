import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,ids,asActor,call,admin,customer,command,randomUUID,source,collect,claim,finish,rpc} from './helpers/notifications-fixture.mjs';
import {seedDelivery} from './helpers/secure-delivery-fixture.mjs';
import {processNotifications} from '../lib/notifications/worker.ts';
const row=async(db,id)=>(await db.query('select * from notifications_private.outbox where id=$1',[id])).rows[0];
const age=async(db,id)=>db.query("update notifications_private.outbox set lease_until=clock_timestamp()-interval '1 second' where id=$1",[id]);
test('System13 default-off collector and provider gates preserve critical transactions',()=>fixture(async db=>{
 await source(db);await db.exec('update notifications_private.configuration set enabled=false');assert.equal(await collect(db),0);assert.equal(await claim(db),null);assert.equal((await db.query('select count(*)::int n from notifications_private.outbox')).rows[0].n,0);
}));
test('canonical collection dedupes across retries, freezes identity and hides private tables from every API role',()=>fixture(async db=>{
 await source(db);assert.equal(await collect(db),1);assert.equal(await collect(db),0);const c=await claim(db);assert.equal(c.role,'artist');assert.equal(c.kind,'onboarding_complete');
 await assert.rejects(db.query("update notifications_private.outbox set kind='purchase_confirmed' where id=$1",[c.id]),/Immutable/);
 await assert.rejects(db.query('update notifications_private.outbox set recipient_id=$1 where id=$2',[ids.buyer,c.id]),/Immutable/);
 for(const role of ['anon','authenticated','service_role'])await asActor(db,ids.buyer,async()=>{await assert.rejects(db.query('select * from notifications_private.outbox'),/permission/);if(role!=='service_role')for(const fn of ['collect_notification_events','claim_notification','notification_retention'])await assert.rejects(call(db,fn),/permission/);},role);
}));
test('failed/unpaid/synthetic waiver orders cannot create purchase, agreement or asset confirmation; exact verified chain can',()=>fixture(async db=>{
 const c=await seedDelivery(db,{paid:false});await collect(db);assert.equal((await db.query("select count(*)::int n from notifications_private.outbox where kind in('purchase_confirmed','license_ready','assets_ready')")).rows[0].n,0);
 await db.query("update orders set stripe_checkout_session_id='cs_test_fixture',stripe_payment_intent_id='pi_fixture' where id=$1",[c.order]);const {payment}=await import('./helpers/accounting-fixture.mjs');await payment(db,c,'PAYMENT_FAILED');await collect(db);assert.equal((await db.query("select count(*)::int n from notifications_private.outbox where kind='payment_failed'")).rows[0].n,1);
}));
test('verified payment/license/delivery notifications bind canonical Buyer, frozen acceptance and exact original order',()=>fixture(async db=>{
 const c=await seedDelivery(db);assert.equal((await db.query('select count(*)::int n from notifications_private.paid_orders')).rows[0].n,1);await collect(db);
 const a=(await db.query("select * from notifications_private.outbox where kind in('purchase_confirmed','license_ready','assets_ready')")).rows;assert.equal(a.length,3);for(const x of a){assert.equal(x.recipient_id,ids.buyer);assert.equal(x.recipient_role,'buyer');assert.equal(x.order_id,c.order);assert.ok(x.source_key.includes(':'));}
 await db.query("select record_purchase_completion_event($1,'acct_fixture','evt_emailrefund','cs_test_fixture','pi_fixture','charge.refunded','REFUNDED',5000,5000,'USD',$2,'2026-10-23T00:00:00Z')",[c.order,'b'.repeat(64)]);await collect(db);
 const p=a.find(x=>x.kind==='purchase_confirmed');assert.equal(await call(db,'notification_send_allowed',[p.id,randomUUID()]),false);
 while(await claim(db)){}for(const x of a)assert.equal((await row(db,x.id)).state,'canceled');assert.equal((await db.query("select count(*)::int n from notifications_private.outbox where kind='refund'")).rows[0].n,1);
}));
test('expired lease recovers same message/provider key; stale acknowledgement cannot overwrite new lease',()=>fixture(async db=>{
 await source(db);await collect(db);const c=await claim(db);assert.equal(await claim(db),null);await age(db,c.id);const d=await claim(db);assert.equal(c.id,d.id);assert.notEqual(c.lease,d.lease);assert.equal(await finish(db,c),false);assert.equal(await finish(db,d),true);assert.equal((await row(db,c.id)).state,'accepted');assert.equal(await claim(db),null);
}));
test('transient provider failure backs off, permanent failure is held, exhausted and old uncertain attempts stop',()=>fixture(async db=>{
 await source(db);await collect(db);let c=await claim(db);assert.equal(await finish(db,c,'transient',null),true);let o=await row(db,c.id);assert.equal(o.state,'retry');assert.ok(Date.parse(o.next_at)>Date.now());assert.equal(await claim(db),null);
 await db.query('update notifications_private.outbox set next_at=clock_timestamp() where id=$1',[c.id]);c=await claim(db);await finish(db,c,'permanent',null);assert.equal((await row(db,c.id)).state,'failed');
 assert.equal(await admin(db,()=>call(db,'notification_retry',[c.id,'SYNTHETIC corrected provider configuration'])),true);c=await claim(db);
 await db.query("update notifications_private.outbox set first_attempt_at=clock_timestamp()-interval '21 hours',lease_until=clock_timestamp()-interval '1 second' where id=$1",[c.id]);assert.equal(await claim(db),null);assert.equal((await row(db,c.id)).state,'dead');await assert.rejects(admin(db,()=>call(db,'notification_retry',[c.id,'SYNTHETIC unauthorized late replay'])),/Unsafe replay/);
}));
test('recipient email/role changes, restrictions, unverified addresses, preference withdrawal and suppression fail closed',()=>fixture(async db=>{
 await source(db);await collect(db);const c=await claim(db);assert.equal(await call(db,'notification_send_allowed',[c.id,c.lease]),true);
 await db.query('update auth.users set email=$1 where id=$2',['new-address@fixture.invalid',ids.a]);assert.equal(await call(db,'notification_send_allowed',[c.id,c.lease]),false);
 await db.query('update auth.users set email=$1 where id=$2',[c.to,ids.a]);await customer(db,ids.a,()=>call(db,'notification_preferences',[false,true,'notifications-v1']));assert.equal(await call(db,'notification_send_allowed',[c.id,c.lease]),false);
 const prefs=await customer(db,ids.a,()=>call(db,'notification_preferences'));assert.equal(prefs.essential,true);assert.equal(prefs.operational,false);assert.equal(prefs.marketing,true);
 await customer(db,ids.a,()=>call(db,'notification_preferences',[true,false,'notifications-v1']));await db.query('insert into notifications_private.suppressions(address,reason) values($1,$2)',[c.to,'complaint']);assert.equal(await call(db,'notification_send_allowed',[c.id,c.lease]),false);
}));
test('unverified emails do not receive projected notices, customer preferences cannot target others or disable essentials',()=>fixture(async db=>{
 await source(db);await db.query('update auth.users set email_confirmed_at=null where id=$1',[ids.a]);assert.equal(await collect(db),0);
 await assert.rejects(asActor(db,ids.a,()=>call(db,'notification_preferences',[false,true,'notifications-v1']),'authenticated',''),/Active/);
 await assert.rejects(customer(db,ids.a,()=>call(db,'notification_preferences',[false,true,'obsolete'])),/Current/);
 const own=await customer(db,ids.buyer,()=>call(db,'notification_preferences'));assert.equal(own.essential,true);assert.equal(own.marketing,false);
}));
test('provider events survive before response, dedupe, preserve conflicts and prioritize complaint over late delivered',()=>fixture(async db=>{
 await source(db);await collect(db);const c=await claim(db);const event=(id,kind,hash='a'.repeat(64))=>call(db,'ingest_notification_event',[id,hash,'provider_early',kind,new Date().toISOString()]);
 assert.equal(await event('msg_early','email.delivered'),'recorded');await finish(db,c,'accepted','provider_early');assert.equal((await row(db,c.id)).state,'delivered');assert.equal(await event('msg_early','email.delivered'),'duplicate');assert.equal(await event('msg_early','email.failed','b'.repeat(64)),'conflict');
 await event('msg_complaint','email.complained');await event('msg_late','email.delivered');assert.equal((await row(db,c.id)).state,'complained');assert.equal((await db.query('select count(*)::int n from notifications_private.suppressions')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from notifications_private.provider_conflicts')).rows[0].n,1);
 await assert.rejects(db.exec("delete from notifications_private.provider_events"),/immutable/i);
}));
test('SEC notifications require canonical MFA full Admin and expose no recipients or private source data',()=>fixture(async db=>{
 await source(db);await collect(db);const c=await claim(db);await finish(db,c,'permanent',null);
 for(const id of [ids.a,ids.buyer])await customer(db,id,async()=>{await assert.rejects(call(db,'notification_operations'),/Admin/);await assert.rejects(call(db,'notification_retry',[c.id,'SYNTHETIC unauthorized']),/Admin/);});
 await assert.rejects(admin(db,()=>call(db,'notification_operations'),{aal:'aal1'}),/Admin/);
 const d=await admin(db,()=>call(db,'notification_operations'));assert.equal(d.states.failed,1);for(const key of ['recipient_id','recipient_address','to','@','raw_body'])assert.equal(JSON.stringify(d).includes('"'+key+'"'),false);
}));
test('canonical support replies route only to the owner; private notes never become email source content',()=>fixture(async db=>{
 const id=randomUUID();await customer(db,ids.buyer,()=>call(db,'sec_customer_command',['support',id,0,randomUUID(),'create',{title:'Synthetic request',category:'buyer',message:'SYNTHETIC private conversation'}]));
 await command(db,'support',id,1,'note',{message:'SYNTHETIC ADMIN PRIVATE NOTE'});await collect(db);assert.equal((await db.query("select count(*)::int n from notifications_private.outbox where kind='support_response'")).rows[0].n,0);
 await command(db,'support',id,2,'reply',{message:'SYNTHETIC confidential response'});await collect(db);const rows=(await db.query("select * from notifications_private.outbox where kind='support_response'")).rows;assert.equal(rows.length,1);assert.equal(rows[0].recipient_id,ids.buyer);assert.equal(JSON.stringify(rows).includes('confidential'),false);
}));
test('real worker recovery after accepted HTTP but lost DB acknowledgement reuses one stable provider idempotency key',()=>fixture(async db=>{
 await source(db);let fail=true,sends=[];const dbRpc=rpc(db),provider=new Map();
 const send=async(id,to)=>{sends.push({id,to});if(!provider.has(id))provider.set(id,'provider_recovered');return {outcome:'accepted',provider:provider.get(id)};};
 const interrupted=async(name,args)=>{if(name==='finish_notification'&&fail){fail=false;throw Error('SYNTHETIC database outage');}return dbRpc(name,args);};
 await assert.rejects(processNotifications(interrupted,send,'https://fixture.invalid'),/outage/);const c=(await db.query('select * from notifications_private.outbox')).rows[0];await age(db,c.id);const result=await processNotifications(dbRpc,send,'https://fixture.invalid');assert.equal(result.accepted,1);assert.equal(sends.length,2);assert.equal(new Set(sends.map(x=>x.id)).size,1);assert.equal(provider.size,1);
}));

test('rights and catalog lifecycle notifications come from reviewed evidence; Admin queues coalesce and sensitive notes remain private',()=>fixture(async db=>{
 await db.exec("insert into storage.buckets(id,name,public) values('rights-evidence','rights-evidence',false) on conflict do nothing");
 const catalog=await import('./helpers/catalog-management-fixture.mjs'),rights=await import('./helpers/rights-verification-fixture.mjs');await catalog.published(db);await collect(db);
 let rows=(await db.query('select * from notifications_private.outbox')).rows;for(const kind of ['rights_approved','catalog_approved','catalog_published','rights_queue','catalog_queue'])assert.ok(rows.some(x=>x.kind===kind),kind);
 await catalog.admin(db,'catalog_transition',[ids.live,await catalog.revision(db),randomUUID(),'suspended','SYNTHETIC sensitive catalog suspension reason']);
 const c=(await db.query('select * from rights_private.cases where track_id=$1',[ids.live])).rows[0];await rights.admin(db,'rights_review',[ids.live,await rights.rev(db),randomUUID(),c.submitted_version,'disputed','SYNTHETIC sensitive dispute details',rights.checklist]);await collect(db);
 rows=(await db.query('select * from notifications_private.outbox')).rows;assert.ok(rows.some(x=>x.kind==='rights_disputed'&&x.recipient_id===ids.a&&x.category==='transactional'));assert.ok(rows.some(x=>x.kind==='catalog_suspended'));assert.equal(JSON.stringify(rows).includes('sensitive'),false);assert.equal(rows.filter(x=>x.kind==='rights_queue').length,1);
}));
test('retry template or sender changes are fenced before network, terminal address retention preserves dedupe identity',()=>fixture(async db=>{
 await source(db);let sent=0;const provider=async()=>{sent++;return {outcome:'transient'};};await processNotifications(rpc(db),provider,'https://fixture.invalid',1,'sender-v1');
 await db.exec('update notifications_private.outbox set next_at=clock_timestamp()');await processNotifications(rpc(db),provider,'https://fixture.invalid',1,'sender-v2');assert.equal(sent,1);
 const o=(await db.query('select * from notifications_private.outbox')).rows[0];assert.equal(o.state,'dead');assert.equal(o.code,'immutable_request_changed');
 await db.query("update notifications_private.outbox set terminal_at=clock_timestamp()-interval '91 days' where id=$1",[o.id]);assert.equal(await call(db,'notification_retention'),1);assert.equal((await row(db,o.id)).recipient_address,null);await collect(db);assert.equal((await db.query('select count(*)::int n from notifications_private.outbox where source_key=$1',[o.source_key])).rows[0].n,1);
}));
test('unverified and changed canonical roles invalidate already leased notifications',()=>fixture(async db=>{
 await source(db);await collect(db);const c=await claim(db);await db.query('update auth.users set email_confirmed_at=null where id=$1',[ids.a]);assert.equal(await call(db,'notification_send_allowed',[c.id,c.lease]),false);
 await db.query("update auth.users set email_confirmed_at='2020-01-01' where id=$1",[ids.a]);await db.query("update public.user_profiles set role='buyer' where id=$1",[ids.a]);assert.equal(await call(db,'notification_send_allowed',[c.id,c.lease]),false);
}));
test('rollback of collection preserves source for next run; failed mail transport never rolls back licenses or accounting',()=>fixture(async db=>{
 const c=await seedDelivery(db);await db.exec('begin');await collect(db);await db.exec('rollback');assert.equal((await db.query('select count(*)::int n from notifications_private.outbox')).rows[0].n,0);
 const result=await processNotifications(rpc(db),async()=>({outcome:'permanent'}),'https://fixture.invalid',10);assert.ok(result.attempted>0);assert.equal((await db.query('select count(*)::int n from generated_licenses where order_id=$1',[c.order])).rows[0].n,1);assert.equal((await db.query("select count(*)::int n from order_asset_entitlements where order_id=$1 and state='active'",[c.order])).rows[0].n,2);
}));

test('seller and payout recipients bind immutable transaction identity, never replacement catalog owners or corrected payees',()=>fixture(async db=>{
 const f=await import('./helpers/accounting-fixture.mjs'),c=await f.setup(db);const binding=await f.bind(db,c);await f.freeze(db,c);const payout=await f.prepare(db,c);await f.act(db,payout,1,'schedule');
 await assert.rejects(db.query('update tracks set artist_user_id=$1 where id=$2',[ids.b,ids.live]),/Managed media/);await f.bind(db,c,'master',ids.b,binding);await collect(db);
 for(const kind of ['license_activity','earnings_updated','payout_status']){const rows=(await db.query('select * from notifications_private.outbox where kind=$1',[kind])).rows;assert.ok(rows.length>0,kind);assert.ok(rows.every(x=>x.recipient_id===ids.a),kind);}
}));

test('refund and dispute journal adjustments create Artist earnings updates from original accounting evidence',()=>fixture(async db=>{
 const f=await import('./helpers/accounting-fixture.mjs'),c=await f.setup(db);await collect(db);let before=(await db.query("select count(*)::int n from notifications_private.outbox where kind='earnings_updated'")).rows[0].n;assert.ok(before>0);
 await f.payment(db,c,'PARTIALLY_REFUNDED',1000);await call(db,'post_financial_order',[c.order]);await collect(db);let after=(await db.query("select count(*)::int n from notifications_private.outbox where kind='earnings_updated'")).rows[0].n;assert.ok(after>before);assert.ok(await f.balanced(db));
}));

test('contractual revocation independent of payment cancels availability notices and notifies only original Buyer/seller',()=>fixture(async db=>{
 const c=await seedDelivery(db);await collect(db);await admin(db,()=>call(db,'license_lifecycle_command',[c.order,0,randomUUID(),'revoke','SYNTHETIC contractual revocation','SYNTHETIC signed authority']));await collect(db);
 const rows=(await db.query("select * from notifications_private.outbox where source_key like '%lifecycle:%'")).rows;assert.equal(rows.length,2);assert.deepEqual(new Set(rows.map(x=>x.recipient_id)),new Set([ids.a,ids.buyer]));assert.equal(rows.find(x=>x.recipient_id===ids.buyer).order_id,c.order);
 while(await claim(db)){}for(const row of(await db.query("select * from notifications_private.outbox where kind in('license_ready','assets_ready')")).rows)assert.equal(row.state,'canceled');
}));

test('late authenticated delivery failures remain recordable after terminal recipient-address pruning',()=>fixture(async db=>{
 await source(db);await collect(db);const c=await claim(db);await finish(db,c,'accepted','provider_retained');await db.query("update notifications_private.outbox set terminal_at=clock_timestamp()-interval '91 days' where id=$1",[c.id]);await call(db,'notification_retention');
 assert.equal(await call(db,'ingest_notification_event',['msg_late_retention','c'.repeat(64),'provider_retained','email.bounced',new Date().toISOString()]),'recorded');assert.equal((await row(db,c.id)).state,'bounced');assert.equal((await row(db,c.id)).recipient_address,null);
}));
