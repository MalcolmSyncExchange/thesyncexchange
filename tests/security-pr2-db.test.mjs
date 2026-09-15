import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { database, asActor, ids, source, root, quote } from './helpers/artist-baseline-db.mjs';
const migrations=readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.startsWith('20260915')).sort();
async function fixture(fn) {const db=await database();try{await fn(db);}finally{await db.close();}}
const read=(db,sql)=>db.query(sql).then(r=>r.rows);
const denied=(db,sql)=>assert.rejects(db.exec(sql),/permission|Protected|workflow|Reviewed|Artist|approved|review|100|changed|Active/i);

test('profile, finance, buyer and rights boundaries run as real PostgreSQL roles',()=>fixture(async db=>{
 await asActor(db,ids.a,async()=>{
  assert.equal((await read(db,'select id,artist_name from artist_profiles')).length,1);
  await db.exec("update artist_profiles set bio='Edited public bio'");
  assert.equal((await read(db,'select bio from artist_profiles'))[0].bio,'Edited public bio');
  for(const sql of ["update artist_profiles set verification_status='verified'", "update artist_profiles set payout_email='attacker@invalid'",`update artist_profiles set user_id='${ids.b}'`,'select payout_email from artist_profiles',`insert into artist_profiles(user_id,artist_name,verification_status) values('${ids.a}','Forged','verified')`]) await denied(db,sql);
  assert.deepEqual(await read(db,`select id from tracks where artist_user_id='${ids.b}'`),[]);
  assert.equal((await read(db,`update tracks set title='Other' where id='${ids.otherTrack}' returning id`)).length,0);
  assert.equal((await read(db,'select * from get_own_artist_finance()'))[0].payout_email,'private-a@fixture.invalid');
  await db.exec(`update rights_holders set name='Edited draft credit' where track_id='${ids.draft}'`);
  await denied(db,`update rights_holders set approval_status='approved' where track_id='${ids.draft}'`);
  for(const sql of [`update rights_holders set ownership_percent=50 where track_id='${ids.live}'`,`delete from rights_holders where track_id='${ids.live}'`,`insert into rights_holders(track_id,name,email,role_type,ownership_percent) values('${ids.live}','Forged','x@invalid','owner',100)`,`update rights_holders set track_id='${ids.draft}' where track_id='${ids.live}'`,`update rights_holders set track_id='${ids.live}' where track_id='${ids.draft}'`]) await denied(db,sql);
  await db.exec(`update tracks set status='archived' where id='${ids.live}'`);
  await denied(db,`update rights_holders set name='Archive bypass' where track_id='${ids.live}'`);
  await db.exec(`update tracks set status='pending_review' where id='${ids.live}'`);
  await denied(db,`delete from rights_holders where track_id='${ids.live}'`);
 } );
 await db.exec(`update tracks set status='approved' where id='${ids.live}'`);
 await asActor(db,ids.buyer,async()=>{
  assert.deepEqual(await read(db,'select audio_file_path from tracks'),[]);
  assert.deepEqual(await read(db,'select id,artist_name from artist_profiles'),[]);
  await denied(db,'select payout_email from artist_profiles');
  await denied(db,'select * from get_own_artist_finance()');
  assert.equal((await read(db,'select * from buyer_catalog_public')).length,1);
  assert.equal((await read(db,'select * from track_license_options')).length,1);
  assert.equal((await read(db,'select * from track_rights_holders_public')).length,1);
  const catalog=JSON.stringify(await read(db,'select * from buyer_catalog_public'));
  const credits=JSON.stringify(await read(db,'select * from track_rights_holders_public'));
  for(const key of ['audio_file_path','artist_user_id','approved_by','approved_at','verification_status','payout_email']) assert.ok(!catalog.includes('"'+key+'"'));
  for(const key of ['email','user_id','approval_status','created_at','updated_at']) assert.ok(!credits.includes('"'+key+'"'));
  await db.exec(`insert into favorites(buyer_user_id,track_id) values('${ids.buyer}','${ids.live}')`);
  assert.equal((await read(db,'select * from favorites')).length,1);
 });
 await asActor(db,ids.admin,async()=>{
  await db.exec(`update rights_holders set name='Reviewed correction' where track_id='${ids.live}'`);
  assert.equal((await read(db,'select * from tracks')).length,3);
  await denied(db,'delete from track_audit_log');await denied(db,"update track_audit_log set action='erased'");
 });
 await db.exec(`update artist_profiles set verification_status='verified' where user_id='${ids.a}'`);
 await asActor(db,ids.a,async()=>assert.equal((await read(db,'select verification_status from artist_profiles'))[0].verification_status,'verified'));
 await asActor(db,null,async()=>{
  await denied(db,'select * from get_own_artist_finance()');
  await denied(db,'select * from buyer_catalog_public');
 },'anon');
 await assert.rejects(db.exec(`update user_profiles set onboarding_payload='{"payoutEmail":"copy@invalid"}' where id='${ids.a}'`),/finance workflow/);
}));

