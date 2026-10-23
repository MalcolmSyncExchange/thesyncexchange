import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
for(const name of ['.env','.env.local','.env.development','.env.development.local'])if(existsSync(name))throw Error('Combined browser fixture refuses environment files');
const safe={};for(const key of ['PATH','HOME','TMPDIR','SYSTEMROOT'])if(process.env[key])safe[key]=process.env[key];
Object.assign(safe,{SYNC_EXCHANGE_DEMO_MODE:'true',ANALYTICS_ENABLED:'false',SYNC_EXCHANGE_PAYMENT_MODE:'test',SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED:'false',SYNC_EXCHANGE_BILLING_PORTAL_ENABLED:'false',NEXT_PUBLIC_APP_URL:'http://127.0.0.1:3087',NEXT_TELEMETRY_DISABLED:'1'});
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3087'],{env:safe,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
