// Adapted from retained VM broker at 273866ab; no Google runtime dependency.
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {chmod,chown,lstat,mkdtemp,realpath,open,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {MediaBroker} from '../../workers/media/broker.mjs';
import {verifyOutput} from '../../workers/media/files.mjs';
import {DOAuthority} from './do-database.mjs';
import {DOStorage} from './do-storage.mjs';
import {evidence} from './server.mjs';
import {BoundedStream,requireValue,exactKeys,jsonBody,uuid,publicJob,logEvent} from './common.mjs';
function lease(l){exactKeys(l,['job_id','lease_epoch','lease_token']);requireValue(uuid(l.job_id)&&uuid(l.lease_token)&&Number.isSafeInteger(l.lease_epoch)&&l.lease_epoch>0);return l;}
export function doServer({db,signer,scratch,fetcher=fetch,now=Date.now,log=()=>{},storageFactory}){
 let active=0,cap=null;
 const server=createServer(async(req,res)=>{
  let directory;const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),120000);req.on('aborted',()=>abort.abort());res.on('close',()=>{if(!res.writableFinished)abort.abort();});
  const send=value=>{res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  try{
   requireValue(++active<=4&&req.method==='POST'&&['/claim','/resolve','/heartbeat','/input','/output','/complete'].includes(req.url));
   const token=req.headers.authorization;requireValue(cap&&cap.expires>now()&&typeof token==='string'&&/^Bearer [a-f0-9]{64}$/.test(token)&&timingSafeEqual(Buffer.from(token.slice(7),'hex'),Buffer.from(cap.capability,'hex')));
   const run=cap.run_id,authority=new DOAuthority(db,run);let l,b;
   if(req.url==='/output'){requireValue(typeof req.headers['x-media-context']==='string'&&req.headers['x-media-context'].length<=8192);try{b=JSON.parse(req.headers['x-media-context']);}catch{requireValue(false);}exactKeys(b,['lease','result']);l=lease(b.lease);evidence(b.result);}else b=await jsonBody(req);
   if(req.url==='/claim'){exactKeys(b,[]);send(publicJob(await authority.claim()));return;}
   if(req.url==='/complete'){exactKeys(b,['lease','result','error']);l=lease(b.lease);evidence(b.result);requireValue(b.error===null||['validator_timeout','temporary_system_error','storage_identity_mismatch','checksum_mismatch','worker_lease_expired','unsupported_format','file_too_large','audio_unreadable','no_audio_frames','unsupported_audio_configuration','waveform_generation_failed','preview_generation_failed','artwork_invalid'].includes(b.error));send(await authority.complete(l,b.result,b.error));return;}
   if(!l)l=lease(b);
   if(req.url==='/resolve'){send(publicJob(await authority.resolve(l)));return;}
   if(req.url==='/heartbeat'){await authority.heartbeat(l);send({ok:true});return;}
   const job=await authority.resolve(l),storage=storageFactory?storageFactory(authority,l):new DOStorage(signer,authority,l,fetcher),media=new MediaBroker(authority,storage);
   if(req.url==='/input'){
    const input=job.source||job;
    // Charge commits before external I/O, including interrupted transfers.
    const stream=await storage.stream(input,abort.signal),bound=new BoundedStream(150000000,Number(input.bytes),input.sha256);
    res.writeHead(200,{'content-type':'application/octet-stream','cache-control':'no-store'});await pipeline(stream,bound,res,{end:false,signal:abort.signal});await authority.resolve(l);res.end();
   }else{
    requireValue(job.source&&b.result.source_sha256===job.source.sha256&&Number.isSafeInteger(b.result.actual_bytes)&&b.result.actual_bytes>0&&b.result.actual_bytes<=job.max_bytes&&/^[a-f0-9]{64}$/.test(b.result.sha256),'OUTPUT_PROVENANCE_MISMATCH');
    directory=await realpath(await mkdtemp(join(scratch,'output-')));const path=join(directory,'output'),file=await open(path,'wx',0o600);
    try{await pipeline(req,new BoundedStream(job.max_bytes,b.result.actual_bytes,b.result.sha256),file.createWriteStream(),{signal:abort.signal});}finally{await file.close();}
    const proof=await verifyOutput(path,job.max_bytes,abort.signal,async()=>b.result);
    // The application transfer bridge charges before external I/O.
    await media.writeOutput(l,await media.authorizeOutput(l),proof,abort.signal);send({ok:true});
   }
   logEvent(log,{job_id:l.job_id,stage:req.url.slice(1)});
  }catch{logEvent(log,{stage:'request_failed',code:'AUTH_DENIED'});if(res.headersSent)res.destroy();else{res.writeHead(409,{'content-type':'application/json','cache-control':'no-store'});res.end('{"code":"MEDIA_REQUEST_DENIED"}');}}
  finally{clearTimeout(timer);active--;abort.abort();if(directory)await rm(directory,{recursive:true,force:true});}
 });
 server.requestTimeout=125000;server.headersTimeout=10000;server.keepAliveTimeout=1000;
 return {
  server,
  bind(run_id,build_digest){requireValue(uuid(run_id)&&/^sha256:[a-f0-9]{64}$/.test(build_digest)&&cap===null);cap={run_id,build_digest,capability:randomBytes(32).toString('hex'),expires:now()+900000};return {run_id,build_digest,capability:cap.capability};},
  revoke(){cap=null;},
  async listen(path){try{await lstat(path);throw Error('Existing broker socket requires operator reconciliation');}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(path,resolve);});await chown(path,20000,1000);await chmod(path,0o660);},
 };
}
