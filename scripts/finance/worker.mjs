// Explicit, unscheduled runner. Never invokes a provider mutation or enables flags.
import {setTimeout as pause} from 'node:timers/promises';
const allowed=new Set(['--once','--watch']);const mode=process.argv[2];
if(!allowed.has(mode)||process.env.SYNC_EXCHANGE_FINANCIAL_WORKER_ENABLED!=='true')throw Error('Explicit enabled TEST worker and --once or --watch required');
const endpoint=new URL(process.env.TSE_FINANCE_WORKER_URL||'http://127.0.0.1:3000/api/internal/finance/worker');
if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/api/internal/finance/worker'||!['https:','http:'].includes(endpoint.protocol)||(endpoint.protocol==='http:'&&!['127.0.0.1','localhost'].includes(endpoint.hostname)))throw Error('Trusted HTTPS or loopback worker endpoint required');
const secret=process.env.TSE_FINANCE_WORKER_SECRET;if(!secret||secret.length<32)throw Error('Dedicated worker authentication required');
let stopped=false,errors=0;process.on('SIGTERM',()=>stopped=true);process.on('SIGINT',()=>stopped=true);
do{
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(25000),redirect:'error'});
  if(!response.ok)throw Error('Worker unavailable');const r=await response.json();
  console.info(JSON.stringify({event:'financial_worker_tick',claimed:r.claimed,posted:r.posted,retried:r.retried,dead:r.dead,uncertain:r.uncertain}));errors=0;
 }catch{errors++;console.error(JSON.stringify({event:'financial_worker_unavailable',consecutiveFailures:errors}));if(mode==='--once'||errors>=3){process.exitCode=1;break;}}
 if(mode==='--once'||stopped)break;await pause(Math.min(60000,5000*2**errors));
}while(!stopped);
