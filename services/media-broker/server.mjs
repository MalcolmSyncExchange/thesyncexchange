import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { mkdtemp,open,rm,realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { MediaBroker } from '../../workers/media/broker.mjs';
import { verifyOutput } from '../../workers/media/files.mjs';
import { PermitAuthority,rpc } from './database.mjs';
import { StagingStorage } from './storage.mjs';
import { BrokerError,requireValue,uuid,exactKeys,leaseBody,jsonBody,BoundedStream,publicJob,logEvent } from './common.mjs';
const lease=x=>({job_id:x.job_id,lease_epoch:x.lease_epoch,lease_token:x.lease_token});
const json=(res,value)=>{res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
const evidenceKeys=new Set(['sha256','actual_bytes','container','codec','frames','duration_us','sample_rate','channels','bit_depth','width','height','animated','waveform_points','build_digest','source_sha256']);
export function evidence(v){requireValue(v&&typeof v==='object'&&!Array.isArray(v)&&Buffer.byteLength(JSON.stringify(v))<=4096&&Object.keys(v).every(k=>evidenceKeys.has(k)),'OUTPUT_PROVENANCE_MISMATCH');return v;}
export function brokerServer({config,identity,pool,credential,fetcher=fetch,dispatcher,storageFactory,log=()=>{}}){
 let active=0;
 const server=createServer(async(req,res)=>{
 let directory;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);req.on('aborted',()=>controller.abort());res.on('close',()=>{if(!res.writableFinished)controller.abort();});
 try{
 requireValue(++active<=4,'TEMPORARY_SYSTEM_ERROR');const who=await identity.verify(req.headers.authorization);
 requireValue(req.method==='POST'&&/^\/[a-z-]+$/.test(req.url),'AUTH_DENIED');
 if(['/dispatch','/bind','/status'].includes(req.url)){
  requireValue(who.role==='dispatcher');const b=await jsonBody(req);
  if(req.url==='/dispatch'){exactKeys(b,['job_id','asset_id','job_type','profile','state','attempt','correlation_id']);requireValue(uuid(b.job_id)&&uuid(b.asset_id)&&uuid(b.correlation_id)&&Number.isSafeInteger(b.attempt),'PERMIT_INVALID');json(res,await dispatcher.dispatch(b,who.subject));}
  else if(req.url==='/bind'){exactKeys(b,['permit_id','execution_name']);requireValue(uuid(b.permit_id));await dispatcher.bind(b.permit_id,who.subject,b.execution_name);json(res,{ok:true});}
  else{exactKeys(b,['permit_id']);requireValue(uuid(b.permit_id));const p=await rpc(pool,'read_execution',[b.permit_id]);requireValue(p&&p.dispatcher_subject===who.subject);json(res,p);}return;
 }
 requireValue(who.role==='worker');let b;
 if(req.url==='/output'){
  requireValue(typeof req.headers['x-media-context']==='string'&&req.headers['x-media-context'].length<=8192,'PERMIT_INVALID');try{b=JSON.parse(req.headers['x-media-context']);}catch{throw new BrokerError('PERMIT_INVALID');}
  exactKeys(b,['context','result','profile']);evidence(b.result);leaseBody(b.context);
 }else b=await jsonBody(req);
 if(req.url==='/claim'){exactKeys(b,['permit_id','execution_name']);requireValue(uuid(b.permit_id));const authority=new PermitAuthority(pool,b);json(res,publicJob(await authority.claim()));return;}
 const context=req.url==='/output'?b.context:req.url==='/complete'?b.context:b;leaseBody(context);const authority=new PermitAuthority(pool,context),l=lease(context);
 const storage=storageFactory?storageFactory(authority,l):new StagingStorage(credential,async()=>authority.inspectOutput(l),fetcher);
 const media=new MediaBroker(authority,storage);
 if(req.url==='/heartbeat'){await authority.heartbeat(l);json(res,{ok:true});}
 else if(req.url==='/resolve'){json(res,publicJob(await authority.withLease(l,async j=>j)));}
 else if(req.url==='/input'){
  const job=await authority.withLease(l,async j=>j),input=job.source||job;
  requireValue(input.object_id&&input.version&&Number(input.bytes)>0&&Number(input.bytes)<=250000000,'INPUT_MISMATCH');
  const stream=await storage.stream(input,controller.signal),check=new BoundedStream(job.source?250000000:job.max_bytes,input.bytes,input.sha256);
  res.writeHead(200,{'content-type':'application/octet-stream','cache-control':'no-store'});
  // Do not end the HTTP response until exact identity is rechecked after bytes.
  await pipeline(stream,check,res,{end:false,signal:controller.signal});
  await authority.withLease(l,async current=>{const i=current.source||current;requireValue(i.object_id===input.object_id&&i.version===input.version,'INPUT_MISMATCH');});res.end();
 }else if(req.url==='/output'){
  const job=await authority.withLease(l,async j=>j);requireValue(job.source&&b.profile===job.profile&&b.result.source_sha256===job.source.sha256,'OUTPUT_PROVENANCE_MISMATCH');
  requireValue(Number.isSafeInteger(b.result.actual_bytes)&&b.result.actual_bytes>0&&b.result.actual_bytes<=job.max_bytes&&/^[a-f0-9]{64}$/.test(b.result.sha256),'OUTPUT_TOO_LARGE');
  directory=await realpath(await mkdtemp(join(config.SCRATCH||'/work','broker-')));const path=join(directory,'output'),f=await open(path,'wx',0o600),check=new BoundedStream(job.max_bytes,b.result.actual_bytes,b.result.sha256);
  try{await pipeline(req,check,f.createWriteStream(),{signal:controller.signal});}finally{await f.close();}
  const proof=await verifyOutput(path,job.max_bytes,controller.signal,async()=>b.result);
  await media.writeOutput(l,await media.authorizeOutput(l),proof,controller.signal);json(res,{ok:true});
 }else if(req.url==='/complete'){
  exactKeys(b,['context','result','error']);if(b.error!==null){requireValue(typeof b.error==='string');json(res,await media.fail(l,b.error));}
  else{evidence(b.result);json(res,await authority.complete(l,b.result));}
 }else throw new BrokerError('AUTH_DENIED');
 logEvent(log,{job_id:l.job_id,permit_id:context.permit_id,stage:req.url.slice(1)});
 }catch(error){const code=error instanceof BrokerError?error.code:error?.code==='worker_lease_expired'?'LEASE_STALE':'TEMPORARY_SYSTEM_ERROR';logEvent(log,{code,stage:'request_failed'});if(res.headersSent)res.destroy();else{res.writeHead(code==='AUTH_DENIED'?403:409,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({code}));}}
 finally{clearTimeout(timer);active--;controller.abort();if(directory)await rm(directory,{recursive:true,force:true});}
 });server.requestTimeout=125000;server.headersTimeout=10000;server.keepAliveTimeout=5000;return server;
}
