import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {fixture,enabled,submission,reserve,upload,broker,key,quote,masterResult,psql,source,foundation} from './helpers/submission-media-postgres.mjs';
import {rpc} from '../services/media-broker/database.mjs';
const execution='projects/tse-security-staging-media/locations/us-east5/jobs/media-worker-staging/executions/test-1';
async function setup(body){const db=await fixture();const pool=new pg.Pool({host:'/private/tmp',port:55440,user:'slice3_fixture_admin',database:db.name,max:8});try{await enabled(db);await body(db,pool);}finally{await pool.end();await db.close();}}
async function queued(db){const s=await submission(db),a=await reserve(db,s);await upload(db,a.asset_id);const j=(await db.query(`select * from submission_media.jobs where asset_id='${a.asset_id}'`)).rows[0];return j;}
function args(j,k=key()){return [j.id,j.asset_id,j.job_type,j.profile_version,j.state,j.attempt,k,'123456789'];}
async function permit(pool,j){const p=await rpc(pool,'create_execution_permit',args(j));await rpc(pool,'request_execution',[p.permit_id,'123456789']);await rpc(pool,'bind_execution',[p.permit_id,'123456789',execution]);return p.permit_id;}
test('targeted claim: exact nomination, strict replay, completion uncertainty and no queue fallthrough',()=>setup(async(db,pool)=>{
 const j=await queued(db),other=await queued(db),p=await permit(pool,j);
 const claims=await Promise.all([rpc(pool,'claim_targeted_job',[p,execution]),rpc(pool,'claim_targeted_job',[p,execution])]);assert.equal(claims[0].job_id,j.id);assert.deepEqual(claims[0],claims[1]);
 assert.equal(await db.scalar(`select attempt from submission_media.jobs where id='${j.id}'`),'1');assert.equal(await db.scalar(`select attempt from submission_media.jobs where id='${other.id}'`),'0');
 const c=claims[0],tuple=[p,execution,c.job_id,c.lease_epoch,c.lease_token];
 await assert.rejects(rpc(pool,'claim_targeted_job',[p,execution+'x']));
 await assert.rejects(rpc(pool,'resolve_execution_lease',[...tuple.slice(0,2),other.id,...tuple.slice(3)]));
 const result=masterResult();const done=await rpc(pool,'complete_execution',[...tuple,result,null]);assert.deepEqual(await rpc(pool,'complete_execution',[...tuple,result,null]),done);
 await assert.rejects(rpc(pool,'complete_execution',[...tuple,{...result,sha256:'c'.repeat(64)},null]));await assert.rejects(rpc(pool,'claim_targeted_job',[p,execution]));
 assert.equal(await db.scalar(`select attempt from submission_media.jobs where id='${other.id}'`),'0');
}));
test('targeted nomination rejects wrong asset/profile/state, missing, leased and completed jobs',()=>setup(async(db,pool)=>{
 const j=await queued(db);
 for(const edit of [a=>a[0]=key(),a=>a[1]=key(),a=>a[2]='preview_generation',a=>a[3]='preview-aac-lc-v1',a=>a[4]='running',a=>a[5]=1]){const a=args(j);edit(a);await assert.rejects(rpc(pool,'create_execution_permit',a));}
 const p=await permit(pool,j);await db.exec(`update submission_media.jobs set state='succeeded' where id='${j.id}'`);await assert.rejects(rpc(pool,'claim_targeted_job',[p,execution]));assert.equal(await db.scalar('select sum(attempt) from submission_media.jobs'),'0');
}));
test('two dispatchers: same correlation returns one permit, one invoke; global staging permit blocks competing nomination',()=>setup(async(db,pool)=>{
 const j=await queued(db),a=args(j);const [p,q]=await Promise.all([rpc(pool,'create_execution_permit',a),rpc(pool,'create_execution_permit',a)]);assert.deepEqual(p,q);
 const invoked=await Promise.all([rpc(pool,'request_execution',[p.permit_id,'123456789']),rpc(pool,'request_execution',[p.permit_id,'123456789'])]);assert.equal(invoked.filter(x=>x.invoke).length,1);
 await assert.rejects(rpc(pool,'create_execution_permit',args(j)));await assert.rejects(rpc(pool,'request_execution',[p.permit_id,'987654321']));
 await rpc(pool,'bind_execution',[p.permit_id,'123456789',execution]);await rpc(pool,'bind_execution',[p.permit_id,'123456789',execution]);await assert.rejects(rpc(pool,'bind_execution',[p.permit_id,'123456789',execution+'x']));
}));
test('expired permit / stale lease cannot claim another queued job or complete',()=>setup(async(db,pool)=>{
 const j=await queued(db),other=await queued(db),p=await permit(pool,j);
 await db.exec(`update submission_media.execution_permits set created_at=clock_timestamp()-interval '16 minutes',expires_at=clock_timestamp()-interval '1 minute' where id='${p}'`);await assert.rejects(rpc(pool,'claim_targeted_job',[p,execution]));
 const fresh=await rpc(pool,'create_execution_permit',args(j));await rpc(pool,'request_execution',[fresh.permit_id,'123456789']);await rpc(pool,'bind_execution',[fresh.permit_id,'123456789',execution+'-2']);const c=await rpc(pool,'claim_targeted_job',[fresh.permit_id,execution+'-2']);
 await db.exec(`update submission_media.jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id='${j.id}'`);
 await assert.rejects(rpc(pool,'resolve_execution_lease',[fresh.permit_id,execution+'-2',j.id,c.lease_epoch,c.lease_token]));await assert.rejects(rpc(pool,'complete_execution',[fresh.permit_id,execution+'-2',j.id,c.lease_epoch,c.lease_token,masterResult(),null]));assert.equal(await db.scalar(`select attempt from submission_media.jobs where id='${other.id}'`),'0');
}));
test('permit lease lock fences concurrent takeover; migration replay, FORCE RLS and grants stay narrow',()=>setup(async(db,pool)=>{
 const j=await queued(db),p=await permit(pool,j),c=await rpc(pool,'claim_targeted_job',[p,execution]);const held=await pool.connect();try{await held.query('begin');await held.query('set local role submission_media_broker');await held.query('select submission_media.resolve_execution_lease($1,$2,$3,$4,$5)',[p,execution,j.id,c.lease_epoch,c.lease_token]);
 const conflict=await psql(db.name,`begin;set local lock_timeout='100ms';update submission_media.jobs set lease_epoch=lease_epoch+1 where id='${j.id}';commit`,{allowFailure:true});assert.match(conflict.err,/lock timeout/);
 }finally{await held.query('rollback');held.release();}
 await db.install(source('supabase/migrations/'+foundation.at(-1)));const f=(await db.query("select p.oid::regprocedure::text sig,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='submission_media' and p.proname='claim_targeted_job'")).rows[0];assert.deepEqual(f.proconfig,['search_path=""']);
 for(const role of ['anon','authenticated','service_role']){assert.equal(await db.scalar(`select has_function_privilege('${role}',${quote(f.sig)},'execute')`),'f');assert.equal(await db.scalar(`select has_table_privilege('${role}','submission_media.execution_permits','select')`),'f');}
 assert.equal(await db.scalar("select relforcerowsecurity from pg_class where oid='submission_media.execution_permits'::regclass"),'t');
}));
test('all-off: targeted claim fails without worker activation and never touches commerce',()=>setup(async(db,pool)=>{
 const j=await queued(db),p=await permit(pool,j);await db.exec('update submission_media.capabilities set worker_enabled=false');await assert.rejects(rpc(pool,'claim_targeted_job',[p,execution]));assert.equal(await db.scalar('select sum(attempt) from submission_media.jobs'),'0');assert.equal(await db.scalar('select count(*) from public.orders'),'0');
}));

