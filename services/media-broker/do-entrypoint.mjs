import {operationalAlerts} from './operational-health.mjs';
import {dispatchLoop} from './dispatch-loop.mjs';
import {launchReadiness} from './do-launch-readiness.mjs';
import {readFile,lstat} from 'node:fs/promises';
import {DODatabase} from './do-database.mjs';
import {doServer} from './do-server.mjs';
import {DODispatcher,RootLauncher} from './do-dispatcher.mjs';
import {HostSigner} from './do-storage.mjs';
import {verifyLinuxHostBinding} from './linux-host-binding.mjs';
import {requireValue,exactKeys} from './common.mjs';
export async function sealedJson(path,owner=0){const stat=await lstat(path);requireValue(stat.isFile()&&!stat.isSymbolicLink()&&stat.uid===owner&&(stat.mode&0o022)===0&&stat.size<65536);return JSON.parse(await readFile(path,'utf8'));}
export function doConfig(c){exactKeys(c,['enabled','host_id','root_uuid','worker_digest','broker_digest','source_commit','db_host','db_port','db_user','db_name']);
 requireValue(c.enabled===true&&c.host_id==='620470021'&&c.root_uuid==='59134bd0-a76f-4ea0-8e4a-770b2e1eafc2'&&c.worker_digest==='sha256:37eaf7342bfbcb1917862d0003be87ef96cc22e935765bd2abb11d6fa44f3876'&&/^sha256:[a-f0-9]{64}$/.test(c.broker_digest)&&/^[a-f0-9]{40}$/.test(c.source_commit)&&c.db_host==='aws-1-us-east-2.pooler.supabase.com'&&c.db_port===5432&&c.db_user==='media_broker_do_login.sgpubcpldfxcuhjjdcau'&&c.db_name==='postgres');return Object.freeze(c);}
export async function doUsage(db,boot,{path='/run/tse-audio/accounting/usage.json',status='/run/tse-audio/status/runtime-status.json',now=Date.now,load=sealedJson,save}={}){
 const value=await load(path);requireValue(value.provider==='digitalocean'&&value.host_id==='620470021'&&value.boot_id===boot&&Number.isSafeInteger(value.traffic_bytes)&&value.traffic_bytes>=0&&Number.isSafeInteger(value.log_bytes)&&value.log_bytes>=0&&Number.isSafeInteger(value.sampled_at)&&now()-value.sampled_at>=0&&now()-value.sampled_at<90000);
 const result=await db.rpc('do_observe',[value.traffic_bytes,value.log_bytes]);const queue=await db.rpc('do_health');const output={provider:'digitalocean',host_id:'620470021',boot_id:boot,paused:result.paused||!result.enabled,projected_usd:Number(result.projected_usd),sampled_at:now(),month:result.month,queue,alerts:operationalAlerts({queue,projectedUsd:Number(result.projected_usd),ceilingUsd:result.month==='2026-11'?20:15})};
 requireValue(Number.isFinite(output.projected_usd));if(save)await save(output);else{const {writeFile,rename}=await import('node:fs/promises');await writeFile(status+'.tmp',JSON.stringify(output),{mode:0o640});await rename(status+'.tmp',status);}return {...result,queue};
}
export async function startDO(e=process.env){
 requireValue(e.MEDIA_DO_ENABLED==='founder-beta'&&process.getuid?.()===20000);
 const c=doConfig(await sealedJson('/etc/tse-audio/do-production.json'));
 const verify=async()=>verifyLinuxHostBinding({...await sealedJson('/run/tse-audio/host-binding.json'),expected:{droplet_id:c.host_id,root_uuid:c.root_uuid,worker_manifest:c.worker_digest,broker_manifest:c.broker_digest,source_commit:c.source_commit,mode:'founder-beta'}});
 const binding=await verify(),directory=e.CREDENTIALS_DIRECTORY;requireValue((await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim()===binding.boot_id);requireValue(typeof directory==='string'&&directory.startsWith('/run/credentials/'));
 const dbSecret=JSON.parse(await readFile(directory+'/db','utf8'));exactKeys(dbSecret,['password','ca']);requireValue(typeof dbSecret.password==='string'&&dbSecret.password.length>=32&&typeof dbSecret.ca==='string'&&dbSecret.ca.includes('BEGIN CERTIFICATE')&&!dbSecret.ca.includes('PRIVATE KEY'));
 const signer=new HostSigner(await readFile(directory+'/host-signer','utf8'),binding.boot_id);
 const {default:pg}=await import('pg');const pool=new pg.Pool({host:c.db_host,port:c.db_port,user:c.db_user,database:c.db_name,password:dbSecret.password,ssl:{rejectUnauthorized:true,ca:dbSecret.ca,minVersion:'TLSv1.2',servername:c.db_host},max:4,connectionTimeoutMillis:5000,statement_timeout:20000});
 const id=(await pool.query('select current_user actor,rolsuper,rolbypassrls,rolinherit,rolcreaterole,rolcreatedb,rolreplication from pg_roles where rolname=current_user')).rows[0];requireValue(id.actor==='media_broker_do_login'&&!['rolsuper','rolbypassrls','rolinherit','rolcreaterole','rolcreatedb','rolreplication'].some(k=>id[k]));
 const acl=(await pool.query("select exists(select 1 from pg_class t join pg_namespace n on n.oid=t.relnamespace where n.nspname in ('auth','storage','submission_media') and t.relkind='r' and has_table_privilege(current_user,t.oid,'SELECT,INSERT,UPDATE,DELETE')) broad,pg_has_role(current_user,'submission_media_broker','MEMBER') legacy,has_function_privilege(current_user,'submission_media.claim_job()','EXECUTE') generic")).rows[0];requireValue(!acl.broad&&!acl.legacy&&!acl.generic);
 const db=new DODatabase(pool,binding.boot_id),broker=doServer({db,signer,scratch:'/var/lib/tse-audio/broker-scratch'});await broker.listen('/run/tse-audio/worker/broker.sock');
 const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
 const sync=async()=>{const current=await verify();requireValue(current.boot_id===binding.boot_id);return doUsage(db,binding.boot_id);};
 let syncing;const syncOnce=()=>syncing??(syncing=sync().finally(()=>{syncing=undefined;}));const interval=setInterval(()=>{syncOnce().catch(()=>controller.abort());},30000);
 const dispatcher=new DODispatcher({db,broker,launcher:new RootLauncher('/run/tse-audio/control/launcher.sock'),digest:c.worker_digest,syncUsage:syncOnce,ready:launchReadiness()});
 try{await dispatchLoop({dispatcher,verify,signal:controller.signal});}
 finally{clearInterval(interval);controller.abort();broker.revoke();try{const active=await db.rpc('do_scope_status',[null]).catch(()=>null);if(active?.state==='issued')await dispatcher.recover(active);}catch{process.stderr.write('MEDIA_DO_STOP_RECONCILIATION_REQUIRED\n');}finally{await new Promise(r=>broker.server.close(r));await pool.end();}}
}
if(process.argv[1]===new URL(import.meta.url).pathname)startDO().catch(()=>{process.stderr.write('MEDIA_DO_START_FAILED\n');process.exitCode=78;});
