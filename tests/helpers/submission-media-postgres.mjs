import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fixtureBootstrapSql, seedDatabase, ids, quote } from './artist-baseline-db.mjs';
export { ids, quote };
export const root = new URL('../../', import.meta.url);
export const migrations = readdirSync(new URL('supabase/migrations/',root)).filter(x=>x.endsWith('.sql')).sort();
export const foundation = migrations.filter(x=>x.includes('slice3_submission_media'));
export const source = p=>readFileSync(new URL(p,root),'utf8');
// No DSN/environment option: only the disposable local Unix socket is accepted.
// PG environment is cleared so .pgpass/PGSERVICE cannot redirect this harness.
export function psql(db,sql,{allowFailure=false}={}) {
 return new Promise((resolve,reject)=>{
  const child=spawn('psql',['-X','-q','-A','-t','-P','null=null','-h','/private/tmp','-p','55439','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],{env:{PATH:process.env.PATH,LC_ALL:'C'},stdio:['pipe','pipe','pipe']});
  let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);
  child.on('close',code=>code&&!allowFailure?reject(Error(err.trim())):resolve({code,out:out.trim(),err:err.trim()}));child.stdin.end(sql);
 });
}
export async function fixture({apply=true,seed=true}={}) {
 const name='slice3_test_'+randomUUID().replaceAll('-','');
 await psql('postgres',`create database ${name}`);
 const db={name,exec:async sql=>psql(name,"select set_config('request.jwt.claim.role','service_role',false);"+sql),query:async sql=>{
  const r=await psql(name,`select coalesce(json_agg(q),'[]') from (${sql}) q`);return {rows:JSON.parse(r.out)};
 },scalar:async sql=>(await psql(name,sql)).out,close:()=>psql('postgres',`drop database ${name} with (force)`)};
 try {
  const bootstrap=fixtureBootstrapSql.replace(/create role (anon|authenticated|service_role)( bypassrls)?;/g,(_,role,extra)=>`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}${extra||''}; end if; end $$;`);
  await db.exec(bootstrap);
  for(const m of migrations.filter(x=>apply||!foundation.includes(x))) await db.exec(source('supabase/migrations/'+m));
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
export async function complete(db,job,result) {return broker(db,`select submission_media.complete_job('${job.job_id}',${job.lease_epoch},'${job.lease_token}',${quote(JSON.stringify(result))}::jsonb)`);}
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
