// New additive suite. No hosted DSN or existing database/cluster is accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fixtureBootstrapSql,nativeCryptoBootstrapSql,seedDatabase,root,source,ids,quote} from './helpers/artist-baseline-db.mjs';
import {seedDelivery,beginDownload,finishDownload} from './helpers/secure-delivery-fixture.mjs';
import {newQuote,call,sqlCall} from './helpers/purchase-legal-fixture.mjs';
const command=(bin,args,input='')=>new Promise((resolve,reject)=>{
 const c=spawn(bin,args,{env:{PATH:process.env.PATH,LC_ALL:'C'},stdio:['pipe','pipe','pipe']});let out='',err='';
 c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',reject);
 c.on('close',code=>code===0?resolve(out.trim()):reject(Error(`${bin}: ${err}`)));c.stdin.on('error',()=>{});c.stdin.end(input);
});
test('native independent sessions serialize source edits, stale acceptance and source restrictions before release',{timeout:60000},async()=>{
 assert.match(await command('postgres',['--version']),/PostgreSQL\) 17\./);
 const dir=await mkdtemp('/private/tmp/tse-source-pg-'),data=join(dir,'data'),socket=join(dir,'socket');let running=false;
 let login='postgres';
 const sql=text=>command('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-U',login,'-d','postgres'],`set client_min_messages=warning;set request.jwt.claim.role='service_role';${text}`);
 const last=s=>s.trim().split('\n').at(-1);
 const wait=async predicate=>{for(let i=0;i<150;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('Local lock barrier timed out');};
 try {
  await mkdir(socket,{mode:0o700});await command('initdb',['-D',data,'-U','pk04_fixture_admin','--auth=trust','--encoding=UTF8','--no-locale']);
  await command('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-c listen_addresses= -c unix_socket_directories=${socket} -c max_connections=10 -c shared_buffers=16MB`,'-w','start']);running=true;
  await command('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-U','pk04_fixture_admin','-d','postgres'],'create role postgres login superuser');
  const seed=[];await seedDatabase({exec:async s=>seed.push(s+';')});
  const files=(await readdir(new URL('supabase/migrations/',root))).filter(f=>f.endsWith('.sql')).sort();
  await sql([fixtureBootstrapSql,nativeCryptoBootstrapSql,...files.filter(f=>f<'20261022191602_immutable_source_integration.sql').map(f=>source('supabase/migrations/'+f)),...seed].join('\n'));
  assert.equal(last(await sql("select current_setting('listen_addresses')=''")),'t');
  // Definers execute as their real non-superuser owner during the lifecycle.
  login='pk04_fixture_admin';await sql('alter schema public owner to postgres;grant create on database postgres to postgres;alter role postgres nosuperuser');
  assert.equal(last(await sql("select rolsuper from pg_roles where rolname='postgres'")),'f');
  login='postgres';for(const file of files.filter(f=>f>='20261022191602_immutable_source_integration.sql'))await sql(source('supabase/migrations/'+file));login='pk04_fixture_admin';
  let actor='';
  const db={exec:async text=>{if(text.startsWith('set role ')){actor=text+';';return;}if(text.startsWith('reset role;')){actor='';return;}return sql(actor+text);},query:async text=>({rows:(await sql(actor+`select row_to_json(r) from (${text}) r;`)).split('\n').filter(x=>x.startsWith('{')).map(JSON.parse)})};
  const ctx=await seedDelivery(db),otherBuyer='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  await db.exec(`insert into auth.users(id,email) values('${otherBuyer}','source-race@fixture.invalid');insert into user_profiles(id,email,role,full_name) values('${otherBuyer}','source-race@fixture.invalid','buyer','Synthetic concurrent buyer')`);
  const q=await newQuote(db,otherBuyer);
  const original=(await call(db,'read_accepted_purchase',[ctx.order])).snapshot;
  const edit=sql(`set application_name='source-edit';begin;update public.tracks set title='Changed during checkout' where id='${ids.live}';select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='source-edit' and wait_event='PgSleep'"))==='1');
  const accept=sql(`set application_name='source-assent';set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${otherBuyer}';${sqlCall('accept_purchase_quote',[q.id,q.hash,q.schedule.terms.requiredConsents,q.schedule.buyer.representative])};`);
  const rejected=accept.then(()=>false,e=>{assert.match(e.message,/changed incompatibly/);return true;});
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='source-assent' and wait_event_type='Lock'"))==='1');
  await edit;assert.equal(await rejected,true);assert.equal(last(await sql('select count(*) from public.orders')),'1');
  const first=await beginDownload(ctx);assert.equal(first.allowed,true);assert.equal(await finishDownload(ctx,first),true);
  const ticket=await beginDownload(ctx);
  const restrict=sql(`set application_name='source-restrict';begin;${sqlCall('restrict_purchase_source',[ids.admin,original.sourceEvidence.id,'SYNTHETIC source integrity hold'])};select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='source-restrict' and wait_event='PgSleep'"))==='1');
  const release=sql(`set application_name='source-release';${sqlCall('finish_asset_download',[ids.buyer,ticket.authorizationId,'bytes_prepared'])};`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='source-release' and wait_event_type='Lock'"))==='1');
  await restrict;assert.equal(last(await release),'f');assert.equal((await beginDownload(ctx)).allowed,false);
  assert.equal(last(await sql(`select outcome from commerce_private.delivery_outcomes where authorization_id=${quote(ticket.authorizationId)}`)),'revoked');
  assert.equal(last(await sql('select count(*) from generated_licenses')),'1');
  assert.deepEqual((await call(db,'read_accepted_purchase',[ctx.order])).snapshot,original);
  assert.equal(last(await sql('select count(*) from licensing_private.source_status_events')),'1');
  assert.equal(last(await sql("select has_table_privilege('authenticated','licensing_private.source_reviews','select')")),'f');
 } finally {
  if(running)await command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
  await rm(dir,{recursive:true,force:true});
 }
});
