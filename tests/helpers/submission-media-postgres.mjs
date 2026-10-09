import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fixtureBootstrapSql, seedDatabase, ids, quote } from './artist-baseline-db.mjs';
export { ids, quote };
export const root = new URL('../../', import.meta.url);
export const migrations = readdirSync(new URL('supabase/migrations/',root)).filter(x=>x.endsWith('.sql')).sort();
export const foundation = migrations.filter(x=>x.includes('slice3_submission_media')||x.includes('slice3_media_worker_fenced_io')||x.includes('slice3_media_execution_permits'));
export const source = p=>readFileSync(new URL(p,root),'utf8');
// No DSN/environment option: only the disposable local Unix socket is accepted.
// PG environment is cleared so .pgpass/PGSERVICE cannot redirect this harness.
export function psql(db,sql,{allowFailure=false,user='slice3_fixture_admin'}={}) {
 return new Promise((resolve,reject)=>{
  const child=spawn('psql',['-X','-q','-A','-t','-P','null=null','-h','/private/tmp','-p','55440','-U',user,'-d',db,'-v','ON_ERROR_STOP=1'],{env:{PATH:process.env.PATH,LC_ALL:'C'},stdio:['pipe','pipe','pipe']});
  let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);
  child.on('close',code=>code&&!allowFailure?reject(Error(err.trim())):resolve({code,out:out.trim(),err:err.trim()}));child.stdin.end(sql);
 });
}
export const storageSetup='docs/slice3-foundation/storage-protection.sql';
export async function fixture({apply=true,seed=true,storage=true}={}) {
 const name='slice3_test_'+randomUUID().replaceAll('-','');
 await psql('postgres',`do $$ begin if not exists(select 1 from pg_roles where rolname='postgres') then create role postgres login nosuperuser createdb createrole bypassrls; end if; end $$; create database ${name} owner postgres`);
 const db={name,exec:async sql=>psql(name,"select set_config('request.jwt.claim.role','service_role',false);"+sql),query:async sql=>{
  const r=await psql(name,`select coalesce(json_agg(q),'[]') from (${sql}) q`);return {rows:JSON.parse(r.out)};
 },scalar:async sql=>(await psql(name,sql)).out,
 install:sql=>psql(name,sql,{user:'postgres'}),
 setup:()=>psql(name,source(storageSetup),{user:'postgres'}),
 close:()=>psql('postgres',`drop database ${name} with (force)`)};
 try {
  const bootstrap=fixtureBootstrapSql.replace(/create role (anon|authenticated|service_role|supabase_storage_admin)( bypassrls)?;/g,(_,role,extra)=>`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}${extra||''}; end if; end $$;`);
  await db.install(bootstrap);
  for(const m of migrations.filter(x=>!foundation.includes(x))) await db.install(source('supabase/migrations/'+m));
  // Supabase-shaped installation: legacy bootstrap/replay uses postgres, then the
  // disposable admin models provider ownership. ALL Slice 3 operations use the
  // real non-superuser postgres login. Auth/Storage owners remain unrelated roles.
  await db.exec(`
   do $$ begin if not exists(select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin nologin; end if; end $$;
   create schema extensions;
   alter extension pgcrypto set schema extensions;
   grant usage on schema extensions to postgres;
   alter schema public owner to postgres;
   do $$ declare r record; begin
    for r in select n.nspname,c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','security_private','commerce_private','rate_limit_private') and c.relkind in ('r','p','v','S') loop
      execute format('alter %s %I.%I owner to postgres',case when r.relkind='v' then 'view' when r.relkind='S' then 'sequence' else 'table' end,r.nspname,r.relname);
    end loop;
    for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','security_private','commerce_private','rate_limit_private') loop
      execute format('alter function %s owner to postgres',r.signature);
    end loop;
   end $$;
   alter schema auth owner to supabase_auth_admin;
   alter table auth.users owner to supabase_auth_admin;
   alter table auth.sessions owner to supabase_auth_admin;
   alter function auth.uid() owner to supabase_auth_admin;
   alter function auth.role() owner to supabase_auth_admin;
   alter function auth.jwt() owner to supabase_auth_admin;
   alter schema storage owner to supabase_storage_admin;
   alter table storage.objects owner to supabase_storage_admin;
   alter table storage.buckets owner to supabase_storage_admin;
   grant usage on schema auth to postgres;
   grant usage on schema storage to postgres with grant option;
   grant all on storage.objects,storage.buckets to postgres with grant option;
   revoke all on schema auth from public;
   revoke all on schema storage from public;
   alter role postgres nosuperuser createdb createrole bypassrls;
   alter role postgres set createrole_self_grant='';
  `);
  if(apply) for(const m of foundation) await db.install(source('supabase/migrations/'+m));
  if(apply&&storage) await db.setup();
  if(seed) await seedDatabase(db);
  return db;
 } catch(e) {await db.close();throw e;}
}
export const actorSql=(id,sql,role='authenticated')=>`begin; set local role ${role}; select set_config('request.jwt.claim.sub',${quote(id||'')},true); select set_config('request.jwt.claim.role',${quote(role)},true); ${sql}; commit;`;
export async function actor(db,id,sql,role='authenticated') {
 const r=await psql(db.name,actorSql(id,sql,role)); const lines=r.out.split('\n').filter(Boolean);return lines.at(-1)?JSON.parse(lines.at(-1)):null;
}
export const broker=(db,sql)=>actor(db,null,sql,'submission_media_broker');
export const revision=async(db,s)=>Number(await db.scalar(`select revision from submission_media.submissions where id='${s}'`));
export const key=()=>randomUUID();
export const call=(name,args)=>`select public.${name}(${args.map(x=>typeof x==='number'?x:x===null?'null':quote(x)).join(',')})`;
export async function enabled(db) {await db.exec('update submission_media.capabilities set reservations_enabled=true,worker_enabled=true,activation_enabled=true,foundation_reads_enabled=true');}
export async function submission(db,track=null) {const s=await actor(db,ids.a,call('media_create_submission',[key(),track]));return s.submission_id;}
export async function reserve(db,s,kind='source_master') {return actor(db,ids.a,call('media_reserve_asset',[s,kind,'fixture.wav',100,await revision(db,s),key()]));}
export async function upload(db,asset,{version='v1'}={}) {
 await db.exec(`insert into storage.objects(bucket_id,name,owner_id,metadata,version) select bucket,object_path,'${ids.a}',jsonb_build_object('size',100,'mimetype','application/octet-stream'),${quote(version)} from submission_media.assets where id='${asset}'`);
 return broker(db,`select submission_media.observe_upload('${asset}')`);
}
export const masterResult=(seconds=120)=>({sha256:'a'.repeat(64),actual_bytes:100,container:'wav',codec:'pcm_s24le',frames:seconds*48000,duration_us:seconds*1000000,sample_rate:48000,channels:2,bit_depth:24,build_digest:'sha256:'+'b'.repeat(64)});
export async function complete(db,job,result) {
 if(['waveform_generation','preview_generation'].includes(job.job_type)&&result.sha256) {
  const obj=JSON.parse(await db.scalar(`select jsonb_build_object('id',o.id,'version',o.version) from storage.objects o join submission_media.assets a on a.bucket=o.bucket_id and a.object_path=o.name where a.id='${job.asset_id}'`));
  await broker(db,`select submission_media.record_worker_output('${job.job_id}',${job.lease_epoch},'${job.lease_token}','${obj.id}',${quote(obj.version)},${quote(result.sha256)},${result.actual_bytes}); select null::jsonb`);
 }
 return broker(db,`select submission_media.complete_job('${job.job_id}',${job.lease_epoch},'${job.lease_token}',${quote(JSON.stringify(result))}::jsonb)`);
}
export async function validateMaster(db,s,seconds=120) {
 const a=await reserve(db,s);await upload(db,a.asset_id);const j=await broker(db,'select submission_media.claim_job()');await complete(db,j,masterResult(seconds));
 const w=await broker(db,'select submission_media.claim_job()');
 await db.exec(`insert into storage.objects(bucket_id,name,metadata,version) select bucket,object_path,'{"size":100,"mimetype":"application/octet-stream"}','w1' from submission_media.assets where id='${w.asset_id}'`);
 await complete(db,w,{sha256:'c'.repeat(64),source_sha256:'a'.repeat(64),actual_bytes:100,container:'waveform_minmax_i16_v1',waveform_points:seconds*100,build_digest:'sha256:'+'b'.repeat(64)});
 return a.asset_id;
}
export async function preview(db,s,m,start=0,end=30000) {
 await actor(db,ids.a,call('media_select_preview_region',[s,m,start,end,await revision(db,s),key()]));
 const p=await actor(db,ids.a,call('media_request_preview',[s,await revision(db,s),key()]));
 const j=await broker(db,'select submission_media.claim_job()');
 await db.exec(`insert into storage.objects(bucket_id,name,metadata,version) select bucket,object_path,'{"size":100,"mimetype":"audio/mp4"}','p1' from submission_media.assets where id='${p.asset_id}'`);
 await complete(db,j,{sha256:'d'.repeat(64),source_sha256:'a'.repeat(64),actual_bytes:100,container:'m4a',codec:'aac_lc',frames:(end-start)*44.1,duration_us:(end-start)*1000,sample_rate:44100,channels:2,build_digest:'sha256:'+'b'.repeat(64)});
 await actor(db,ids.a,call('media_accept_asset',[s,p.asset_id,await revision(db,s),key()]));return p.asset_id;
}
export async function review(db,s,m,p,{approve=true}={}) {
 const r=await actor(db,ids.a,call('media_request_master_review',[s,m,p,await revision(db,s),key()]));
 const hash=await db.scalar(`select encode(package_hash,'hex') from submission_media.master_reviews where id='${r.review_id}'`);
 const result=await actor(db,ids.admin,`select media_decide_master_review('${r.review_id}',${approve},'${hash}',${await revision(db,s)},'${key()}')`);
 return {...r,...result};
}
