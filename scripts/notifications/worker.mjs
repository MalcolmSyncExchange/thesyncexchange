// Explicit one-shot invocation only. No installed scheduler or startup hook.
import {pathToFileURL} from 'node:url';
export async function notificationTick(env,fetcher=fetch){
 if(env.TSE_EMAIL_DELIVERY_ENABLED!=='true'||typeof env.TSE_NOTIFICATION_WORKER_SECRET!=='string'||env.TSE_NOTIFICATION_WORKER_SECRET.length<32||env.TSE_NOTIFICATION_WORKER_SECRET===env.TSE_FINANCE_WORKER_SECRET)throw Error('Notification worker configuration unavailable');
 const url=new URL(env.TSE_NOTIFICATION_WORKER_URL||'http://127.0.0.1:3000/api/internal/notifications/worker');
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/api/internal/notifications/worker'||!['http:','https:'].includes(url.protocol)||(url.protocol==='http:'&&!['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Notification worker target unavailable');
 const response=await fetcher(url,{method:'POST',headers:{authorization:'Bearer '+env.TSE_NOTIFICATION_WORKER_SECRET},redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('Notification worker unavailable');
 const r=await response.json();
 if(!Number.isInteger(r.attempted)||r.attempted<0||r.attempted>10||!Number.isInteger(r.accepted)||r.accepted<0||r.accepted>r.attempted||typeof r.collectionFailed!=='boolean')throw Error('Notification worker result unavailable');
 return {attempted:r.attempted,accepted:r.accepted,collectionFailed:r.collectionFailed};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(process.argv.length!==3||process.argv[2]!=='--once')throw Error();console.info(JSON.stringify({event:'notification_worker_tick',...await notificationTick(process.env)}));}
 catch{console.error('notification_worker_unavailable');process.exitCode=1;}
}
