// Disposable local Unix-socket PostgreSQL only; no production DSN or PG credentials.
import{mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';import{join}from'node:path';import{execFile}from'node:child_process';import{promisify}from'node:util';import{randomUUID}from'node:crypto';import assert from'node:assert/strict';
import{fixtureBootstrapSql,postgresPgcryptoBootstrapSql,seedDatabase,ids}from'../tests/helpers/artist-baseline-db.mjs';
const run=promisify(execFile),root=new URL('../',import.meta.url),temp=mkdtempSync(join(tmpdir(),'tse-upload-quota-')),data=join(temp,'data'),socket=join(temp,'socket');mkdirSync(socket);
const environment={PATH:process.env.PATH,LC_ALL:'C'},port='55554',args=['-h',socket,'-p',port,'-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'];let started=false;
const sql=async text=>(await run('psql',[...args,'-c',text],{env:environment,maxBuffer:8*1024*1024})).stdout.trim();
const session=randomUUID(),actor=text=>sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${ids.a}',true);select set_config('request.jwt.claim.role','authenticated',true);select set_config('request.jwt.claim.session_id','${session}',true);${text};commit;`);
const value=out=>JSON.parse(out.split('\n').find(x=>x.startsWith('{')));
const create=async()=>value(await actor(`select media_create_submission('${randomUUID()}',null)`)).submission_id;
const reserve=async s=>{const revision=await sql(`select revision from submission_media.submissions where id='${s}'`);return actor(`select media_upload_reserve('${s}','master','master','Synthetic.wav',45500000,${revision},'${randomUUID()}',null)`);};
try{
 await run('initdb',['-D',data,'-U','postgres','--auth=trust','--no-locale'],{env:environment});await run('pg_ctl',['-D',data,'-l',join(temp,'server.log'),'-o',`-k ${socket} -p ${port} -h ''`,'start'],{env:environment});started=true;
 await sql(fixtureBootstrapSql+postgresPgcryptoBootstrapSql);
 for(const f of readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort())await sql(readFileSync(new URL('supabase/migrations/'+f,root),'utf8'));
 await seedDatabase({exec:async text=>sql("select set_config('request.jwt.claim.role','service_role',false);"+text)});
 await sql(`insert into auth.sessions(id,user_id)values('${session}','${ids.a}');update submission_media.capabilities set reservations_enabled=true;`);
 const drafts=[];for(let i=0;i<5;i++)drafts.push(await create());for(const s of drafts.slice(0,3))await reserve(s);
 const race=await Promise.allSettled(drafts.slice(3).map(reserve));assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.match(race.find(x=>x.status==='rejected').reason.stderr,/UPLOAD_TRANSFERS_FULL/);
 assert.equal(await sql("select count(*) from submission_media.assets where origin='upload'"),'4');
 const loser=drafts[3+race.findIndex(x=>x.status==='rejected')];await sql("update submission_media.assets set reservation_expires_at=clock_timestamp()-interval '1 second' where id=(select id from submission_media.assets order by created_at limit 1)");await reserve(loser);
 assert.equal(await sql("select count(*) from submission_media.assets where origin='upload'"),'5');
 const before=await sql("select jsonb_agg(to_jsonb(a) order by id) from submission_media.assets a");await sql(readFileSync(new URL('docs/audio-reconstruction/upload-transfer-quota-rollback.sql',root),'utf8'));assert.equal(await sql("select jsonb_agg(to_jsonb(a) order by id) from submission_media.assets a"),before);
 console.log(JSON.stringify({nativePostgres:true,platform:process.platform,architecture:process.arch,checks:['owner quota serialized across two concurrent connections','exactly four active reservations','fifth denied with specific reason','expired slot reusable','no asset deletion','rollback preserves records'],passed:true}));
}finally{if(started)await run('pg_ctl',['-D',data,'-m','immediate','stop'],{env:environment}).catch(()=>{});rmSync(temp,{recursive:true,force:true});}
