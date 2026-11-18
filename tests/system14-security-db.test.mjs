import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database, asActor, ids } from './helpers/artist-baseline-db.mjs';
let db;
before(async () => { db = await database(); });
after(async () => { await db?.close(); });
const denied = promise => assert.rejects(promise, error => error.code === '42501');

test('System14 unassigned and missing canonical profiles cannot obtain SEC authority at AAL2', async () => {
  for (const profile of [true, false]) {
    const user = randomUUID(), session = randomUUID();
    await db.query('insert into auth.users(id,email) values($1,$2)', [user, 'synthetic@fixture.invalid']);
    if (profile) await db.query("insert into public.user_profiles(id,email,full_name,role) values($1,$2,'Synthetic unassigned',null)", [user, 'synthetic@fixture.invalid']);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [session, user]);
    await asActor(db, user, async () => {
      assert.equal((await db.query('select public.is_admin() value')).rows[0].value, false);
      assert.equal((await db.query("select public.sec_has_capability('full_admin') value")).rows[0].value, false);
      for (const sql of ['select public.sec_context()', 'select public.read_financial_summary()', "select public.sec_read('users',1,'','','newest')", "select public.sec_read('support',1,'','','newest')", 'select public.analytics_preferences()', 'select public.notification_preferences()']) await denied(db.query(sql));
      await denied(db.query("select public.sec_customer_command('support',$1,0,$2,'create',$3)", [randomUUID(),randomUUID(),{title:'Synthetic support',category:'account',message:'Synthetic unauthorized intake'}]));
    }, 'authenticated', session, 'aal2');
  }
});

test('System14 direct media RPCs deny missing, deleted, foreign, expired and SEC-revoked Artist sessions', async () => {
  await db.exec('update submission_media.capabilities set reservations_enabled=true,foundation_reads_enabled=true');
  await db.exec('alter table auth.sessions add column if not exists not_after timestamptz');
  const valid = randomUUID(), foreign = randomUUID(), expired = randomUUID(), revoked = randomUUID();
  await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4),($5,$2)', [valid,ids.a,foreign,ids.b,revoked]);
  await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,clock_timestamp()-interval '1 minute')", [expired,ids.a]);
  await db.query("insert into sec_private.revoked_sessions(session_id,user_id,reason) values($1,$2,'SYNTHETIC revocation')", [revoked,ids.a]);
  await asActor(db, ids.a, async () => { await db.query('select public.media_create_submission($1,null)', [randomUUID()]); }, 'authenticated', valid);
  for (const session of ['', randomUUID(), foreign, expired, revoked]) await asActor(db, ids.a, () => denied(db.query('select public.media_create_submission($1,null)',[randomUUID()])), 'authenticated', session);
  await db.query('delete from auth.sessions where id=$1', [valid]);
  await asActor(db, ids.a, () => denied(db.query('select public.media_upload_list()')), 'authenticated', valid);
});

test('System14 recovery proof is service-issued, account/session-bound, expiring and single-use', async () => {
  const proof='a'.repeat(64), other='b'.repeat(64), sid=randomUUID(), foreign=randomUUID();
  const {createHash}=await import('node:crypto');const hash=s=>createHash('sha256').update(s).digest('hex');
  await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[sid,ids.buyer,foreign,ids.b]);
  await asActor(db,ids.buyer,()=>denied(db.query('select public.auth_issue_recovery_grant($1,$2,$3)',[ids.buyer,sid,hash(proof)])),'authenticated',sid);
  await db.query('select public.auth_issue_recovery_grant($1,$2,$3)',[ids.buyer,sid,hash(proof)]);
  await asActor(db,ids.b,async()=>assert.equal((await db.query('select public.auth_recovery_ready($1) value',[proof])).rows[0].value,false),'authenticated',foreign);
  await asActor(db,ids.buyer,async()=>{
    assert.equal((await db.query('select public.auth_recovery_ready($1) value',[other])).rows[0].value,false);
    assert.equal((await db.query('select public.auth_recovery_ready($1) value',[proof])).rows[0].value,true);
    assert.equal((await db.query('select public.auth_consume_recovery_grant($1) value',[proof])).rows[0].value,true);
    assert.equal((await db.query('select public.auth_consume_recovery_grant($1) value',[proof])).rows[0].value,false);
    await denied(db.query('select * from auth_security_private.recovery_grants'));
  },'authenticated',sid);
  await db.query('select public.auth_issue_recovery_grant($1,$2,$3)',[ids.buyer,sid,hash(other)]);
  await db.query("update auth_security_private.recovery_grants set issued_at=statement_timestamp()-interval '1 day',expires_at=statement_timestamp()-interval '1 day'+interval '15 minutes' where proof_hash=$1",[hash(other)]);
  await asActor(db,ids.buyer,()=>db.query('select public.auth_recovery_ready($1) value',[other]).then(r=>assert.equal(r.rows[0].value,false)),'authenticated',sid);
});

test('System14 recovery reissue rotates prior proof and revoked sessions cannot consume', async () => {
  const {createHash}=await import('node:crypto');const hash=s=>createHash('sha256').update(s).digest('hex');
  const sid=randomUUID(),old='c'.repeat(64),current='d'.repeat(64);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,ids.buyer]);
  for(const proof of [old,current])await db.query('select public.auth_issue_recovery_grant($1,$2,$3)',[ids.buyer,sid,hash(proof)]);
  await asActor(db,ids.buyer,async()=>{assert.equal((await db.query('select public.auth_recovery_ready($1) value',[old])).rows[0].value,false);assert.equal((await db.query('select public.auth_recovery_ready($1) value',[current])).rows[0].value,true);},'authenticated',sid);
  await db.query('delete from auth.sessions where id=$1',[sid]);
  await asActor(db,ids.buyer,()=>db.query('select public.auth_consume_recovery_grant($1) value',[current]).then(r=>assert.equal(r.rows[0].value,false)),'authenticated',sid);
});

test('System14 direct table RLS and private finance reject stale JWT sessions without granting anonymous private catalog access',async()=>{
 const sid=randomUUID();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,ids.a]);
 const object=randomUUID();await db.query("insert into storage.objects(id,bucket_id,name,owner_id) values($1,'avatars',$2,$3)",[object,ids.a+'/profile/1760000000000-'+randomUUID()+'.png',ids.a]);
 await asActor(db,ids.a,async()=>{assert.equal((await db.query('select id from user_profiles where id=$1',[ids.a])).rows.length,1);await db.query('select public.get_own_artist_finance()');assert.equal((await db.query('select id from storage.objects where id=$1',[object])).rows.length,1);},'authenticated',sid);
 await db.query('delete from auth.sessions where id=$1',[sid]);
 await asActor(db,ids.a,async()=>{assert.equal((await db.query('select id from user_profiles where id=$1',[ids.a])).rows.length,0);assert.equal((await db.query('select id from storage.objects where id=$1',[object])).rows.length,0);await denied(db.query('select public.get_own_artist_finance()'));assert.equal((await db.query("update user_profiles set full_name='UNAUTHORIZED' where id=$1 returning id",[ids.a])).rows.length,0);},'authenticated',sid);
 await asActor(db,null,async()=>assert.equal((await db.query("select id from tracks where status='approved'")).rows.length,0),'anon');
});
