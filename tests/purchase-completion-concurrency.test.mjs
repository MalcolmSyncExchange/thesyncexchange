// Explicit local test command. No hosted URL, credentials, ports, volume mounts
// or existing containers are accepted. Uses only an already cached postgres:17.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readdirSync} from 'node:fs';
import {fixtureBootstrapSql,seedDatabase,ids,root,source} from './helpers/artist-baseline-db.mjs';
function docker(args,input='') {
 return new Promise((resolve,reject)=>{
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err='';
  child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);
  child.on('close',code=>code===0?resolve(out.trim()):reject(Error(`Local Docker command failed (${code}): ${err}`)));
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
test('independent PostgreSQL connections serialize held-payment duplicates into one reconciliation', {timeout:60000},async()=>{
 const name=`tse-held-payment-${randomUUID()}`;let owned=false;
 const sql=text=>docker(['exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],text);
 const waitFor=async predicate=>{for(let i=0;i<80;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,50));}throw Error('Local concurrency barrier timed out');};
 try {
  await docker(['run','--pull','never','--rm','--detach','--network','none','--name',name,'--tmpfs','/var/lib/postgresql/data:rw',
   '-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17']);owned=true;
  // The image's initialization server accepts Unix sockets before restarting;
  // TCP loopback readiness identifies the final server (no host port is exposed).
  await waitFor(async()=>{try{await docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);return true;}catch{return false;}});
  const seed=[];await seedDatabase({exec:async statement=>seed.push(statement+';')});
  const migrations=readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort().map(f=>source(`supabase/migrations/${f}`));
  await sql([fixtureBootstrapSql,...migrations,...seed].join('\n'));
  const contract=`(select id from public.order_delivery_contracts where order_id='${ids.order}')`;
  await sql(`select set_config('request.jwt.claim.role','service_role',false);
   update commerce_private.capabilities set foundation_enabled=true,receipt_generation_enabled=true,transaction_projection_enabled=true;
   insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents,currency) values('${ids.order}','${ids.buyer}','${ids.live}','${ids.license}',5000,'USD');
   select commerce_private.freeze_contract('${ids.order}','production','acct_fixture');
   update orders set stripe_checkout_session_id='cs_test_fixture',stripe_payment_intent_id='pi_fixture' where id='${ids.order}';
   select commerce_private.security_hold(${contract},'review_required');`);
  const event=id=>`select commerce_private.record_payment_event(${contract},'acct_fixture','${id}','cs_test_fixture','pi_fixture',
   'checkout.session.completed','PAID',5000,0,'USD','${'a'.repeat(64)}','2026-10-02T00:00:00Z');`;
  const first=sql(`set application_name='held-first';begin;set local role service_role;${event('evt_concurrent')}select pg_sleep(2);commit;`);
  await waitFor(async()=>await sql("select count(*) from pg_stat_activity where application_name='held-first' and wait_event='PgSleep'")==='1');
  const second=sql(`set application_name='held-second';begin;set local role service_role;${event('evt_concurrent')}commit;`);
  await waitFor(async()=>await sql("select count(*) from pg_stat_activity where application_name='held-second' and wait_event_type='Lock'")==='1');
  const [a,b]=await Promise.all([first,second]);assert.equal(a.trim(),b.trim());
  await sql(`set role service_role;${event('evt_anotherdelivery')}`);
  const result=JSON.parse(await sql(`select json_build_object('state',s.state,'linked',s.payment_received_event_id is not null,
   'history',(select count(*) from commerce_private.state_history where reason_code='payment_received_while_held'),
   'jobs',(select count(*) from commerce_private.fulfillment_jobs),
   'assetJobs',(select count(*) from commerce_private.fulfillment_jobs where task in ('asset_preparation','entitlement_activation')),
   'events',(select count(*) from commerce_private.payment_events),
   'commercial',(select bool_or(commercial_rights_granted) from order_delivery_contracts)) from commerce_private.order_states s;`));
  assert.deepEqual(result,{state:'SECURITY_HOLD',linked:true,history:1,jobs:2,assetJobs:0,events:2,commercial:false});
 } finally {if(owned)await docker(['rm','--force',name]);}
});
