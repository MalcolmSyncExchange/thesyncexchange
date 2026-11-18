// Fresh Unix-only local cluster; accepts no hosted URL or credentials.
import{mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{execFile}from'node:child_process';import{promisify}from'node:util';import assert from'node:assert/strict';
import{fixtureBootstrapSql,postgresPgcryptoBootstrapSql,seedDatabase,ids}from'./helpers/artist-baseline-db.mjs';
import{preservationQuery,databaseSources}from'../scripts/diagnostics/staging-preservation-query.mjs';
import{createStagingPreservationCollector}from'../scripts/diagnostics/staging-preservation-collector.mjs';import{comparePreservationSnapshots}from'../scripts/diagnostics/postflight-preservation.mjs';
const run=promisify(execFile),temporary=mkdtempSync(join(tmpdir(),'tse-collector-native-')),data=join(temporary,'data'),socket=join(temporary,'socket');mkdirSync(socket,{mode:0o700});let started=false;
const args=['-h',socket,'-p','55557','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'];const sql=async text=>(await run('psql',[...args,'-c',text],{maxBuffer:8*1024*1024})).stdout;
try{
 await run('initdb',['-D',data,'-U','postgres','--auth=trust','--no-locale']);await run('pg_ctl',['-D',data,'-l',join(temporary,'server.log'),'-o',`-k ${socket} -p 55557 -h ''`,'start']);started=true;
 await sql(fixtureBootstrapSql+postgresPgcryptoBootstrapSql);
 await sql("alter table auth.users add column last_sign_in_at timestamptz,add column updated_at timestamptz;alter table auth.sessions add column created_at timestamptz default now(),add column refresh_token text;create table auth.identities(id uuid primary key,user_id uuid,last_sign_in_at timestamptz,updated_at timestamptz);create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);");
 const files=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort();
 for(const [index,file] of files.entries()){await sql(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));await sql(`insert into supabase_migrations.schema_migrations values('local-${index}','${file.slice(0,-4)}',array['local fixture applied']);`);}
 await seedDatabase({exec:async text=>sql("select set_config('request.jwt.claim.role','service_role',false);"+text)});
 const reader={verify:async()=>{},close:()=>{},database:async admin=>[{snapshot:JSON.parse((await sql(preservationQuery(admin))).trim())}],environment:async()=>({success:true,count:1,complete:true,readAt:new Date().toISOString(),rows:[{id:'ANALYTICS_ENABLED',value:'false'}]})};
 const collector=createStagingPreservationCollector({reader,fingerprintKey:Buffer.alloc(32,1)});const one=await collector.collect({approvedAdminId:ids.admin,mode:'READ_ONLY_NO_LOGIN'}),two=await collector.collect({approvedAdminId:ids.admin,mode:'READ_ONLY_NO_LOGIN'});
 assert.equal(one.diagnostic.status,'passed');assert.equal(two.diagnostic.status,'passed');assert.ok(one.diagnostic.sources.every(s=>s.complete));
 const result=comparePreservationSnapshots(one.snapshot,two.snapshot,{mode:'READ_ONLY_NO_LOGIN',expectedNewSessions:0,approvedAdminId:ids.admin,environmentId:'oppijylbkcbiqfuvckgj'});assert.equal(result.status,'passed');
 const session='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',loginStartedAt=new Date().toISOString();
 await sql(`insert into auth.sessions(id,user_id,created_at,refresh_token)values('${session}','${ids.admin}',clock_timestamp(),'fixture secret');`);const loginFinishedAt=new Date().toISOString();
 const authenticated=await collector.collect({approvedAdminId:ids.admin,mode:'AUTHENTICATED_REHEARSAL'});
 const authResult=comparePreservationSnapshots(two.snapshot,authenticated.snapshot,{mode:'AUTHENTICATED_REHEARSAL',expectedNewSessions:1,approvedSessionId:session,approvedAdminId:ids.admin,environmentId:'oppijylbkcbiqfuvckgj',loginStartedAt,loginFinishedAt});assert.equal(authResult.status,'passed');
 await sql(`select set_config('request.jwt.claim.role','service_role',false);update public.user_profiles set full_name='Changed fixture' where id='${ids.a}';`);const changed=await collector.collect({approvedAdminId:ids.admin,mode:'READ_ONLY_NO_LOGIN'});const bad=comparePreservationSnapshots(authenticated.snapshot,changed.snapshot,{mode:'READ_ONLY_NO_LOGIN',expectedNewSessions:0,approvedAdminId:ids.admin,environmentId:'oppijylbkcbiqfuvckgj'});assert.equal(bad.assertions.find(x=>x.assertion==='public.user_profiles.existing_records').passed,false);
 console.log(JSON.stringify({status:'PASS',nativePostgres:true,localOnly:true,databaseSources:Object.keys(databaseSources).length,completeSnapshots:4,authorizedOneSessionComparison:'PASS',noLoginComparison:'PASS',unexpectedProfileMutationRejected:true,migrationFixtureCount:files.length}));
}finally{if(started)await run('pg_ctl',['-D',data,'-m','immediate','stop']);rmSync(temporary,{recursive:true,force:true});}
