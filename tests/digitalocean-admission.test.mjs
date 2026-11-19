import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {uploadsFixture,create,reserve,observed,ids,artist} from './helpers/music-uploads-fixture.mjs';
const boot='c6204700-2001-4000-8000-000000000001',digest='sha256:37eaf7342bfbcb1917862d0003be87ef96cc22e935765bd2abb11d6fa44f3876';
const fresh=async fn=>{const db=await uploadsFixture();try{await fn(db);}finally{await db.close();}};
const rpc=async(db,name,args=[])=>(await db.query(`select submission_media.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args)).rows[0].v;
async function enabled(db){await db.query("update submission_media.do_control set enabled=true,boot_id=$1,worker_digest=$4,broker_digest=$2,allowed_owner=$3,jobs_after=clock_timestamp(),expires_at=clock_timestamp()+interval '1 hour',carry_forward_usd=.10,accounting_reconciled=true",[boot,'sha256:'+'d'.repeat(64),ids.a,digest]);await rpc(db,'do_observe',[boot,0,0]);}
async function job(db){const s=await create(db),r=await reserve(db,s);await observed(db,s,r.asset_id);return {s,asset:r.asset_id};}
async function admitted(db){const value=await rpc(db,'do_admit',[randomUUID(),boot,digest]);assert.equal(value.state,'issued');return value;}
test('DO migration is dormant and restricted role has wrappers only, no generic claim, IAM-like roles or private tables',()=>fresh(async db=>{
 const c=(await db.query('select enabled,accounting_reconciled,carry_forward_usd from submission_media.do_control')).rows[0];assert.deepEqual(c,{enabled:false,accounting_reconciled:false,carry_forward_usd:null});
 const role=(await db.query("select rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreaterole from pg_roles where rolname='media_broker_do_login'")).rows[0];assert.ok(Object.values(role).every(v=>v===false));
 for(const f of ['claim_job()','create_execution_permit(uuid,uuid,text,text,text,integer,uuid,text)','do_require(uuid)','do_run(uuid,uuid,boolean)'])assert.equal((await db.query("select has_function_privilege('media_broker_do_login',$1,'EXECUTE') v",['submission_media.'+f])).rows[0].v,false);
 for(const table of ['do_control','do_runs','do_audit','do_transfer_claims','jobs','execution_permits'])assert.equal((await db.query("select has_table_privilege('media_broker_do_login',$1,'SELECT,INSERT,UPDATE,DELETE') v",['submission_media.'+table])).rows[0].v,false);
 assert.equal((await db.query("select has_function_privilege('media_broker_do_login','submission_media.do_admit(uuid,uuid,text)','EXECUTE') v")).rows[0].v,true);
}));
test('fresh DO admission excludes historical jobs and preserves their attempt zero',()=>fresh(async db=>{
 const old=await job(db);await enabled(db);
 assert.equal((await rpc(db,'do_admit',[randomUUID(),boot,digest])).state,'idle');
 const next=await job(db);const run=await admitted(db);assert.equal((await db.query('select asset_id from submission_media.jobs where id=$1',[run.job_id])).rows[0].asset_id,next.asset);
 assert.deepEqual((await db.query('select state,attempt from submission_media.jobs where submission_id=$1',[old.s])).rows[0],{state:'queued',attempt:0});
 const name=(await db.query('select execution_name,dispatcher_subject from submission_media.execution_permits')).rows[0];assert.equal(name.dispatcher_subject,'620470021');assert.ok(name.execution_name.startsWith('digitalocean/nyc3/droplets/620470021/boots/'+boot));
}));
test('wrong boot, image, stale accounting, absent reconciliation and expired scope fail closed',()=>fresh(async db=>{
 await enabled(db);await job(db);
 for(const args of [[randomUUID(),randomUUID(),digest],[randomUUID(),boot,'sha256:'+'a'.repeat(64)]])await assert.rejects(rpc(db,'do_admit',args));
 for(const mutation of ["observed_at=clock_timestamp()-interval '91 seconds'","expires_at=clock_timestamp()-interval '1 second'","month='2000-01',monthly_ceiling_usd=15"]){await db.exec('update submission_media.do_control set '+mutation);await assert.rejects(rpc(db,'do_admit',[randomUUID(),boot,digest]));await db.exec("update submission_media.do_control set observed_at=clock_timestamp(),expires_at=clock_timestamp()+interval '1 hour',month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM'),monthly_ceiling_usd=20");}
 await db.exec('update submission_media.do_control set enabled=false,accounting_reconciled=false');await assert.rejects(rpc(db,'do_admit',[randomUUID(),boot,digest]));
}));
test('global live permit and one issued DO run prevent duplicate processing and fenced leases reject impostors',()=>fresh(async db=>{
 await enabled(db);await job(db);const run=await admitted(db);const duplicate=await rpc(db,'do_admit',[randomUUID(),boot,digest]);assert.equal(duplicate.run_id,run.run_id);assert.equal(duplicate.recovery,true);
 const claimed=await rpc(db,'do_claim',[run.run_id,boot]);assert.equal((await rpc(db,'do_claim',[run.run_id,boot])).lease_token,claimed.lease_token);
 for(const [id,epoch,token] of [[randomUUID(),claimed.lease_epoch,claimed.lease_token],[claimed.job_id,claimed.lease_epoch+1,claimed.lease_token],[claimed.job_id,claimed.lease_epoch,randomUUID()]])await assert.rejects(rpc(db,'do_resolve',[run.run_id,boot,id,epoch,token]));
 assert.equal((await db.query('select attempt from submission_media.jobs where id=$1',[run.job_id])).rows[0].attempt,1);
}));
test('consumed transfer claims reject replay, wrong tuple and arbitrary transfer amounts',()=>fresh(async db=>{
 await enabled(db);await job(db);const run=await admitted(db),l=await rpc(db,'do_claim',[run.run_id,boot]),nonce=randomUUID();
 const args=[run.run_id,boot,l.job_id,l.lease_epoch,l.lease_token,nonce,'input',null,null,false];
 const call=async a=>(await db.query('select public.media_do_transfer('+a.map((_,i)=>'$'+(i+1)).join(',')+') v',a)).rows[0].v;
 const first=await call(args);assert.equal(first.bucket,'submission-source');await assert.rejects(call(args),e=>e.code==='23505');assert.deepEqual(await call([...args.slice(0,-1),true]),first);
 await assert.rejects(call([...args.slice(0,5),randomUUID(),'input',10,null,false]));await assert.rejects(call([...args.slice(0,5),randomUUID(),'output',10,'a'.repeat(64),false]));
 await rpc(db,'do_charge',[run.run_id,boot,'input',100]);await rpc(db,'do_charge',[run.run_id,boot,'input',100]);await assert.rejects(rpc(db,'do_charge',[run.run_id,boot,'input',100]));
}));
test('budget reserves full liabilities after settlement; rollback keeps history and disables future admission',()=>fresh(async db=>{
 await enabled(db);await job(db);const run=await admitted(db);await rpc(db,'do_claim',[run.run_id,boot]);await rpc(db,'do_settle',[run.run_id,boot]);
 const first=(await db.query('select state,reserved_usd from submission_media.do_runs')).rows[0];assert.equal(first.state,'failed');assert.equal(Number(first.reserved_usd),.10);
 await db.exec('update submission_media.do_control set carry_forward_usd=7.99');assert.equal((await rpc(db,'do_admit',[randomUUID(),boot,digest])).state,'budget_limit');
 await db.exec('update submission_media.do_control set enabled=false');await assert.rejects(rpc(db,'do_admit',[randomUUID(),boot,digest]));
 assert.equal((await db.query('select count(*)::int n from submission_media.do_runs')).rows[0].n,1);
 await assert.rejects(db.exec('delete from submission_media.do_runs'));await assert.rejects(db.exec('delete from submission_media.do_audit'));
}));
test('counter regression, different boot and generic production identities cannot reset DO accounting',()=>fresh(async db=>{
 await enabled(db);await rpc(db,'do_observe',[boot,100,10]);for(const args of [[boot,99,10],[boot,100,9],[randomUUID(),100,10],[boot,-1,0]])await assert.rejects(rpc(db,'do_observe',args));
 await job(db);const run=await admitted(db);await assert.rejects(db.query("update submission_media.execution_permits set dispatcher_subject='281127460402' where correlation_id=$1",[run.run_id]));
 const c=(await db.query('select traffic_bytes,log_bytes,historical_google_liabilities from submission_media.do_control')).rows[0];assert.equal(c.traffic_bytes,100);assert.equal(c.historical_google_liabilities,'UNKNOWN_PRESERVED_NOT_OFFSET');
}));

test('target disable rollback revokes admission while preserving ledger and historical permit identities',()=>fresh(async db=>{
 await enabled(db);await job(db);const run=await admitted(db);const before=(await db.query('select * from submission_media.execution_permits')).rows;
 await db.exec(await readFile(new URL('../docs/audio-reconstruction/digitalocean-disable.sql',import.meta.url),'utf8'));
 assert.equal((await db.query('select enabled from submission_media.do_control')).rows[0].enabled,false);assert.deepEqual((await db.query('select * from submission_media.execution_permits')).rows,before);
 assert.equal((await db.query('select count(*)::int n from submission_media.do_runs where id=$1',[run.run_id])).rows[0].n,1);
 assert.equal((await db.query("select has_function_privilege('media_broker_do_login','submission_media.do_admit(uuid,uuid,text)','EXECUTE') v")).rows[0].v,false);
}));
test('root launcher authorization is a live exact-run view and closes after claim or revocation',()=>fresh(async db=>{
 await enabled(db);await job(db);const run=await admitted(db);const status=async(id=run.run_id,b=boot)=>(await db.query('select public.media_do_launch_status($1,$2) v',[id,b])).rows[0].v;
 const ok=await status();assert.equal(ok.authorized,true);assert.equal(ok.worker_digest,digest);await assert.rejects(status(randomUUID()));await assert.rejects(status(run.run_id,randomUUID()));
 await rpc(db,'do_claim',[run.run_id,boot]);await assert.rejects(status());await db.exec('update submission_media.do_control set enabled=false');await assert.rejects(status());
}));
test('revoked live permit closes dispatcher authority immediately without dropping the recovery record',()=>fresh(async db=>{
 await enabled(db);await job(db);const run=await admitted(db);assert.equal((await rpc(db,'do_scope_status',[run.run_id,boot])).authorized,true);
 await db.query("update submission_media.execution_permits set state='expired' where correlation_id=$1",[run.run_id]);const closed=await rpc(db,'do_scope_status',[run.run_id,boot]);assert.equal(closed.authorized,false);assert.equal(closed.state,'issued');
}));

test('retired master validation cannot block or consume admission for its replacement',()=>fresh(async db=>{await enabled(db);const old=await job(db);const replacement=await reserve(db,old.s,'master',{bytes:100000000,replaces:old.asset});await observed(db,old.s,replacement.asset_id,{bytes:100000000});const run=await admitted(db);assert.equal((await db.query('select asset_id from submission_media.jobs where id=$1',[run.job_id])).rows[0].asset_id,replacement.asset_id);const stale=(await db.query('select state,attempt from submission_media.jobs where asset_id=$1',[old.asset])).rows[0];assert.deepEqual(stale,{state:'queued',attempt:0});}));

test('November approval changes only the ceiling, preserves settled liabilities, and cannot authorize a higher or future ceiling',()=>fresh(async db=>{
 await enabled(db);await job(db);const run=await admitted(db);await rpc(db,'do_claim',[run.run_id,boot]);await rpc(db,'do_settle',[run.run_id,boot]);
 await db.exec('update submission_media.do_control set monthly_ceiling_usd=15,enabled=false');
 const before=(await db.query('select * from submission_media.do_control')).rows[0],ledger=(await db.query('select * from submission_media.do_runs order by id')).rows;
 await db.exec(await readFile(new URL('../supabase/migrations/20261119004313_digitalocean_november_20usd_ceiling.sql',import.meta.url),'utf8'));
 const after=(await db.query('select * from submission_media.do_control')).rows[0];assert.equal(Number(after.monthly_ceiling_usd),20);
 delete before.monthly_ceiling_usd;delete after.monthly_ceiling_usd;assert.deepEqual(after,before);
 assert.deepEqual((await db.query('select * from submission_media.do_runs order by id')).rows,ledger);
 for(const update of ['monthly_ceiling_usd=20.01',"month='2026-12'"])await assert.rejects(db.exec('update submission_media.do_control set '+update),e=>e.code==='23514');
}));
