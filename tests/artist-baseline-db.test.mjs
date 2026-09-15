import test from 'node:test';
import assert from 'node:assert/strict';
import { database, asActor, ids, source, snapshot } from './helpers/artist-baseline-db.mjs';
async function rejects(db,sql,pattern=/permission|policy|authenticated|only|reviewed|approved|role|referenced|ownership|admins/i) {
 await db.exec('savepoint denied');
 try {await assert.rejects(db.exec(sql),pattern);} finally {await db.exec('rollback to denied; release denied');}
}
async function scalar(db,sql) {return Object.values((await db.query(sql)).rows[0])[0];}
for(const target of ['repository','production','staging']) test(`${target}: isolated PostgreSQL authorization baseline`,async t=>{
 const db=await database(target);
 const scenario=async(name,fn)=>t.test(name,async()=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}});
 try {
  await scenario('independent artist reads own profile, edits bio and draft metadata',()=>asActor(db,ids.a,async()=>{
   assert.equal(await scalar(db,"select count(*)::int from artist_profiles"),1);
   await db.exec("update artist_profiles set bio='Edited own bio'");
   assert.equal(await scalar(db,"select bio from artist_profiles"),'Edited own bio');
   assert.equal((await db.query(`update tracks set title='Own edit' where id='${ids.draft}' returning id`)).rows.length,1);
  }));
  await scenario('Artist A cannot read private B profile/draft/rights or change B IDs',()=>asActor(db,ids.a,async()=>{
   for(const sql of [`select * from artist_profiles where user_id='${ids.b}'`,`select * from tracks where id='${ids.otherTrack}'`,`select * from rights_holders where track_id='${ids.otherTrack}'`,`update tracks set title='Attack' where id='${ids.otherTrack}' returning id`,`delete from rights_holders where track_id='${ids.otherTrack}' returning id`]) assert.equal((await db.query(sql)).rows.length,0);
   await rejects(db,`update tracks set artist_user_id='${ids.b}' where id='${ids.draft}'`);
   await rejects(db,`insert into rights_holders(track_id,name,email,role_type,ownership_percent) values('${ids.otherTrack}','Attack','x@fixture.invalid','owner',100)`);
  }));
  await scenario('buyer cannot read private profile contacts or rights-holder email; only approved catalog rows',()=>asActor(db,ids.buyer,async()=>{
   assert.equal(await scalar(db,'select count(*)::int from artist_profiles'),0);
   assert.equal(await scalar(db,'select count(*)::int from rights_holders'),0);
   assert.deepEqual((await db.query('select id from tracks')).rows.map(r=>r.id),[ids.live]);
   await rejects(db,'select email from track_rights_holders_public',/column.*email.*does not exist/i);
  }));
  await scenario('anonymous data API role has no artist or draft visibility',()=>asActor(db,null,async()=>{
   assert.equal(await scalar(db,'select count(*)::int from artist_profiles'),0);
   assert.equal(await scalar(db,'select count(*)::int from tracks'),0);
  },'anon'));
  await scenario('artist cannot self-promote role or approve/feature a track',()=>asActor(db,ids.a,async()=>{
   await rejects(db,"update user_profiles set role='admin'");
   await rejects(db,`update tracks set status='approved' where id='${ids.draft}'`);
   await rejects(db,`update tracks set featured=true where id='${ids.draft}'`);
   await rejects(db,`update tracks set title='Changed approved title' where id='${ids.live}'`);
  }));
  await scenario('KNOWN GAP: profile owner can self-set legacy verification and read payout contact',()=>asActor(db,ids.a,async()=>{
   await db.exec("update artist_profiles set verification_status='verified'");
   assert.equal(await scalar(db,'select verification_status from artist_profiles'),'verified');
   assert.equal(await scalar(db,'select payout_email from artist_profiles'),'private-a@fixture.invalid');
  }));
  await scenario('KNOWN GAP: catalog-only and finance permissions do not exist as separate domains',async()=>{
   assert.equal(await scalar(db,"select count(*)::int from pg_tables where schemaname='public' and tablename in ('artist_access_grants','payee_accounts','organization_memberships')"),0);
   await asActor(db,ids.a,async()=>{assert.equal(await scalar(db,'select count(payout_email)::int from artist_profiles'),1);});
  });
  await scenario('KNOWN GAP: approved base-track rows expose full-audio object path to buyer',()=>asActor(db,ids.buyer,async()=>{
   assert.equal(await scalar(db,`select audio_file_path from tracks where id='${ids.live}'`),`${ids.a}/uploads/audio/live.wav`);
  }));
  await scenario(target==='staging'?'staging reviewed-rights guard denies owner modifications':'KNOWN GAP: owner can alter reviewed rights without parent review',()=>asActor(db,ids.a,async()=>{
   const sql=`update rights_holders set ownership_percent=50,approval_status='approved' where track_id='${ids.live}'`;
   if(target==='staging') await rejects(db,sql,/Reviewed rights/);
   else {await db.exec(sql);assert.equal(Number(await scalar(db,`select ownership_percent from rights_holders where track_id='${ids.live}'`)),50);}
  }));
  await scenario('draft rights remain editable but their approval is not independent verification',()=>asActor(db,ids.a,async()=>{
   await db.exec(`update rights_holders set name='Draft edit',approval_status='approved' where track_id='${ids.draft}'`);
   assert.equal(await scalar(db,`select approval_status from rights_holders where track_id='${ids.draft}'`),'approved');
  }));
  await scenario('media read ownership and reviewed media difference are captured',()=>asActor(db,ids.b,async()=>{
   assert.equal(await scalar(db,"select count(*)::int from storage.objects where bucket_id='track-audio'"),0);
  }));
  await scenario(target==='repository'?'KNOWN GAP in repository storage policies: uploader can delete referenced full audio':'captured live storage policies deny direct deletion of referenced full audio',()=>asActor(db,ids.a,async()=>{
   const rows=(await db.query("delete from storage.objects where bucket_id='track-audio' returning id")).rows;
   assert.equal(rows.length,target==='repository'?1:0);
  }));
  await scenario('buyer order and generated-license access is isolated; authenticated payment writes denied',async()=>{
   await db.exec(`insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents,currency,status) values('${ids.order}','${ids.buyer}','${ids.live}','${ids.license}',5000,'USD','fulfilled');
    insert into generated_licenses(order_id,buyer_id,track_id,license_type_id,agreement_number,status,terms_snapshot_json,html_snapshot) values('${ids.order}','${ids.buyer}','${ids.live}','${ids.license}','FIXTURE-001','generated','{"immutable":"terms"}','<p>Fixture license</p>');
    insert into order_activity_log(order_id,source,event_type) values('${ids.order}','system','fixture');`);
   await asActor(db,ids.buyer,async()=>{
    assert.equal(await scalar(db,'select count(*)::int from orders'),1);assert.equal(await scalar(db,'select count(*)::int from generated_licenses'),1);
    await rejects(db,`update orders set amount_cents=1 where id='${ids.order}'`);
    await rejects(db,`insert into orders(buyer_user_id,track_id,license_type_id,amount_cents) values('${ids.buyer}','${ids.live}','${ids.license}',1)`);
   });
   await asActor(db,ids.a,async()=>{
    assert.equal(await scalar(db,'select count(*)::int from orders'),0);assert.equal(await scalar(db,'select count(*)::int from generated_licenses'),0);
   });
  });
  await scenario('account deletion without orders cascades profile, tracks, rights and track audit',async()=>{
   await db.exec(`insert into track_audit_log(track_id,actor_id,action) values('${ids.otherTrack}','${ids.b}','fixture'); delete from auth.users where id='${ids.b}'`);
   for(const [table,column] of [['artist_profiles','user_id'],['tracks','artist_user_id']]) assert.equal(await scalar(db,`select count(*)::int from ${table} where ${column}='${ids.b}'`),0);
   assert.equal(await scalar(db,`select count(*)::int from track_audit_log where track_id='${ids.otherTrack}'`),0);
  });
  await scenario('account deletion with a sold track is blocked, preserving the order',async()=>{
   await db.exec(`insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents) values('${ids.order}','${ids.buyer}','${ids.live}','${ids.license}',5000)`);
   await rejects(db,`delete from auth.users where id='${ids.a}'`,/foreign key/);
   assert.equal(await scalar(db,`select count(*)::int from orders where id='${ids.order}'`),1);
  });
  await scenario('buyer account deletion cascades order, generated license and order activity',async()=>{
   await db.exec(`insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents) values('${ids.order}','${ids.buyer}','${ids.live}','${ids.license}',5000);
    insert into generated_licenses(order_id,buyer_id,track_id,license_type_id,agreement_number,status,terms_snapshot_json,html_snapshot) values('${ids.order}','${ids.buyer}','${ids.live}','${ids.license}','FIXTURE-DELETE','generated','{}','<p>fixture</p>');
    insert into order_activity_log(order_id,source,event_type) values('${ids.order}','system','fixture'); delete from auth.users where id='${ids.buyer}'`);
   for(const table of ['orders','generated_licenses','order_activity_log']) assert.equal(await scalar(db,`select count(*)::int from ${table}`),0);
  });
 } finally {await db.close();}
});
test('obsolete bootstrap replay demonstrably restores superseded guards and auth triggers, but not revoked order grants',async()=>{
 const db=await database('production',{seed:false});
 try {
  await db.exec(source('supabase/manual-apply/2026-04-foundation-bootstrap.sql').replace(/create extension if not exists "pgcrypto";/gi,''));
  assert.match(await scalar(db,"select pg_get_functiondef('public.guard_user_profile_write()'::regprocedure)"),/auth.uid\(\) is null or public.is_admin/);
  assert.equal(await scalar(db,"select count(*)::int from pg_trigger where tgname in ('on_auth_user_created','on_auth_user_updated')"),2);
  assert.equal(await scalar(db,"select has_table_privilege('authenticated','public.orders','INSERT')"),false);
 } finally {await db.close();}
});
test('live captures contain metadata only and preserve critical function/grant evidence',()=>{
 for(const target of ['production','staging']) {
  const s=snapshot(target);assert.ok(s.captured_at);assert.ok(s.column_grants.some(g=>g.table==='artist_profiles'&&g.column==='verification_status'&&g.grantee==='authenticated'&&g.privilege==='UPDATE'));
  assert.equal(s.triggers.filter(t=>t.schema==='auth').length,0);
  assert.ok(!JSON.stringify(s).includes('SUPABASE_SERVICE_ROLE_KEY'));
 }
});
