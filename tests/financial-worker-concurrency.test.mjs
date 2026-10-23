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
test('native signed capture, exclusive queue leases, atomic concurrent completion and interrupted recovery reconcile exactly',{timeout:90000},async()=>{
 assert.match(await command('postgres',['--version']),/PostgreSQL\) 17\./);
 const dir=await mkdtemp('/private/tmp/tse-finance-worker-pg-'),data=join(dir,'data'),socket=join(dir,'socket');let running=false,login='postgres';
 const sql=text=>command('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-U',login,'-d','postgres'],`set client_min_messages=warning;set request.jwt.claim.role='service_role';${text}`);
 const last=s=>s.trim().split('\n').at(-1);
 const wait=async predicate=>{for(let i=0;i<200;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,15));}throw Error('Financial worker lock barrier timed out');};
 try{
  await mkdir(socket,{mode:0o700});await command('initdb',['-D',data,'-U','pk09r_fixture_admin','--auth=trust','--encoding=UTF8','--no-locale']);
  await command('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-c listen_addresses= -c unix_socket_directories=${socket} -c max_connections=15 -c shared_buffers=16MB`,'-w','start']);running=true;
  login='pk09r_fixture_admin';await sql('create role postgres login superuser');login='postgres';const seed=[];await seedDatabase({exec:async s=>seed.push(s+';')});
  const files=(await readdir(new URL('supabase/migrations/',root))).filter(f=>f.endsWith('.sql')).sort();
  await sql([fixtureBootstrapSql,nativeCryptoBootstrapSql,...files.filter(f=>f<'20261022213225_financial_ingestion_recovery.sql').map(f=>source('supabase/migrations/'+f)),...seed].join('\n'));
  login='pk09r_fixture_admin';await sql('alter schema public owner to postgres;alter role postgres nosuperuser');login='postgres';for(const file of files.filter(f=>f>='20261022213225_financial_ingestion_recovery.sql'))await sql(source('supabase/migrations/'+file));login='pk09r_fixture_admin';
  assert.equal(last(await sql("select rolsuper from pg_roles where rolname='postgres'")),'f');assert.equal(last(await sql("select current_setting('listen_addresses')=''")),'t');
  let actor='';const db={exec:async text=>{if(text.startsWith('set role ')){actor=text+';';return;}if(text.startsWith('reset role;')){actor='';return;}return sql(actor+text);},query:async text=>({rows:(await sql(actor+`select row_to_json(r) from (${text}) r;`)).split('\n').filter(x=>x.startsWith('{')).map(JSON.parse)})};
  const f=await providerFixture(db),event=f.event(),raw=JSON.stringify(event),capture=sqlCall('ingest_financial_provider_event',[endpoint,credential,signing,raw,normalizeProviderEvent(event)]);
  const firstCapture=sql(`set application_name='finance-capture-a';begin;${capture};select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='finance-capture-a' and wait_event='PgSleep'"))==='1');
  const secondCapture=sql(`set application_name='finance-capture-b';${capture};`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='finance-capture-b' and wait_event_type='Lock'"))==='1');await Promise.all([firstCapture,secondCapture]);
  assert.equal(last(await sql('select count(*) from finance_private.provider_events')),'1');assert.equal(last(await sql('select count(*) from finance_private.provider_jobs')),'1');
  assert.equal(last(await sql('select raw_hash from finance_private.provider_events')),digest(raw));
  const claim=sqlCall('claim_financial_provider_job',[endpoint,credential]);
  const firstClaim=sql(`set application_name='finance-claim-a';begin;${claim};select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='finance-claim-a' and wait_event='PgSleep'"))==='1');
  const secondClaim=await sql(`${claim};`);assert.equal(secondClaim,'');const claimed=(await firstClaim).split('\n').find(x=>x.startsWith('{'));const job=JSON.parse(claimed);
  f.state.events.set(event.id,event);const proof=await readProviderEvidence(job,f.stripe),finish=sqlCall('finish_financial_provider_job',[endpoint,job.id,job.token,proof]);
  await sql(`begin;${finish};rollback;`);assert.equal(last(await sql('select count(*) from finance_private.journals')),'0');assert.equal(last(await sql("select state from finance_private.provider_jobs")),'leased');
  const firstFinish=sql(`set application_name='finance-finish-a';begin;${finish};select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='finance-finish-a' and wait_event='PgSleep'"))==='1');
  const secondFinish=sql(`set application_name='finance-finish-b';${finish};`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='finance-finish-b' and wait_event_type='Lock'"))==='1');
  await firstFinish;assert.equal(JSON.parse(last(await secondFinish)).state,'stale');assert.equal(last(await sql('select count(*) from finance_private.journals')),'2');
  assert.equal(last(await sql(`select finance_private.balance('${f.c.order}','clearing')`)),'4850');
  await f.refund(1000);assert.equal((await f.run()).posted,1);const ops=await f.operations();assert.equal(ops.counts.posted,2);
  const current=JSON.parse(last(await sql(`set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${ids.admin}';${sqlCall('read_financial_order',[f.c.order])};`)));
  assert.equal(current.matched,true);assert.deepEqual(current.issues,[]);assert.equal(current.balances.clearing,'3850');
  assert.equal(last(await sql('select count(*) from(select journal_id from finance_private.lines group by journal_id having sum(signed_minor)<>0) q')),'0');
  await assert.rejects(sql('set role service_role;select raw_body from finance_private.provider_events'),/permission/);
  await assert.rejects(sql('set role postgres;delete from finance_private.provider_events'),/immutable/);
  assert.equal(last(await sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='finance_private' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)")),'0');
  console.log(JSON.stringify({scenario:'PK09-R authenticated provider and worker lifecycle',originalEventId:event.id,rawSha256:last(await sql('select raw_hash from finance_private.provider_events order by received_at limit 1')),signedEvents:2,originalPurchaseJournals:1,processorFeeMinor:150,grossMinor:5000,refundedMinor:1000,clearingMinor:3850,unbalancedJournals:0,reconciliation:current}));
 }finally{if(running)await command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);await rm(dir,{recursive:true,force:true});}
});
