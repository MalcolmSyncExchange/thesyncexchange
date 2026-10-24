// Fresh native PostgreSQL 17, no hosted DSN, real crypto and independent sessions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {mkdtemp,mkdir,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fixtureBootstrapSql,nativeCryptoBootstrapSql,root,source} from './helpers/artist-baseline-db.mjs';
const command=(bin,args,input='')=>new Promise((resolve,reject)=>{
 const c=spawn(bin,args,{env:{PATH:process.env.PATH,LC_ALL:'C'},stdio:['pipe','pipe','pipe']});let out='',err='';
 c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',reject);c.on('close',code=>code===0?resolve(out.trim()):reject(Error(`${bin}: ${err}`)));c.stdin.on('error',()=>{});c.stdin.end(input);
});
test('release candidate clean native replay installs every source migration in order with Auth analytics media and commerce disabled',{timeout:90000},async t=>{
 assert.match(await command('postgres',['--version']),/PostgreSQL\) 17\./);
 const dir=await mkdtemp('/private/tmp/tse-release-replay-'),data=join(dir,'data'),socket=join(dir,'socket');let running=false;
 const sql=text=>command('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-U','postgres','-d','postgres'],"set client_min_messages=warning;set request.jwt.claim.role='service_role';"+text);
 try{
  await mkdir(socket,{mode:0o700});await command('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale']);
  await command('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-c listen_addresses= -c unix_socket_directories=${socket} -c max_connections=15 -c shared_buffers=16MB`,'-w','start']);running=true;
  await sql(fixtureBootstrapSql+'\n'+nativeCryptoBootstrapSql);
  const files=(await readdir(new URL('supabase/migrations/',root))).filter(f=>f.endsWith('.sql')).sort();
  for(const file of files){await sql(source('supabase/migrations/'+file));t.diagnostic('Applied exact source '+file);}
  assert.equal(files.length,65);
  assert.equal(files.at(-12),'20261024021823_system01_authentication_guards.sql');
  assert.equal(files.at(-11),'20261024032018_system02_artist_account.sql');
  assert.equal(files.at(-10),'20261024035806_system03_music_uploads.sql');
  assert.equal(files.at(-9),'20261024044101_system04_rights_verification.sql');
  assert.equal(files.at(-8),'20261024060044_system05_catalog_management.sql');
  assert.equal(files.at(-7),'20261024070934_system06_buyer_marketplace.sql');
  assert.equal(files.at(-6),'20261024080855_system07_licensing.sql');
  assert.equal(files.at(-5),'20261024094011_system08_checkout_payments.sql');
  assert.equal(files.at(-4),'20261024105306_system09_secure_delivery.sql');
  assert.equal(files.at(-3),'20261024175837_system10_financial_accounting.sql');
  assert.equal(files.at(-2),'20261024185357_system11_sec_admin.sql');
  assert.equal(files.at(-1),'20261024210014_system12_analytics_integration.sql');
  assert.equal((await sql("select count(*) from pg_extension where extname='pgcrypto'")),'1');
  assert.equal((await sql("select to_regprocedure('public.digest(text,text)') is null")),'t');
  assert.equal((await sql("select current_setting('listen_addresses')=''")),'t');
  for(const table of ['user_profiles','artist_profiles','analytics_outbox','order_asset_entitlements','finance_private.journals','licensing_private.acceptances','submission_media.assets']){
   assert.equal(await sql('select count(*) from '+table),'0',table);
  }
  for(const name of ['ingest_financial_provider_event','get_analytics_verified_purchase','save_artist_onboarding_atomic']){
   assert.equal(await sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${name}'`),'1');
   for(const role of ['anon','authenticated'])assert.equal(await sql(`select bool_or(has_function_privilege('${role}',p.oid,'EXECUTE')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${name}'`),'f');
  }
  assert.equal(await sql("select not (foundation_enabled or asset_preparation_enabled or receipt_generation_enabled or entitlement_activation_enabled or transaction_projection_enabled or payment_adapter_enabled) from commerce_private.capabilities"),'t');
  assert.equal(await sql("select not (synthetic_posting_enabled or ingestion_enabled or worker_enabled) from finance_private.capabilities"),'t');
  assert.equal(await sql("select not (reservations_enabled or worker_enabled or activation_enabled or foundation_reads_enabled) from submission_media.capabilities"),'t');
  assert.equal(await sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('analytics_outbox','user_profiles','order_asset_entitlements') and c.relrowsecurity"),'3');
  // Exercise the additive Auth boundary on native PostgreSQL, not only PGlite.
  await sql("insert into auth.users(id,email) values('11111111-1111-4111-8111-111111111111','native-admin@fixture.invalid'),('22222222-2222-4222-8222-222222222222','native-buyer@fixture.invalid');insert into public.user_profiles(id,email,role,full_name) values('11111111-1111-4111-8111-111111111111','native-admin@fixture.invalid','admin','Synthetic Admin'),('22222222-2222-4222-8222-222222222222','native-buyer@fixture.invalid','buyer','Synthetic Buyer');insert into auth.sessions(id,user_id) values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111');");
  const adminContext = "set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';set request.jwt.claim.session_id='33333333-3333-4333-8333-333333333333';";
  assert.equal(await sql(adminContext+"set request.jwt.claim.aal='aal1';select public.is_admin()"),'f');
  assert.equal(await sql(adminContext+"set request.jwt.claim.aal='aal2';select public.is_admin()"),'t');
  assert.equal(await sql(adminContext+"set request.jwt.claim.aal='aal2';set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';select public.is_admin()"),'f');
  await sql("delete from auth.sessions where id='33333333-3333-4333-8333-333333333333'");
  assert.equal(await sql(adminContext+"set request.jwt.claim.aal='aal2';select public.is_admin()"),'f');
  t.diagnostic('Native Auth: AAL1, foreign owner and revoked sessions denied; canonical AAL2 active session allowed.');
  // Two real PostgreSQL sessions prove Artist CAS locking, private-row RLS and rollback.
  const artist='44444444-4444-4444-8444-444444444444';
  await sql(`insert into auth.users(id,email) values('${artist}','native-artist@fixture.invalid');insert into user_profiles(id,email,role,full_name,onboarding_step) values('${artist}','native-artist@fixture.invalid','artist','Native Artist','basics')`);
  const a=new pg.Client({host:socket,user:'postgres',database:'postgres'}),b=new pg.Client({host:socket,user:'postgres',database:'postgres'});await a.connect();await b.connect();
  try {
   for(const client of [a,b])await client.query("set request.jwt.claim.role='service_role'");
   const version=(await a.query('select updated_at::text v from user_profiles where id=$1',[artist])).rows[0].v;
   const identity={legalName:'Native Legal Representative',entityType:'individual',businessName:'',country:'US',contactEmail:'native-contact@fixture.invalid'};
   const call=(client,name)=>client.query('select save_artist_account_step($1::uuid,$2::timestamptz,$3,$4::jsonb,$5::jsonb)',[artist,version,'basics',JSON.stringify({fullName:'Native Artist',artistName:name}),JSON.stringify(identity)]);
   await a.query('begin');await a.query('select id from user_profiles where id=$1 for update',[artist]);
   let settled=false;const contender=call(b,'Stale Artist').then(()=>({success:true}),e=>({code:e.code})).finally(()=>settled=true);
   // Confirm B is blocked on a real lock before A advances the canonical version.
   for(let i=0;i<100;i++){const wait=(await a.query("select count(*)::int n from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock'")).rows[0].n;if(wait)break;if(i===99)throw Error('Contender never reached row lock');await new Promise(r=>setTimeout(r,10));}
   assert.equal(settled,false);await call(a,'Native Winner');await a.query('commit');assert.equal((await contender).code,'PT409');
   assert.equal((await a.query('select artist_name from artist_profiles where user_id=$1',[artist])).rows[0].artist_name,'Native Winner');assert.equal((await a.query('select count(*)::int n from artist_profiles where user_id=$1',[artist])).rows[0].n,1);
   const before=(await a.query('select to_jsonb(u) value from user_profiles u where id=$1',[artist])).rows[0].value;
   await a.query("create function public.system02_injected_failure() returns trigger language plpgsql as $$ begin raise exception 'Synthetic audit outage';end $$;create trigger system02_injected_failure before insert on artist_account_events for each row execute function public.system02_injected_failure()");
   await assert.rejects(a.query('select save_artist_account_step($1::uuid,$2::timestamptz,$3,$4::jsonb)',[artist,before.updated_at,'profile',JSON.stringify({bio:'Synthetic native biography with sufficient context.',location:'London',website:'',instagram:'',spotify:'',youtube:''})]));
   assert.deepEqual((await a.query('select to_jsonb(u) value from user_profiles u where id=$1',[artist])).rows[0].value,before);await a.query('drop trigger system02_injected_failure on artist_account_events;drop function public.system02_injected_failure()');
   await b.query("set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'");assert.equal((await b.query('select count(*)::int n from artist_account_details')).rows[0].n,0);await assert.rejects(b.query("update artist_account_details set identity='{}'"),e=>e.code==='42501');
   t.diagnostic('Native Artist: two-session row-lock/CAS conflict denied; single profile; injected audit failure rolled back; cross-role private rows and writes denied.');
  } finally {await a.end();await b.end();}
  // Replay the successor patches is idempotent only where explicitly designed.
  // Re-running the entire historical chain is not a supported recovery operation.
 }finally{if(running)await command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);await rm(dir,{recursive:true,force:true});}
});
