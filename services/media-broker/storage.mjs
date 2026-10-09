import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BoundedStream,BrokerError,requireValue,STAGING } from './common.mjs';
export class StagingStorage {
 #credential;
 constructor(credential,inspect,fetcher=fetch){requireValue(typeof credential==='string'&&credential.length>20);this.#credential=credential;this.inspect=inspect;this.fetcher=fetcher;}
 url(i,write=false){requireValue((write?['submission-derived']:['submission-source','submission-artwork','track-audio','submission-derived']).includes(i.bucket)&&typeof i.path==='string'&&i.path.length<=512&&!/(^\/|(^|\/)\.\.(\/|$)|[?%#\\]|:\/\/)/.test(i.path),'INPUT_MISMATCH');return `https://${STAGING}.supabase.co/storage/v1/object/${i.bucket}/`+i.path.split('/').map(encodeURIComponent).join('/');}
 async stream(i,signal){const r=await this.fetcher(this.url(i),{headers:{Authorization:'Bearer '+this.#credential,apikey:this.#credential},redirect:'error',signal});requireValue(r.ok&&r.body,'INPUT_MISMATCH');const length=r.headers.get('content-length');if(length!==null)requireValue(Number(length)===Number(i.bytes),'INPUT_MISMATCH');return Readable.fromWeb(r.body);}
 async readExact(i,target,signal){const f=await open(target,'wx',0o600);try{await pipeline(await this.stream(i,signal),new BoundedStream(250000000,i.bytes,i.sha256),f.createWriteStream(),{signal});}finally{await f.close();}}
 async inspectExact(i){const observed=await this.inspect();requireValue(observed&&observed.object_id===i.object_id&&observed.version===i.version&&Number(observed.bytes)===Number(i.bytes),'STORAGE_CONFLICT');const check=new BoundedStream(4000000,i.bytes,i.sha256);await pipeline(await this.stream({...i,...observed},AbortSignal.timeout(20000)),check,async src=>{for await(const _ of src){/* bounded discard */}});return {...observed,bytes:check.bytes,sha256:check.digest};}
 async createExact(job,file,facts,signal){
 // Bounded broker-owned bytes, already descriptor-verified; never upload worker paths.
 const r=await this.fetcher(this.url(job,true),{method:'POST',headers:{Authorization:'Bearer '+this.#credential,apikey:this.#credential,'x-upsert':'false','content-type':job.job_type==='preview_generation'?'audio/mp4':'application/octet-stream','content-length':String(facts.actual_bytes)},body:createReadStream('',{fd:file.fd.fd,autoClose:false,start:0,end:facts.actual_bytes-1}),duplex:'half',redirect:'error',signal});
 // A lost/conflict response is reconciled by exact destination; never overwrite.
 if(!r.ok&&r.status!==409&&r.status!==400)throw new BrokerError('TEMPORARY_SYSTEM_ERROR');
 await r.body?.cancel();const observed=await this.inspect();requireValue(observed&&observed.version&&Number(observed.bytes)===facts.actual_bytes,'STORAGE_CONFLICT');
 const identity={...observed,bytes:observed.bytes,sha256:facts.sha256,bucket:job.bucket,path:job.path};return this.inspectExact(identity);
 }
}
