// Fresh native PostgreSQL 17, no hosted DSN, real crypto and independent sessions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fixtureBootstrapSql,nativeCryptoBootstrapSql,seedDatabase,root,source,ids,quote,asActor} from './helpers/artist-baseline-db.mjs';
import {providerFixture} from './helpers/financial-provider-fixture.mjs';
import {beginDownload,finishDownload} from './helpers/secure-delivery-fixture.mjs';
import {randomUUID} from 'node:crypto';
import {readProviderEvidence} from '../services/finance/provider-reader.mjs';
import {deliveryHash} from './helpers/secure-delivery-fixture.mjs';
import {sqlCall,call,claimFixtureAgreement,incorporatePurchase} from './helpers/purchase-legal-fixture.mjs';
const command=(bin,args,input='')=>new Promise((resolve,reject)=>{
 const c=spawn(bin,args,{env:{PATH:process.env.PATH,LC_ALL:'C'},stdio:['pipe','pipe','pipe']});let out='',err='';
 c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',reject);c.on('close',code=>code===0?resolve(out.trim()):reject(Error(`${bin}: ${err}`)));c.stdin.on('error',()=>{});c.stdin.end(input);
});
test('native crash restart preserves pending checkout, fenced posting, licenses, delivery, adverse events and backup evidence',{timeout:150000},async()=>{
 assert.match(await command('postgres',['--version']),/PostgreSQL\) 17\./);
 const dir=await mkdtemp('/private/tmp/tse-finance-worker-pg-'),data=join(dir,'data'),socket=join(dir,'socket');let running=false,login='postgres';
 const sql=text=>command('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-U',login,'-d','postgres'],`set client_min_messages=warning;set request.jwt.claim.role='service_role';${text}`);
 const last=s=>s.trim().split('\n').at(-1);
 try{
  await mkdir(socket,{mode:0o700});await command('initdb',['-D',data,'-U','pk09r_fixture_admin','--auth=trust','--encoding=UTF8','--no-locale']);
  await command('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-c listen_addresses= -c unix_socket_directories=${socket} -c max_connections=15 -c shared_buffers=16MB`,'-w','start']);running=true;
  login='pk09r_fixture_admin';await sql('create role postgres login superuser');login='postgres';const seed=[];await seedDatabase({exec:async s=>seed.push(s+';')});
  const files=(await readdir(new URL('supabase/migrations/',root))).filter(f=>f.endsWith('.sql')).sort();
  await sql([fixtureBootstrapSql,nativeCryptoBootstrapSql,...files.filter(f=>f<'20261022213225_financial_ingestion_recovery.sql').map(f=>source('supabase/migrations/'+f)),...seed].join('\n'));
  login='pk09r_fixture_admin';await sql('alter schema public owner to postgres;alter role postgres nosuperuser');login='postgres';for(const file of files.filter(f=>f>='20261022213225_financial_ingestion_recovery.sql'))await sql(source('supabase/migrations/'+file));login='pk09r_fixture_admin';
  assert.equal(last(await sql("select rolsuper from pg_roles where rolname='postgres'")),'f');assert.equal(last(await sql("select current_setting('listen_addresses')=''")),'t');
  let actor='';const db={exec:async text=>{if(text.startsWith('set role ')){actor=text+';';return;}if(text.startsWith('reset role;')){actor='';return;}return sql(actor+text);},query:async text=>({rows:(await sql(actor+`select row_to_json(r) from (${text}) r;`)).split('\n').filter(x=>x.startsWith('{')).map(JSON.parse)})};

  const f=await providerFixture(db,{paid:false});let restarts=0;
  const restart=async()=>{await command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);running=false;await command('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-c listen_addresses= -c unix_socket_directories=${socket} -c max_connections=15 -c shared_buffers=16MB`,'-w','start']);running=true;assert.equal(last(await sql("select current_setting('listen_addresses')=''")),'t');restarts++;};
  assert.equal(last(await sql('select count(*) from generated_licenses')),'0');assert.equal((await beginDownload(f.c)).allowed,false);
  const accepted=await sql(sqlCall('read_accepted_purchase',[f.c.order])+';');assert.match(accepted,/SYNTHETIC-TERMS-1/);
  // Pending checkout/legal/source evidence remains authoritative across WAL recovery.
  await restart();assert.equal(await sql(sqlCall('read_accepted_purchase',[f.c.order])+';'),accepted);
  assert.equal((await beginDownload(f.c)).allowed,false);
  f.state.charge.paid=true;f.state.charge.balance_transaction='txn_charge';
  await f.payment('evt_restartPaid','checkout.session.completed','PAID');
  const path=await claimFixtureAgreement(db,f.c.order);
  await restart();assert.equal(last(await sql('select count(*) from generated_licenses')),'0');
  const snapshot=await incorporatePurchase(db,f.c.order,{payment:{paymentMode:'test',commercialRightsGranted:false},license:{pricePaidCents:5000,currency:'USD'},pdfSha256:deliveryHash});
  await db.exec(`insert into generated_licenses(order_id,buyer_id,track_id,license_type_id,agreement_number,status,pdf_storage_path,pdf_content_type,pdf_size_bytes,terms_snapshot_json,generated_at)
   values('${f.c.order}','${ids.buyer}','${ids.live}','${ids.license}','SYNTHETIC-RESTART','generated',${quote(path)},'application/pdf',100,${quote(JSON.stringify(snapshot))},now())`);
  await restart();
  const activation=(await db.query("select * from public.claim_purchase_completion_job('entitlement_activation')")).rows[0];assert.ok(activation);
  await call(db,'finish_purchase_completion_job',[activation.id,activation.lease_token,true,false,null]);
  assert.equal((await beginDownload(f.c)).allowed,true);
  const e=f.event('evt_restartEvidence');e.data.object.payment_status='paid';await f.capture(e);await restart();
  const first=await f.claim();assert.ok(first);const proof=await readProviderEvidence(first,f.stripe);
  await restart();assert.equal(last(await sql('select count(*) from finance_private.journals')),'0');
  // Accelerated fixture clock, never a production operation.
  await db.exec("update finance_private.provider_jobs set lease_until=clock_timestamp()-interval '1 second'");
  const second=await f.claim();assert.notEqual(first.token,second.token);
  assert.equal((await f.complete(first.id,first.token,proof)).state,'stale');
  assert.equal((await f.complete(second.id,second.token,proof)).state,'posted');
  await f.capture(e);assert.equal((await f.run()).claimed,0);
  assert.equal(last(await sql('select count(*) from generated_licenses')),'1');
  assert.equal(last(await sql('select count(*) from finance_private.journals')),'2');
  // Interrupted authorization remains one-use and every byte release is rechecked.
  const download=await beginDownload(f.c),ticketHash='c'.repeat(64);
  await call(db,'create_asset_delivery_ticket',[ids.buyer,download.authorizationId,ticketHash]);await restart();
  assert.equal((await call(db,'redeem_asset_delivery_ticket',[ticketHash])).allowed,true);
  assert.deepEqual(await call(db,'redeem_asset_delivery_ticket',[ticketHash]),{allowed:false});
  assert.equal(await finishDownload(f.c,download),true);assert.equal(await finishDownload(f.c,download),false);
  // Storage outage is recorded without releasing an entitlement or bytes.
  const outage=await beginDownload(f.c);assert.equal(await finishDownload(f.c,outage,'storage_failed'),false);
  assert.equal(last(await sql(`select outcome from commerce_private.delivery_outcomes where authorization_id='${outage.authorizationId}'`)),'storage_failed');
  // Real wall-clock expiry: no disabled trigger, row rewrite or fake clock.
  const expiring=await beginDownload(f.c),expiredHash='d'.repeat(64);
  await call(db,'create_asset_delivery_ticket',[ids.buyer,expiring.authorizationId,expiredHash]);
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(expiring.expiresAt)-Date.now()+50)));
  assert.deepEqual(await call(db,'redeem_asset_delivery_ticket',[expiredHash]),{allowed:false});
  assert.equal(await finishDownload(f.c,expiring),false);
  assert.equal(last(await sql(`select outcome from commerce_private.delivery_outcomes where authorization_id='${expiring.authorizationId}'`)),'expired');
  assert.equal((await beginDownload(f.c)).allowed,true);
  // Dead-letter escalation is a durable SEC alert, not an external paging claim.
  const retryEvent=f.event('evt_restartDead');retryEvent.data.object.payment_status='paid';await f.capture(retryEvent);f.state.events.delete(retryEvent.id);
  for(let i=1;i<=8;i++){const r=await f.run();assert.equal(i===8?r.dead:r.retried,1);if(i<8)await f.due();}
  await restart();const ops=await f.operations(),dead=ops.jobs.find(j=>j.state==='dead');assert.ok(dead);assert.ok(ops.alerts.some(a=>a.job_id===dead.id&&a.code==='provider_or_database_unavailable'));
  assert.equal(ops.externalAlertDelivery,'not_configured');
  f.state.events.set(retryEvent.id,retryEvent);
  await asActor(db,ids.admin,()=>call(db,'act_on_financial_provider_job',[dead.id,randomUUID(),'retry','SYNTHETIC restart drill','synthetic-local-evidence']));
  assert.equal((await f.run()).posted,1);assert.equal(last(await sql('select count(*) from finance_private.journals')),'2');
  await f.refund(1000);await restart();assert.equal((await f.run()).posted,1);assert.equal((await beginDownload(f.c)).allowed,false);
  const dispute={id:'dp_restart',livemode:false,charge:'ch_fixture',payment_intent:'pi_fixture',amount:5000,currency:'usd',status:'lost',balance_transactions:['txn_restartDispute']};
  f.state.disputes=[dispute];f.state.balances.set('txn_restartDispute',{id:'txn_restartDispute',source:dispute.id,type:'adjustment',amount:-5000,fee:150,net:-5150,currency:'usd',created:1700000002,exchange_rate:null});
  await f.payment('evt_restartDispute','charge.dispute.created','DISPUTED');await f.capture(f.event('evt_restartDispute','charge.dispute.closed',dispute));await restart();assert.equal((await f.run()).posted,1);
  assert.equal((await beginDownload(f.c)).allowed,false);
  assert.equal(last(await sql('select count(*) from(select journal_id from finance_private.lines group by journal_id having sum(signed_minor)<>0) q')),'0');
  // Restore a real native backup into a different disposable database. Preserve
  // original tables, functions, triggers, grants and immutable evidence.
  const fingerprintSql="select jsonb_build_object('orders',(select jsonb_agg(to_jsonb(t) order by id) from orders t),'acceptances',(select jsonb_agg(to_jsonb(t) order by order_id) from licensing_private.acceptances t),'licenses',(select jsonb_agg(to_jsonb(t) order by id) from generated_licenses t),'entitlements',(select jsonb_agg(to_jsonb(t) order by id) from order_asset_entitlements t),'events',(select jsonb_agg(to_jsonb(t) order by id) from finance_private.provider_events t),'journals',(select jsonb_agg(to_jsonb(t) order by id) from finance_private.journals t),'lines',(select jsonb_agg(to_jsonb(t) order by journal_id,account) from finance_private.lines t))";
  const original=await sql(fingerprintSql),backup=join(dir,'synthetic.backup');
  await command('pg_dump',['-h',socket,'-U',login,'-d','postgres','-Fc','-f',backup]);
  await command('createdb',['-h',socket,'-U',login,'restored']);await command('pg_restore',['-h',socket,'-U',login,'-d','restored','--exit-on-error',backup]);
  const restored=await command('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-U',login,'-d','restored'],fingerprintSql+';');assert.equal(restored,original);
  await assert.rejects(command('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-U','postgres','-d','restored'],"delete from finance_private.provider_events;"),/immutable/);
  console.log(JSON.stringify({scenario:'RC real crash restart and backup restore',migrations:files.length,restarts,network:'private Unix socket only',pendingUnpaidDelivery:'denied',licenses:1,staleWorker:'fenced',duplicateFinancialEffect:0,storageOutage:'audited_no_bytes',ticketExpiry:'real_wall_clock_denied_audited',deadLetter:'durable_SEC_alert_operator_retry',externalPaging:'Not Run',refundAndDisputeDelivery:'denied',unbalancedJournals:0,backupRestore:'exact transaction evidence preserved',syntheticOnly:true}));

 }finally{if(running)await command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);await rm(dir,{recursive:true,force:true});}
});
