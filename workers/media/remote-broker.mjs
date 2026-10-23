import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createReadStream } from 'node:fs';
import { withVerifiedOutput } from './files.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { MediaError } from './errors.mjs';
import { BoundedStream,stagingConfig,requireValue,uuid } from '../../services/media-broker/common.mjs';
import { identityToken } from '../../services/media-broker/auth.mjs';
export class RemoteBroker {
 constructor(config,{fetcher=fetch,signal,token=()=>identityToken(config.BROKER_AUDIENCE)}={}){this.config=stagingConfig(config);requireValue(uuid(config.EXECUTION_PERMIT_ID)&&/^projects\/tse-security-staging-media\/locations\/us-east5\/jobs\/media-worker-staging\/executions\/[a-z0-9-]+$/.test(config.EXECUTION_NAME),'PERMIT_INVALID');this.fetcher=fetcher;this.token=token;this.signal=signal;this.claimed=null;}
 context(l){return {permit_id:this.config.EXECUTION_PERMIT_ID,execution_name:this.config.EXECUTION_NAME,...l};}
 async request(path,body,{signal,stream=false,headers={}}={}){const token=await this.token();const r=await this.fetcher(this.config.BROKER_URL+path,{method:'POST',headers:{Authorization:'Bearer '+token,'X-Serverless-Authorization':'Bearer '+token,...headers},body,duplex:'half',redirect:'error',signal:AbortSignal.any([signal,this.signal,AbortSignal.timeout(120000)].filter(Boolean))});if(!r.ok){await r.body?.cancel();throw new MediaError('worker_lease_expired');}if(stream)return r;const size=new BoundedStream(16384);const parts=[];await pipeline(Readable.fromWeb(r.body),size,async src=>{for await(const p of src)parts.push(p);});return JSON.parse(Buffer.concat(parts));}
 call(path,value,options){return this.request(path,JSON.stringify(value),{...options,headers:{'content-type':'application/json'}});}
 async claim(){if(this.claimed)return this.claimed;for(let i=0;i<15;i++){try{return this.claimed=await this.call('/claim',{permit_id:this.config.EXECUTION_PERMIT_ID,execution_name:this.config.EXECUTION_NAME});}catch(e){if(i===14||this.signal?.aborted)throw e;await delay(1000,undefined,{signal:this.signal});}}}
 heartbeat(l){return this.call('/heartbeat',this.context(l));}
 async read(l,target,signal){const job=await this.call('/resolve',this.context(l),{signal}),input=job.source||job;const r=await this.call('/input',this.context(l),{signal,stream:true}),file=await open(target,'wx',0o600);try{await pipeline(Readable.fromWeb(r.body),new BoundedStream(job.source?250000000:job.max_bytes,input.bytes,input.sha256),file.createWriteStream(),{signal});}finally{await file.close();}return job;}
 async authorizeOutput(l){const j=await this.call('/resolve',this.context(l));requireValue(j.source,'OUTPUT_PROVENANCE_MISMATCH');return Object.freeze({job:j});}
 async writeOutput(l,cap,result,signal){for(let i=0;i<3;i++){try{return await withVerifiedOutput(result,cap.job.max_bytes,signal,async(file,facts)=>{const body=createReadStream('',{fd:file.fd.fd,autoClose:false,start:0,end:facts.actual_bytes-1});return this.request('/output',body,{signal,headers:{'content-type':'application/octet-stream','content-length':String(facts.actual_bytes),'x-media-context':JSON.stringify({context:this.context(l),result,profile:cap.job.profile})}});});}catch(e){if(i===2||signal?.aborted)throw e;await delay(200);}}}
 async complete(l,result){for(let i=0;i<3;i++){try{return await this.call('/complete',{context:this.context(l),result,error:null});}catch(e){if(i===2)throw e;await delay(200);}}}
 fail(l,error){return this.call('/complete',{context:this.context(l),result:{},error});}
}
