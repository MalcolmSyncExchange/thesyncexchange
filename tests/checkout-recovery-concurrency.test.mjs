// Explicit local-only command. No database URL, credentials, host port, hosted
// connection, Docker engine or existing cluster is accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readdir,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fixtureBootstrapSql,seedDatabase,ids,root,source} from './helpers/artist-baseline-db.mjs';
function command(bin,args,input='') {return new Promise((resolve,reject)=>{
 const child=spawn(bin,args,{stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(Error(`${bin} failed: ${err}`)));child.stdin.on('error',()=>{});child.stdin.end(input);
});}
test('independent PostgreSQL 17 connections serialize reservation/attempt/issuance and fence interrupted workers',{timeout:60000},async()=>{
 assert.match(await command('postgres',['--version']),/PostgreSQL\) 17\./);
 const dir=await mkdtemp('/private/tmp/tse-checkout-pg-'),data=join(dir,'data'),socket=join(dir,'socket');let running=false;
 const sql=text=>command('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-U','postgres','-d','postgres'],`set client_min_messages=warning;set request.jwt.claim.role='service_role';${text}`);
 const last=s=>s.trim().split('\n').at(-1);
 const wait=async predicate=>{for(let i=0;i<150;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('Local connection barrier timed out');};
 try {
  await mkdir(socket,{mode:0o700});await command('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale']);
  await command('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-c listen_addresses= -c unix_socket_directories=${socket} -c max_connections=10 -c shared_buffers=16MB`,'-w','start']);running=true;
  const seed=[];await seedDatabase({exec:async s=>seed.push(s+';')});const files=(await readdir(new URL('supabase/migrations/',root))).filter(x=>x.endsWith('.sql')).sort();
  await sql([fixtureBootstrapSql,...files.map(f=>source('supabase/migrations/'+f)),...seed].join('\n'));
  assert.equal(last(await sql("select current_setting('listen_addresses')=''")),'t');
  const reserve=`select public.reserve_recoverable_checkout('${ids.buyer}','${ids.live}','${ids.license}');`;
  const first=sql(`set application_name='checkout-reserve-a';begin;${reserve}select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='checkout-reserve-a' and wait_event='PgSleep'"))==='1');
  const second=sql(`set application_name='checkout-reserve-b';${reserve}`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='checkout-reserve-b' and wait_event_type='Lock'"))==='1');
  const [a,b]=await Promise.all([first,second]);const ra=JSON.parse(a.split('\n').find(x=>x.startsWith('{'))),rb=JSON.parse(last(b));assert.equal(ra.id,rb.id);
  assert.equal(last(await sql('select count(*) from orders')),'1');const id=ra.id,scope='a'.repeat(64)+':test';
  const params={mode:'payment',client_reference_id:id,metadata:{orderId:id,buyerUserId:ids.buyer,trackId:ids.live,licenseTypeId:ids.license,paymentMode:'test'},line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:5000}}]};
  const claim=`select public.claim_checkout_attempt('${id}','${scope}','${JSON.stringify(params)}');`;
  const c1=sql(`set application_name='checkout-attempt-a';begin;${claim}select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='checkout-attempt-a' and wait_event='PgSleep'"))==='1');
  const c2=sql(`set application_name='checkout-attempt-b';${claim}`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='checkout-attempt-b' and wait_event_type='Lock'"))==='1');
  const [x,y]=await Promise.all([c1,c2]);const attempt=JSON.parse(x.split('\n').find(x=>x.startsWith('{')));assert.equal(attempt.outcome,'create');assert.equal(JSON.parse(last(y)).outcome,'busy');
  // Simulate a crashed worker by expiring only this disposable lease. Retry
  // must preserve its key, and the old worker must lose binding authority.
  await sql(`update checkout_recovery.attempts set lease_until=clock_timestamp()-interval '1 second';`);
  const retry=JSON.parse(last(await sql(claim)));assert.equal(retry.key,attempt.key);assert.notEqual(retry.token,attempt.token);
  await assert.rejects(sql(`select public.finish_checkout_attempt('${id}','${attempt.token}','cs_test_fixture','bound')`),/lease lost/);
  await sql(`select public.finish_checkout_attempt('${id}','${retry.token}','cs_test_fixture','bound');`);
  const evidence={providerEventId:'evt_fixture',eventType:'checkout.session.completed',paymentState:'PAID',checkoutSessionId:'cs_test_fixture',paymentIntentId:'pi_fixture',amountMinor:5000,refundedMinor:0,currency:'USD',evidenceSha256:'a'.repeat(64),providerCreatedAt:'2026-10-21T00:00:00Z',livemode:false};
  const paid=`select public.record_verified_checkout_payment('${id}','${scope}','${JSON.stringify(evidence)}');`;
  await Promise.all([sql(paid),sql(paid)]);assert.equal(last(await sql('select count(*) from checkout_recovery.verified_events')),'1');
  await sql(`update orders set status='paid',paid_at=now() where id='${id}';`);
  const j1=sql(`set application_name='checkout-job-a';begin;select public.claim_order_agreement_job('${id}');select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='checkout-job-a' and wait_event='PgSleep'"))==='1');
  const j2=sql(`set application_name='checkout-job-b';select public.claim_order_agreement_job('${id}');`);const observed=j2.then(()=>false,e=>/busy/.test(e.message));
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='checkout-job-b' and wait_event_type='Lock'"))==='1');
  await j1;assert.equal(await observed,true);
  assert.equal(last(await sql('select count(*) from generated_licenses')),'0');
  assert.equal(last(await sql("select count(*) from commerce_private.capabilities where foundation_enabled or payment_adapter_enabled")),'0');
 } finally {
  if(running)await command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
  // The path was created by mkdtemp above, never supplied by a user/environment.
  await rm(dir,{recursive:true,force:true});
 }
});
