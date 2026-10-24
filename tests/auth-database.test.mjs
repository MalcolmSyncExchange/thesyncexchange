import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {database,asActor,ids} from './helpers/artist-baseline-db.mjs';
let db;
before(async()=>{db=await database();});
after(async()=>{await db?.close();});
const denied=operation=>assert.rejects(operation,e=>e.code==='42501');
const adminCheck=async()=> (await db.query('select public.is_admin() as allowed')).rows[0].allowed;
test('all migrations replay cleanly and the Auth migration is repeatable without identity/data changes',async()=>{
 const users=(await db.query('select to_jsonb(u) as value from user_profiles u order by id')).rows;
 const file=readdirSync(new URL('../supabase/migrations/',import.meta.url)).find(f=>f.endsWith('_system01_authentication_guards.sql'));
 await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 assert.deepEqual((await db.query('select to_jsonb(u) as value from user_profiles u order by id')).rows,users);
});
test('canonical admin at AAL1 cannot read admin financial, delivery or source RPCs',async()=>{
 await asActor(db,ids.admin,async()=>{
  assert.equal(await adminCheck(),false);
  await denied(db.query('select public.read_financial_summary()'));
  await denied(db.query('select public.read_order_delivery_audit($1)',[ids.order]));
  await denied(db.query('select public.read_order_source_chain($1)',[ids.order]));
 },'authenticated','','aal1');
});
test('canonical admin with MFA and an active owned session can use admin read RPCs',async()=>{
 await asActor(db,ids.admin,async()=>{assert.equal(await adminCheck(),true);await db.query('select public.read_order_delivery_audit($1)',[ids.order]);await db.query('select public.read_order_source_chain($1)',[ids.order]);});
});
test('AAL2 alone cannot elevate a buyer or artist into an admin',async()=>{
 for(const actor of [ids.a,ids.buyer])await asActor(db,actor,async()=>{
  assert.equal(await adminCheck(),false);await assert.rejects(db.query("update user_profiles set role='admin' where id=$1",[actor]),/Role changes are managed by trusted server workflows only/);await denied(db.query('select public.read_order_delivery_audit($1)',[ids.order]));
 });
});
test('unknown, cross-account and revoked session IDs deny privileged access',async()=>{
 const sid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 await asActor(db,ids.admin,async()=>assert.equal(await adminCheck(),false),'authenticated',sid,'aal2');
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,ids.buyer]);
 await asActor(db,ids.admin,async()=>assert.equal(await adminCheck(),false),'authenticated',sid,'aal2');
 await db.query('update auth.sessions set user_id=$2 where id=$1',[sid,ids.admin]);
 await asActor(db,ids.admin,async()=>assert.equal(await adminCheck(),true),'authenticated',sid,'aal2');
 await db.query('delete from auth.sessions where id=$1',[sid]);
 await asActor(db,ids.admin,async()=>{assert.equal(await adminCheck(),false);await denied(db.query('select public.read_financial_summary()'));},'authenticated',sid,'aal2');
});
test('expired session not_after denies admin access before JWT expiry',async()=>{
 const sid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';await db.exec('alter table auth.sessions add column if not exists not_after timestamptz');
 await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,clock_timestamp()-interval '1 minute')",[sid,ids.admin]);
 await asActor(db,ids.admin,async()=>assert.equal(await adminCheck(),false),'authenticated',sid,'aal2');
});
test('anonymous callers cannot enumerate sessions or invoke private admin helpers',async()=>{
 await asActor(db,null,async()=>{assert.equal(await adminCheck(),false);await denied(db.query('select public.auth_session_is_active()'));},'anon');
 await asActor(db,ids.buyer,async()=>{await denied(db.query('select * from auth.sessions'));await denied(db.query('select finance_private.require_admin()'));});
});
