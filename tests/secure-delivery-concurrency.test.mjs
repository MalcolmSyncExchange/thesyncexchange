// No hosted URL or existing cluster accepted. Native PostgreSQL with TCP disabled.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fixtureBootstrapSql,nativeCryptoBootstrapSql,seedDatabase,root,source,ids,quote} from './helpers/artist-baseline-db.mjs';
import {seedDelivery,beginDownload,finishDownload} from './helpers/secure-delivery-fixture.mjs';
import {sqlCall} from './helpers/purchase-legal-fixture.mjs';
const command=(bin,args,input='')=>new Promise((resolve,reject)=>{const c=spawn(bin,args,{stdio:['pipe','pipe','pipe']});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',reject);c.on('close',code=>code===0?resolve(out.trim()):reject(Error(`${bin}: ${err}`)));c.stdin.on('error',()=>{});c.stdin.end(input);});
test('native separate connections deduplicate download authorization and serialize adverse payment before byte release',{timeout:60000},async()=>{
 assert.match(await command('postgres',['--version']),/PostgreSQL\) 17\./);
 const dir=await mkdtemp('/private/tmp/tse-delivery-pg-'),data=join(dir,'data'),socket=join(dir,'socket');let running=false;
 const sql=text=>command('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-U','postgres','-d','postgres'],`set client_min_messages=warning;set request.jwt.claim.role='service_role';${text}`);
 const last=s=>s.trim().split('\n').at(-1);
 const wait=async predicate=>{for(let i=0;i<150;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('Local lock barrier timed out');};
 try {
  await mkdir(socket,{mode:0o700});await command('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale']);
  await command('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-c listen_addresses= -c unix_socket_directories=${socket} -c max_connections=10 -c shared_buffers=16MB`,'-w','start']);running=true;
  const seed=[];await seedDatabase({exec:async s=>seed.push(s+';')});
  const files=(await readdir(new URL('supabase/migrations/',root))).filter(f=>f.endsWith('.sql')).sort();
  await sql([fixtureBootstrapSql,nativeCryptoBootstrapSql,...files.map(f=>source('supabase/migrations/'+f)),...seed].join('\n'));
  assert.equal(last(await sql("select current_setting('listen_addresses')=''")),'t');
  let actor='';
  const db={exec:async text=>{if(text.startsWith('set role ')){actor=text+';';return;}if(text.startsWith('reset role;')){actor='';return;}return sql(actor+text);},query:async text=>({rows:(await sql(actor+`select row_to_json(r) from (${text}) r;`)).split('\n').filter(x=>x.startsWith('{')).map(JSON.parse)})};
  const ctx=await seedDelivery(db),request=randomUUID();
  const begin=sqlCall('begin_asset_download',[ids.buyer,ctx.order,ctx.entitlement,request,ctx.session]);
  const first=sql(`set application_name='delivery-request-a';begin;${begin};select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='delivery-request-a' and wait_event='PgSleep'"))==='1');
  const second=sql(`set application_name='delivery-request-b';${begin};`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='delivery-request-b' and wait_event_type='Lock'"))==='1');
  const [a,b]=await Promise.all([first,second]);
  const authorization=JSON.parse(a.split('\n').find(s=>s.startsWith('{')));
  assert.equal(authorization.allowed,true);assert.equal(JSON.parse(last(b)).reason,'duplicate_request');
  assert.equal(last(await sql('select count(*) from commerce_private.delivery_authorizations')),'1');
  const ticketHash='c'.repeat(64);await sql(`${sqlCall('create_asset_delivery_ticket',[ids.buyer,authorization.authorizationId,ticketHash])};`);
  const redeem=sqlCall('redeem_asset_delivery_ticket',[ticketHash]);
  const redeemA=sql(`set application_name='delivery-ticket-a';begin;${redeem};select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='delivery-ticket-a' and wait_event='PgSleep'"))==='1');
  const redeemB=sql(`set application_name='delivery-ticket-b';${redeem};`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='delivery-ticket-b' and wait_event_type='Lock'"))==='1');
  const redemptions=await Promise.all([redeemA,redeemB]);assert.equal(JSON.parse(redemptions[0].split('\n').find(s=>s.startsWith('{'))).allowed,true);assert.equal(JSON.parse(last(redemptions[1])).allowed,false);
  assert.equal(await finishDownload(ctx,authorization),true);
  const pending=await beginDownload(ctx);
  const adverse=sqlCall('record_purchase_completion_event',[ctx.order,'acct_fixture','evt_nativedeliveryrefund',null,'pi_fixture','charge.refunded','REFUNDED',5000,5000,'USD','b'.repeat(64),'2026-10-22T01:00:00Z']);
  const refund=sql(`set application_name='delivery-refund';begin;${adverse};select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='delivery-refund' and wait_event='PgSleep'"))==='1');
  const release=sql(`set application_name='delivery-release';${sqlCall('finish_asset_download',[ids.buyer,pending.authorizationId,'bytes_prepared'])};`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='delivery-release' and wait_event_type='Lock'"))==='1');
  await refund;assert.equal(last(await release),'f');
  assert.equal(last(await sql(`select outcome from commerce_private.delivery_outcomes where authorization_id=${quote(pending.authorizationId)}`)),'revoked');
  assert.equal((await beginDownload(ctx)).allowed,false);
  assert.equal(last(await sql('select count(*) from generated_licenses')),'1');
 } finally {
  if(running)await command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
  await rm(dir,{recursive:true,force:true});
 }
});
