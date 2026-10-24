// Fresh native PostgreSQL 17, no hosted DSN, real crypto and independent sessions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
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
  assert.equal(files.length,54);
  assert.equal(files.at(-1),'20261024021823_system01_authentication_guards.sql');
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
  // Replay the successor patches is idempotent only where explicitly designed.
  // Re-running the entire historical chain is not a supported recovery operation.
 }finally{if(running)await command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);await rm(dir,{recursive:true,force:true});}
});
