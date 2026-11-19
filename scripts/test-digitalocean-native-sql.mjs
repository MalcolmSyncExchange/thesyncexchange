// Disposable native PostgreSQL SQL/RPC validation only. No hosted DSN, inherited
// credentials or TCP listener. This does not claim Supautils/provider-owner replay.
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {fixtureBootstrapSql,seedDatabase,ids} from '../tests/helpers/artist-baseline-db.mjs';
const require=createRequire(import.meta.url),{Client}=require('pg');
const bins='/opt/homebrew/opt/postgresql@17/bin/';
const dir=await mkdtemp('/private/tmp/tse-do-pg-'),data=join(dir,'data'),socket=join(dir,'socket');await mkdir(socket,{mode:0o700});
const clean={PATH:'/usr/bin:/bin',LC_ALL:'C'};
const run=(name,args)=>new Promise((resolve,reject)=>{const p=spawn(bins+name,args,{env:clean,stdio:['ignore','pipe','pipe']});let text='';p.stdout.on('data',b=>text+=b);p.stderr.on('data',b=>text+=b);p.on('error',reject);p.on('close',code=>code?reject(Error(text)):resolve(text));});
let started=false,client;
try{await run('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale']);await run('pg_ctl',['-D',data,'-l',join(dir,'server.log'),'-o',`-c listen_addresses= -c unix_socket_directories=${socket} -c shared_buffers=16MB`,'-w','start']);started=true;
 client=new Client({host:socket,port:5432,user:'postgres',database:'postgres',password:undefined});await client.connect();
 const db={exec:sql=>client.query(sql),query:(sql,args)=>client.query(sql,args)};
 await db.exec(fixtureBootstrapSql+'create schema extensions;create extension pgcrypto with schema extensions;');
 for(const name of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 const target=JSON.parse(await readFile(new URL('../docs/audio-reconstruction/production-schema-evidence.json',import.meta.url),'utf8'));
 await db.exec('create role media_broker_production_login nologin');await db.exec(target.functions.find(f=>f.name==='vm_audit_immutable').definition);
 for(const name of ['20261029023407_artist_master_ownership_rows.sql','20261029032813_artist_structured_rights_and_agreements.sql'])await db.exec(await readFile(new URL('../tests/fixtures/production-rights/'+name,import.meta.url),'utf8'));
 await seedDatabase(db);
 await db.exec("update submission_media.capabilities set reservations_enabled=true,worker_enabled=true,foundation_reads_enabled=true;insert into storage.buckets(id,name,public) values('submission-source','submission-source',false),('submission-derived','submission-derived',false),('submission-artwork','submission-artwork',false)");
 const boot='c6204700-2001-4000-8000-000000000001',digest='sha256:37eaf7342bfbcb1917862d0003be87ef96cc22e935765bd2abb11d6fa44f3876';
 await client.query("update submission_media.do_control set enabled=true,boot_id=$1,worker_digest='sha256:37eaf7342bfbcb1917862d0003be87ef96cc22e935765bd2abb11d6fa44f3876',broker_digest=$2,allowed_owner=$3,jobs_after=clock_timestamp(),expires_at=clock_timestamp()+interval '1 hour',carry_forward_usd=1,accounting_reconciled=true",[boot,'sha256:'+'d'.repeat(64),ids.a]);
 await db.exec('set role media_broker_do_login');
 assert.equal((await client.query('select submission_media.do_observe($1,0,0) v',[boot])).rows[0].v.projected_usd,13);
 await assert.rejects(client.query('select * from submission_media.jobs'),e=>e.code==='42501');await assert.rejects(client.query('select submission_media.claim_job()'),e=>e.code==='42501');
 const idle=(await client.query('select submission_media.do_admit(gen_random_uuid(),$1,$2) v',[boot,digest])).rows[0].v;assert.equal(idle.state,'idle');
 await assert.rejects(client.query('select submission_media.do_admit(gen_random_uuid(),gen_random_uuid(),$1)',[digest]),e=>e.code==='42501');
 await db.exec('reset role');
 // Real independent PostgreSQL clients; metadata admission only, no bytes,
 // parser, network upload or hosted capacity claim. Existing quotas remain.
 const session=randomUUID();await client.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,ids.a]);
 const actor=async c=>{await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.session_id',$2,false),set_config('request.jwt.claim.aal','aal2',false)",[ids.a,session]);};
 await db.exec(`create function public.local_load_reserve(s uuid,n integer) returns jsonb language plpgsql as $$ declare rev bigint; begin
 perform pg_advisory_xact_lock(hashtextextended('media-quota:'||auth.uid()::text,0));
 rev:=(public.media_upload_read(s)->>'revision')::bigint;
 return public.media_upload_reserve(s,'stem','Load '||n,'Synthetic.wav',150000000,rev,gen_random_uuid()); end $$; grant execute on function public.local_load_reserve(uuid,integer) to authenticated;`);
 const clients=[];
 try{
  for(let i=0;i<10;i++){const c=new Client({host:socket,port:5432,user:'postgres',database:'postgres'});await c.connect();await actor(c);clients.push(c);}
  for(const requests of [1,10,50,100,1000]){
   await actor(client);const submission=(await client.query('select public.media_create_submission($1,null) v',[randomUUID()])).rows[0].v.submission_id;await client.query('reset role');
   let index=0,accepted=0,rejected=0,conflicts=0;const times=[],start=performance.now();
   await Promise.all(clients.map(async c=>{while(index<requests){const n=index++,at=performance.now();try{await c.query('select public.local_load_reserve($1,$2)',[submission,n]);accepted++;}catch(e){assert.ok(['40001','54000'].includes(e.code),e.message);if(e.code==='54000')assert.match(e.message,/UPLOAD_TRANSFERS_FULL|UPLOAD_DAILY_QUOTA/);else conflicts++;rejected++;}times.push(performance.now()-at);}}));
   assert.ok(accepted>=1&&accepted<=Math.min(4,requests));assert.equal(accepted+rejected,requests);times.sort((a,b)=>a-b);
   console.log(JSON.stringify({nativeSqlAdmission:true,requests,clients:clients.length,accepted,quotaRejected:rejected-conflicts,optimisticConflicts:conflicts,elapsedMs:performance.now()-start,p95Ms:times[Math.floor(times.length*.95)],actualUploadOrDecoderLoad:false}));
   await client.query("update submission_media.upload_files set retired_at=clock_timestamp(),retired_reason='removed' where submission_id=$1",[submission]);
  }
  await db.exec('drop function public.local_load_reserve(uuid,integer)');
  await db.exec('set role media_broker_do_login');const health=(await client.query('select submission_media.do_health($1) v',[boot])).rows[0].v;assert.equal(health.queue_depth,0);await assert.rejects(client.query('select submission_media.do_health(gen_random_uuid())'),e=>e.code==='42501');await db.exec('reset role');
  await actor(client);const testSubmission=(await client.query('select public.media_create_submission($1,null) v',[randomUUID()])).rows[0].v.submission_id;
  const revision=(await client.query('select public.media_upload_read($1) v',[testSubmission])).rows[0].v.revision;
  const reserved=(await client.query("select public.media_upload_reserve($1,'master','Master','Synthetic.wav',100,$2,$3,null) v",[testSubmission,revision,randomUUID()])).rows[0].v;
  await client.query('reset role');await client.query("insert into storage.objects(bucket_id,name,owner_id,version,metadata) select bucket,object_path,$2,$3,jsonb_build_object('size',100,'mimetype','application/octet-stream') from submission_media.assets where id=$1",[reserved.asset_id,ids.a,randomUUID()]);
  await actor(client);await client.query('select public.media_upload_confirm($1,$2)',[testSubmission,reserved.asset_id]);await client.query('reset role');
  for(const c of clients)await c.query('set role media_broker_do_login');
  const outcomes=await Promise.allSettled(clients.slice(0,8).map((c,i)=>c.query('select submission_media.do_admit($1,$2,$3) v',[randomUUID(),i<2?boot:randomUUID(),digest])));
  const accepted=outcomes.filter(x=>x.status==='fulfilled');assert.equal(accepted.length,2);assert.equal(new Set(accepted.map(x=>x.value.rows[0].v.run_id)).size,1);assert.ok(outcomes.filter(x=>x.status==='rejected').every(x=>x.reason.code==='42501'));
  const runId=accepted[0].value.rows[0].v.run_id;
  assert.equal(Number((await client.query("select count(*) n from submission_media.do_runs where state='issued'")).rows[0].n),1);
  const claims=await Promise.all(clients.slice(0,2).map(c=>c.query('select submission_media.do_claim($1,$2) v',[runId,boot])));assert.deepEqual(claims[0].rows[0].v,claims[1].rows[0].v);
  const lease=claims[0].rows[0].v;
  await client.query("update submission_media.jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[lease.job_id]);
  await assert.rejects(clients[0].query('select submission_media.do_resolve($1,$2,$3,$4,$5)',[runId,boot,lease.job_id,lease.lease_epoch,lease.lease_token]));
  await clients[0].query('select submission_media.do_settle($1,$2)',[runId,boot]);
  console.log(JSON.stringify({independentDispatchers:8,verifiedIdentitySessions:2,wrongBootDenied:6,issuedPermits:1,duplicateLeaseReplay:'same fenced lease',expiredLeasePublication:'DENIED',actualParserExecutions:0,additionalProductionWorkersAuthorized:0}));
 }finally{await Promise.all(clients.map(c=>c.end()));}
 const recipient=await readFile(new URL('../tests/fixtures/do-credential-envelope-public.asc',import.meta.url),'utf8');
 await assert.rejects(client.query('select submission_media.do_bootstrap_credentials($1)',['wrong public recipient']),e=>e.code==='42501');
 await client.query('update submission_media.do_control set enabled=false');
 const encrypted=(await client.query('select submission_media.do_bootstrap_credentials($1) value',[recipient])).rows[0].value;
 assert.ok(encrypted.length>300);assert.equal((await client.query("select rolcanlogin from pg_roles where rolname='media_broker_do_login'")).rows[0].rolcanlogin,true);
 await assert.rejects(client.query('select submission_media.do_bootstrap_credentials($1)',[recipient]),e=>e.code==='42501');
 console.log(JSON.stringify({result:'PASS',platform:process.platform,architecture:process.arch,postgres:(await run('postgres',['--version'])).trim(),tcpListener:false,productionConnections:false,scope:'new admission SQL + actual restricted PostgreSQL role denial; provider ownership and hosted processing not claimed'}));
}finally{await client?.end();if(started)await run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);await rm(dir,{recursive:true,force:true});}