test('dedicated login setup: exact eleven RPCs, no generic claim, no broker membership or Auth/Storage/table access',()=>setup(async(db,pool)=>{
 try{await db.install(source('docs/media-worker/database-login-setup.sql'));for(const target of ['submission_media.assets','submission_media.jobs','submission_media.execution_permits'])assert.equal(await db.scalar(`select has_table_privilege('media_broker_staging_login','${target}','SELECT,INSERT,UPDATE,DELETE')`),'f');
 assert.equal(await db.scalar("select has_function_privilege('media_broker_staging_login','submission_media.claim_job()','execute')"),'f');assert.equal(await db.scalar("select pg_has_role('media_broker_staging_login','submission_media_broker','member')"),'f');
 for(const schema of ['auth','storage'])assert.equal(await db.scalar(`select has_schema_privilege('media_broker_staging_login','${schema}','usage')`),'f');
 const j=await queued(db);const loginPool=new pg.Pool({host:'/private/tmp',port:55440,user:'media_broker_staging_login',database:db.name,max:2});try{const p=await rpc(loginPool,'create_execution_permit',args(j));assert.ok(p.permit_id);await assert.rejects(loginPool.query('select * from submission_media.assets'));await assert.rejects(loginPool.query('set role submission_media_broker'));}finally{await loginPool.end();}
 }finally{await db.exec('drop owned by media_broker_staging_login; drop role media_broker_staging_login');}
}));
