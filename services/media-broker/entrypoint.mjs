import { stagingConfig,requireValue,STAGING,boundedJson,exactKeys } from './common.mjs';
import { GoogleIdentity,accessToken } from './auth.mjs';
import { brokerServer } from './server.mjs';
import { DispatchAuthority } from './dispatcher.mjs';
export async function startBroker(e=process.env,{fetcher=fetch}={}){
 const config=stagingConfig(e);requireValue(config.DB_SECRET&&config.STORAGE_SECRET,'TARGET_MISMATCH');
 const secret=async name=>{const r=await fetcher('https://secretmanager.googleapis.com/v1/'+name+':access',{headers:{Authorization:'Bearer '+await accessToken(fetcher)},redirect:'error',signal:AbortSignal.timeout(5000)});requireValue(r.ok);const j=await boundedJson(r,20000);requireValue(typeof j.payload?.data==='string'&&j.payload.data.length<=16384);return Buffer.from(j.payload.data,'base64').toString();};
 const db=JSON.parse(await secret(config.DB_SECRET)),credential=await secret(config.STORAGE_SECRET);exactKeys(db,['host','user','database','port','password',...(db.ca!==undefined?['ca']:[])]);if(db.ca!==undefined)requireValue(typeof db.ca==='string'&&db.ca.length<=16384&&db.ca.includes('BEGIN CERTIFICATE')&&!db.ca.includes('PRIVATE KEY'),'TARGET_MISMATCH');
 requireValue(db.host===`db.${STAGING}.supabase.co`&&db.user==='media_broker_staging_login'&&db.database==='postgres'&&db.port===5432&&typeof db.password==='string','TARGET_MISMATCH');
 const {default:pg}=await import('pg');const pool=new pg.Pool({...db,ssl:{rejectUnauthorized:true,...(db.ca?{ca:db.ca}:{})},max:4,connectionTimeoutMillis:5000,statement_timeout:20000});
 const facts=await pool.query('select current_user as actor,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolinherit,rolreplication from pg_catalog.pg_roles where rolname=current_user');
 requireValue(facts.rows[0]?.actor===db.user&&!facts.rows[0].rolsuper&&!facts.rows[0].rolcreaterole&&!facts.rows[0].rolcreatedb&&!facts.rows[0].rolbypassrls&&!facts.rows[0].rolinherit&&!facts.rows[0].rolreplication,'TARGET_MISMATCH');
 const acl=await pool.query("select exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='submission_media' and c.relkind='r' and has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE')) as broad, has_function_privilege(current_user,'submission_media.claim_job()','execute') as legacy_claim,pg_has_role(current_user,'submission_media_broker','member') as member");requireValue(!acl.rows[0].broad&&!acl.rows[0].legacy_claim&&!acl.rows[0].member,'TARGET_MISMATCH');
 const dispatcher=new DispatchAuthority(pool);
 const server=brokerServer({config,identity:new GoogleIdentity(config,fetcher),pool,credential,fetcher,dispatcher,log:x=>process.stdout.write(JSON.stringify(x)+'\n')});
 server.listen(Number(e.PORT||8080),'0.0.0.0');return {server,pool};
}
if(process.argv[1]===new URL(import.meta.url).pathname)startBroker().catch(()=>{process.stderr.write('BROKER_STARTUP_FAILED\n');process.exitCode=78;});
