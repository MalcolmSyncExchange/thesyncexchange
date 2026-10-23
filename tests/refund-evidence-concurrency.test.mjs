// Fresh native PostgreSQL 17, no hosted DSN, real crypto and independent sessions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fixtureBootstrapSql,nativeCryptoBootstrapSql,seedDatabase,root,source} from './helpers/artist-baseline-db.mjs';
import {providerFixture} from './helpers/financial-provider-fixture.mjs';
import {beginDownload,finishDownload} from './helpers/secure-delivery-fixture.mjs';
import {sqlCall} from './helpers/purchase-legal-fixture.mjs';
const command=(bin,args,input='')=>new Promise((resolve,reject)=>{
 const c=spawn(bin,args,{env:{PATH:process.env.PATH,LC_ALL:'C'},stdio:['pipe','pipe','pipe']});let out='',err='';
 c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',reject);c.on('close',code=>code===0?resolve(out.trim()):reject(Error(`${bin}: ${err}`)));c.stdin.on('error',()=>{});c.stdin.end(input);
});
test('native authenticated API refund holds survive rollback and preserve immutable purchase through canonical recovery',{timeout:90000},async()=>{
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

  const f=await providerFixture(db);await f.capture(f.event());assert.equal((await f.run()).posted,1);
  const original=await sql(sqlCall('read_accepted_purchase',[f.c.order])+';');
  const inflight=await beginDownload(f.c);assert.equal(inflight.allowed,true);
  await f.capture(f.event('evt_nativeApiOnly'));
  f.state.charge.amount_refunded=1000;
  f.state.refunds=[{id:'re_nativeReview',charge:'ch_fixture',amount:1000,currency:'usd',status:'succeeded',balance_transaction:'txn_nativeReview'}];
  f.state.balances.set('txn_nativeReview',{id:'txn_nativeReview',source:'re_nativeReview',type:'refund',amount:-1000,fee:0,net:-1000,currency:'usd',created:1700000001,exchange_rate:null});
  assert.equal((await f.run()).retried,1);
  assert.equal((await beginDownload(f.c)).allowed,false);assert.equal(await finishDownload(f.c,inflight),false);
  assert.equal(last(await sql('select coalesce(max(refunded_minor),0) from commerce_private.payment_events')),'0');
  assert.equal(last(await sql("select count(*) from finance_private.provider_alerts where code='authenticated_adverse_provider_evidence'")),'1');
  assert.equal(last(await sql("select count(*) from finance_private.journals")),'2');
  assert.equal(await sql(sqlCall('read_accepted_purchase',[f.c.order])+';'),original);
  assert.equal(last(await sql("select has_function_privilege('authenticated','finance_private.adverse_provider_summary(text,jsonb)','execute')")),'f');
  await assert.rejects(sql("set role service_role;select detail from finance_private.provider_alerts"),/permission/);
  await assert.rejects(sql("set role postgres;delete from finance_private.provider_alerts"),/immutable/);
  await f.payment('evt_nativeCanonical','charge.refunded','PARTIALLY_REFUNDED',1000);await f.due();assert.equal((await f.run()).posted,1);
  assert.equal(last(await sql("select finance_private.balance('"+f.c.order+"','clearing')")),'3850');
  assert.equal((await beginDownload(f.c)).allowed,false);
  assert.equal(last(await sql('select count(*) from(select journal_id from finance_private.lines group by journal_id having sum(signed_minor)<>0) q')),'0');
  const d={id:'dp_nativeHighFee',livemode:false,charge:'ch_fixture',payment_intent:'pi_fixture',amount:5000,currency:'usd',status:'lost',balance_transactions:['txn_nativeHighFee']};
  f.state.disputes=[d];f.state.balances.set('txn_nativeHighFee',{id:'txn_nativeHighFee',source:d.id,type:'adjustment',amount:-5000,fee:6000,net:-11000,currency:'usd',created:1700000002,exchange_rate:null});
  await f.payment('evt_nativeDispute','charge.dispute.created','DISPUTED');await f.capture(f.event('evt_nativeDispute','charge.dispute.closed',d));assert.equal((await f.run()).posted,1);
  for(const [account,expected] of [['clearing',-7150],['processor_fees',6150],['chargeback_expense',1000],['payable:master',0],['payable:publishing',0],['platform_revenue',0],['dispute_receivable',0]])assert.equal(last(await sql("select finance_private.balance('"+f.c.order+"','"+account+"')")),String(expected),account);
  assert.equal((await beginDownload(f.c)).allowed,false);
  assert.equal(last(await sql('select count(*) from(select journal_id from finance_private.lines group by journal_id having sum(signed_minor)<>0) q')),'0');
  console.log(JSON.stringify({scenario:'IR native adverse-provider and high-fee recovery',ownerSuperuser:false,network:'private Unix socket only',canonicalRefundInitially:0,adverseProofRetained:true,newAndInflightDelivery:'denied',canonicalRecoveryPosted:true,clearingAfterRefund:3850,providerDisputeFee:6000,finalClearing:-7150,overlapExpense:1000,unbalancedJournals:0}));
 }finally{if(running)await command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);await rm(dir,{recursive:true,force:true});}
});
