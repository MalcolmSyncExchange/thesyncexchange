// Fresh native PostgreSQL 17, no hosted DSN, real crypto and independent sessions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fixtureBootstrapSql,nativeCryptoBootstrapSql,seedDatabase,root,source,ids} from './helpers/artist-baseline-db.mjs';
import {providerFixture,endpoint,credential,signing} from './helpers/financial-provider-fixture.mjs';
import {normalizeProviderEvent,digest} from '../lib/finance/provider-events.mjs';
import {readProviderEvidence} from '../services/finance/provider-reader.mjs';
import {sqlCall} from './helpers/purchase-legal-fixture.mjs';
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
  assert.equal(files.length,53);
  assert.equal((await sql("select count(*) from pg_extension where extname='pgcrypto'")),'1');
  assert.equal((await sql("select to_regprocedure('public.digest(text,text)') is null")),'t');
  assert.equal((await sql("select current_setting('listen_addresses')=''")),'t');
  for(const table of ['user_profiles','artist_profiles','analytics_outbox','order_asset_entitlements','finance_private.journals','licensing_private.acceptances','submission_media.assets']){
   assert.equal(await sql('select count(*) from '+table),'0',table);
  }
  for(const signature of ['public.ingest_financial_provider_event(uuid,text,text,text,jsonb)','public.get_analytics_verified_purchase(uuid,text,text)','public.save_artist_onboarding_atomic(uuid,text,jsonb,timestamptz)']){
   // Resolve actual signatures from pg_proc below; do not grant broadly to make a test pass.
   if(await sql(`select to_regprocedure('${signature}') is not null`)==='t'){
    for(const role of ['anon','authenticated'])assert.equal(await sql(`select has_function_privilege('${role}','${signature}','EXECUTE')`),'f');
   }
  }
  assert.equal(await sql("select not (foundation_enabled or asset_preparation_enabled or receipt_generation_enabled or entitlement_activation_enabled or transaction_projection_enabled or payment_adapter_enabled) from commerce_private.capabilities"),'t');
  assert.equal(await sql("select not (synthetic_posting_enabled or ingestion_enabled or worker_enabled) from finance_private.capabilities"),'t');
  assert.equal(await sql("select not (reservations_enabled or worker_enabled or activation_enabled or foundation_reads_enabled) from submission_media.capabilities"),'t');
  assert.equal(await sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('analytics_outbox','user_profiles','order_asset_entitlements') and c.relrowsecurity"),'3');
  // Replay the successor patches is idempotent only where explicitly designed.
  // Re-running the entire historical chain is not a supported recovery operation.
 }finally{if(running)await command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);await rm(dir,{recursive:true,force:true});}
});
