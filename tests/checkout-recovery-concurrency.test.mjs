// Explicit local-only command. No database URL, credentials, host port, hosted
// connection, Docker engine or existing cluster is accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readdir,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fixtureBootstrapSql,seedDatabase,ids,root,source} from './helpers/artist-baseline-db.mjs';
import {seedLegalReview,seedFixtureAcceptance,newQuote,sqlCall} from './helpers/purchase-legal-fixture.mjs';
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
  let actorSql='';
  const db={exec:async text=>{if(text.startsWith('set role ')){actorSql=text+';';return;}if(text.startsWith('reset role;')){actorSql='';return;}return sql(actorSql+text);},query:async text=>({rows:(await sql(actorSql+`select row_to_json(r) from (${text}) r;`)).split('\n').filter(x=>x.startsWith('{')).map(JSON.parse)})};
  await seedLegalReview(db);
  assert.equal(last(await sql("select current_setting('listen_addresses')=''")),'t');
  const reserve=`select public.reserve_recoverable_checkout('${ids.buyer}','${ids.live}','${ids.license}');`;
  const first=sql(`set application_name='checkout-reserve-a';begin;${reserve}select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='checkout-reserve-a' and wait_event='PgSleep'"))==='1');
  const second=sql(`set application_name='checkout-reserve-b';${reserve}`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='checkout-reserve-b' and wait_event_type='Lock'"))==='1');
  const [a,b]=await Promise.all([first,second]);const ra=JSON.parse(a.split('\n').find(x=>x.startsWith('{'))),rb=JSON.parse(last(b));assert.equal(ra.id,rb.id);
  assert.equal(last(await sql('select count(*) from orders')),'1');const id=ra.id,scope='a'.repeat(64)+':test';
  await seedFixtureAcceptance(db,id);
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
  const secondBuyer='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',secondOrder='ffffffff-ffff-4fff-8fff-ffffffffffff';
  await sql(`insert into auth.users(id,email) values('${secondBuyer}','orphan@fixture.invalid');insert into user_profiles(id,email,role,full_name) values('${secondBuyer}','orphan@fixture.invalid','buyer','Orphan fixture');
   insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents,currency,stripe_checkout_session_id) values('${secondOrder}','${secondBuyer}','${ids.live}','${ids.license}',5000,'USD','cs_test_orphanfixture');`);
  const refund={...evidence,providerEventId:'evt_orphannative',eventType:'charge.refunded',paymentState:'REFUNDED',paymentIntentId:'pi_orphanfixture',refundedMinor:5000};delete refund.checkoutSessionId;
  const orphan=sql(`set application_name='checkout-orphan-refund';begin;select public.record_checkout_adverse_event('${scope}','${JSON.stringify(refund)}');select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='checkout-orphan-refund' and wait_event='PgSleep'"))==='1');
  const late={...evidence,providerEventId:'evt_orphanpaid',paymentIntentId:'pi_orphanfixture',checkoutSessionId:'cs_test_orphanfixture'};
  const latePaid=sql(`set application_name='checkout-orphan-paid';select public.record_verified_checkout_payment('${secondOrder}','${scope}','${JSON.stringify(late)}');`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='checkout-orphan-paid' and wait_event_type='Lock'"))==='1');
  await Promise.all([orphan,latePaid]);
  assert.equal(last(await sql(`select checkout_hold from orders where id='${secondOrder}'`)),'t');
  await sql(`update orders set status='paid',paid_at=now() where id='${secondOrder}'`);
  await assert.rejects(sql(`select public.claim_order_agreement_job('${secondOrder}')`),/Paid unheld/);

  // Real authenticated assent across independent connections, not the legacy
  // order fixture helper. Same quote is idempotent; a second quote cannot replace
  // an in-flight accepted schedule under the shared buyer/track/license lock.
  const legalBuyer='12121212-1212-4212-8212-121212121212';
  await sql(`insert into auth.users(id,email) values('${legalBuyer}','legalnative@fixture.invalid');insert into user_profiles(id,email,role,full_name) values('${legalBuyer}','legalnative@fixture.invalid','buyer','Legal native fixture');`);
  const q=await newQuote(db,legalBuyer),q2=await newQuote(db,legalBuyer);
  const assent=q=>`set role authenticated;set request.jwt.claim.sub='${legalBuyer}';set request.jwt.claim.role='authenticated';${sqlCall('accept_purchase_quote',[q.id,q.hash,q.schedule.terms.requiredConsents,q.schedule.buyer.representative])};`;
  const assentA=sql(`set application_name='legal-assent-a';begin;${assent(q)}select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='legal-assent-a' and wait_event='PgSleep'"))==='1');
  const assentB=sql(`set application_name='legal-assent-b';${assent(q)}`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='legal-assent-b' and wait_event_type='Lock'"))==='1');
  const values=await Promise.all([assentA,assentB]);const legalOrder=JSON.parse(values[0].split('\n').find(x=>x.startsWith('{'))).id;
  assert.equal(JSON.parse(last(values[1])).id,legalOrder);await assert.rejects(sql(assent(q2)),/original acceptance/);
  await sql(`update orders set stripe_checkout_session_id='cs_test_legalnative' where id='${legalOrder}';`);
  const legalPaid={...evidence,providerEventId:'evt_legalnative',checkoutSessionId:'cs_test_legalnative',paymentIntentId:'pi_legalnative'};
  await sql(`${sqlCall('record_verified_checkout_payment',[legalOrder,scope,legalPaid])};update orders set status='paid',paid_at=now() where id='${legalOrder}';`);
  // A rights writer holds the track lock before issuance. The job request must
  // wait and then observe the changed revision, rather than the old approval.
  const mutate=sql(`set application_name='legal-owner-change';begin;update rights_holders set name='Changed native owner' where track_id='${ids.live}';select pg_sleep(1);commit;`);
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='legal-owner-change' and wait_event='PgSleep'"))==='1');
  const issuance=sql(`set application_name='legal-issue-after-change';select public.claim_order_agreement_job('${legalOrder}');`);const rejected=issuance.then(()=>false,e=>/no longer valid/.test(e.message));
  await wait(async()=>last(await sql("select count(*) from pg_stat_activity where application_name='legal-issue-after-change' and wait_event_type='Lock'"))==='1');
  await mutate;assert.equal(await rejected,true);
  assert.equal(last(await sql(`select count(*) from licensing_private.acceptances where order_id='${legalOrder}'`)),'1');
  assert.equal(last(await sql('select count(*) from generated_licenses')),'0');
 } finally {
  if(running)await command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
  // The path was created by mkdtemp above, never supplied by a user/environment.
  await rm(dir,{recursive:true,force:true});
 }
});