test('Storage uses server-authorized mutations, private buckets and all-role referenced-media immutability',()=>fixture(async db=>{
 const path=`${ids.a}/uploads/audio/live.wav`,fresh=`${ids.a}/uploads/audio/fresh.wav`;
 const policies=await read(db,"select policyname,permissive from pg_policies where schemaname='storage'");
 assert.equal(policies.length,5);assert.equal(policies.filter(p=>p.permissive==='RESTRICTIVE').length,3);
 for(const [actor,role] of [[ids.a,'authenticated'],[ids.b,'authenticated'],[ids.buyer,'authenticated'],[ids.admin,'authenticated'],[null,'anon']]) await asActor(db,actor,async()=>{
  for(const bucket of ['avatars','cover-art','track-previews','track-audio','agreements']) {
   assert.deepEqual(await read(db,`select * from storage.objects where bucket_id=${quote(bucket)}`),[]);
   await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values(${quote(bucket)},${quote(fresh)})`),/row-level security/);
  }
  assert.equal((await read(db,`delete from storage.objects where name=${quote(path)} returning id`)).length,0);
 },role);
 await db.exec(`insert into storage.objects(bucket_id,name,version) values('track-audio',${quote(fresh)},'v1')`);
 await db.exec(`update storage.objects set version='v2' where name=${quote(fresh)}`);
 await db.exec(`delete from storage.objects where name=${quote(fresh)}`);
 for(const sql of [`update storage.objects set version='v2' where name=${quote(path)}`,`update storage.objects set name='elsewhere.wav' where name=${quote(path)}`,`update storage.objects set bucket_id='track-previews' where name=${quote(path)}`,`delete from storage.objects where name=${quote(path)}`,`insert into storage.objects(bucket_id,name,version) values('track-audio',${quote(path)},'replacement')`]) await assert.rejects(db.exec(sql),/Referenced track media/);
 await db.exec(`update storage.objects set metadata='{"last_accessed_at":"now"}' where name=${quote(path)}`);
 for(const alias of [`https://custom.invalid/storage/v1/object/sign/track-audio/${path}?token=fixture`,`https://custom.invalid/storage/v1/render/image/public/track-audio/${path}`,`https://custom.invalid/storage/v1/object/public/track-audio/${path.replace('/uploads','%2Fuploads')}`]) {
  await db.exec(`update tracks set audio_file_path=${quote(alias)} where id='${ids.live}'`);
  await assert.rejects(db.exec(`delete from storage.objects where name=${quote(path)}`),/Referenced track media/);
 }
}));

async function atomicArgs(db,overrides={}) {
 const track=(await read(db,`select * from tracks where id='${ids.live}'`))[0];
 return {actor:ids.a,track:ids.live,version:track.updated_at,
  values:{title:'Resubmitted',status:'pending_review'},
  rights:[{name:'New credit',email:'a@fixture.invalid',role_type:'owner',ownership_percent:100}],
  options:[{license_type_id:ids.license,price_cents:5000,active:true}],...overrides};
}
async function atomic(db,a) {return db.query('select update_artist_track_atomic($1,$2,$3,$4,$5,$6)',[a.actor,a.track,a.version,JSON.stringify(a.values),JSON.stringify(a.rights),JSON.stringify(a.options)]);}
test('atomic rights save rejects ID substitution, stale versions, privilege and field forgery; preserves review/audit',()=>fixture(async db=>{
 const args=await atomicArgs(db);
 await asActor(db,ids.a,async()=>await assert.rejects(atomic(db,args),/permission/));
 for(const override of [{actor:ids.b},{actor:ids.buyer},{track:ids.otherTrack},{version:null},{values:{status:'approved'}},{values:{approved_by:ids.a,status:'draft'}},{values:{artist_user_id:ids.b,status:'draft'}},{rights:[{name:'Bad',email:'x@invalid',role_type:'owner',ownership_percent:50}]},{options:[{license_type_id:ids.draft,active:true}]}]) await assert.rejects(atomic(db,{...args,...override}));
 await atomic(db,args);
 const track=(await read(db,`select * from tracks where id='${ids.live}'`))[0];
 assert.equal(track.title,'Resubmitted');assert.equal(track.status,'pending_review');assert.equal(track.artist_user_id,ids.a);
 assert.ok(track.approved_at); // preserve historical review, preventing archive/reset bypass
 const logs=await read(db,`select * from track_audit_log where track_id='${ids.live}' and action='track_updated'`);
 assert.equal(logs.length,1);assert.equal(logs[0].actor_id,ids.a);assert.equal(logs[0].metadata.before.status,'approved');assert.equal(logs[0].metadata.previous_rights.length,1);
 await assert.rejects(atomic(db,args),/changed/);
 await asActor(db,ids.a,async()=>await denied(db,`update rights_holders set name='Bypass review' where track_id='${ids.live}'`));
}));
test('audit write failure rolls back track, rights and licenses as one transaction',()=>fixture(async db=>{
 const args=await atomicArgs(db);
 const snapshot=async()=>JSON.stringify(await read(db,`select to_jsonb(t) as track,(select jsonb_agg(r) from rights_holders r where track_id=t.id) as rights,(select jsonb_agg(o) from track_license_options o where track_id=t.id) as options from tracks t where id='${ids.live}'`));
 const before=await snapshot();
 await db.exec("create function public.fixture_audit_failure() returns trigger language plpgsql as $$ begin raise exception 'fixture audit unavailable'; end; $$; create trigger fixture_audit_failure before insert on track_audit_log for each row execute function public.fixture_audit_failure();");
 await assert.rejects(atomic(db,args),/audit unavailable/);assert.equal(await snapshot(),before);
}));
for(const baseline of ['production','staging']) test(`forward migrations apply to captured ${baseline} and retain rows`,async()=>{
 const db=await database(baseline);try{
  await db.exec(`update artist_profiles set payout_email=null where user_id='${ids.a}'; update user_profiles set onboarding_payload='{"payoutEmail":"legacy@fixture.invalid","bio":"Preserve"}' where id='${ids.a}'; select set_config('request.jwt.claim.role','',false);`);
  for(const file of migrations) await db.exec(source(`supabase/migrations/${file}`));
  assert.equal((await read(db,`select payout_email from artist_profiles where user_id='${ids.a}'`))[0].payout_email,'legacy@fixture.invalid');
  assert.deepEqual((await read(db,`select onboarding_payload from user_profiles where id='${ids.a}'`))[0].onboarding_payload,{bio:'Preserve'});
  assert.equal((await read(db,`select current_setting('request.jwt.claim.role') as role`))[0].role,'');
  assert.equal((await read(db,'select * from tracks')).length,3);
  await asActor(db,ids.a,async()=>{await denied(db,"update artist_profiles set verification_status='verified'");await denied(db,`delete from rights_holders where track_id='${ids.live}'`);});
  await asActor(db,ids.buyer,async()=>assert.equal((await read(db,'select * from buyer_catalog_public')).length,1));
 }finally{await db.close();}
});

test('disabled license types do not block a legitimate artist edit or become buyer-active',()=>fixture(async db=>{
 await db.exec(`update license_types set active=false where id='${ids.license}'`);
 await atomic(db,await atomicArgs(db));
 assert.equal((await read(db,`select active from track_license_options where track_id='${ids.live}'`))[0].active,false);
}));

test('narrow avatar cleanup grants allow owner deletion and reject another artist',()=>fixture(async db=>{
 const path=`${ids.a}/profile/1770000000000-${ids.draft}.png`;
 await db.exec(`insert into storage.objects(bucket_id,name) values('avatars',${quote(path)})`);
 await asActor(db,ids.b,async()=>assert.equal((await read(db,`delete from storage.objects where name=${quote(path)} returning id`)).length,0));
 await asActor(db,ids.a,async()=>{
  assert.equal((await read(db,`select name from storage.objects where name=${quote(path)}`)).length,1);
  assert.equal((await read(db,`delete from storage.objects where name=${quote(path)} returning id`)).length,1);
 });
}));
test('account deletion regression: legacy cascade remains explicit before ownership redesign',()=>fixture(async db=>{
 await db.exec(`delete from auth.users where id='${ids.b}'`);
 assert.equal((await read(db,`select * from tracks where artist_user_id='${ids.b}'`)).length,0);
 assert.equal((await read(db,`select * from track_audit_log where track_id='${ids.otherTrack}'`)).length,0);
 await db.exec(`insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents,status) values('${ids.order}','${ids.buyer}','${ids.live}','${ids.license}',5000,'fulfilled');
 insert into generated_licenses(order_id,buyer_id,track_id,license_type_id,agreement_number,status,terms_snapshot_json,html_snapshot) values('${ids.order}','${ids.buyer}','${ids.live}','${ids.license}','PR2-DELETE','generated','{}','<p>fixture</p>');`);
 await assert.rejects(db.exec(`delete from auth.users where id='${ids.a}'`),/foreign key/);
 await asActor(db,ids.buyer,async()=>{
  assert.equal((await read(db,'select * from orders')).length,1);
  assert.equal((await read(db,'select * from generated_licenses')).length,1);
  await assert.rejects(db.exec("update orders set status='paid'"),/permission/);
 });
 await db.exec(`delete from auth.users where id='${ids.buyer}'`);
 assert.equal((await read(db,'select * from orders')).length,0);assert.equal((await read(db,'select * from generated_licenses')).length,0);
}));
