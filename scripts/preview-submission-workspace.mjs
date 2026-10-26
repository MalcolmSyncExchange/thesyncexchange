// Local synthetic preview only; credentials are generated fixture values, never application credentials.
import {startMusicFixture,anonKey,serviceKey} from '../tests/helpers/music-uploads-provider-fixture.mjs';
import {spawn} from 'node:child_process';import http from 'node:http';
const fixture=await startMusicFixture();await fixture.query('update submission_media.capabilities set worker_enabled=false');
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');let value;
 if(req.method==='GET'&&url.pathname==='/state')value={submissions:(await fixture.query('select id,workspace_draft,workspace_revision,revision,track_id from submission_media.submissions')).rows,assets:(await fixture.query('select id,kind,technical_state,declared_bytes from submission_media.assets')).rows,patches:fixture.patchCount()};
 else if(req.method==='POST'&&url.pathname==='/interrupt'){fixture.pauseTransfers(url.searchParams.get('enabled')==='true');value={ok:true};}
 else if(req.method==='POST'&&url.pathname==='/failure'){fixture.failNextRpc(url.searchParams.get('rpc'),'after');value={ok:true};}
 else{res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));}catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(3192,'127.0.0.1',r));
const production=process.argv.includes('--production');
const env={...Object.fromEntries(['PATH','HOME','TMPDIR','LANG','SHELL','USER'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),NODE_ENV:production?'production':'development',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_APP_URL:'http://127.0.0.1:3191',NEXT_PUBLIC_SUPABASE_URL:fixture.url,NEXT_PUBLIC_SUPABASE_ANON_KEY:anonKey,SUPABASE_SERVICE_ROLE_KEY:serviceKey,SYNC_EXCHANGE_PAYMENT_MODE:'disabled',SYNC_EXCHANGE_DEMO_MODE:'false',TSE_BUILD_DEPLOYMENT_TARGET:'local'};
if(production){const build=spawn('npm',['run','build'],{cwd:process.cwd(),env,stdio:'inherit'});const code=await new Promise(r=>build.on('exit',r));if(code!==0){await new Promise(r=>server.close(r));await fixture.close();process.exit(code||1);}}
console.log('Synthetic submission preview http://127.0.0.1:3191/login ; fixture control http://127.0.0.1:3192');
const app=spawn(process.execPath,['node_modules/next/dist/bin/next',production?'start':'dev','--hostname','127.0.0.1','--port','3191'],{cwd:process.cwd(),env,stdio:'inherit'});
let closing=false;async function close(){if(closing)return;closing=true;app.kill('SIGTERM');await new Promise(r=>{if(app.exitCode!==null)r();else app.once('exit',r);});await new Promise(r=>server.close(r));await fixture.close();process.exit();}
process.on('SIGINT',close);process.on('SIGTERM',close);app.on('exit',()=>{if(!closing)void close();});
