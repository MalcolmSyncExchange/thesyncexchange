import http from 'node:http';
import {open} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {withVerifiedOutput} from './files.mjs';
import {BoundedStream,requireValue,uuid} from '../../services/media-broker/common.mjs';
export const VM_SOCKET='/run/tse-media/broker.sock';
export class UnixBroker {
 constructor(context,{socket=VM_SOCKET,signal}={}){requireValue(context&&uuid(context.run_id)&&/^[a-f0-9]{64}$/.test(context.capability));this.context=context;this.socket=socket;this.signal=signal;}
 async request(path,value,{stream=false,body,headers={},signal}={}){
  const abort=AbortSignal.any([this.signal,signal,AbortSignal.timeout(120000)].filter(Boolean));const bytes=body??Buffer.from(JSON.stringify(value));
  const req=http.request({socketPath:this.socket,path,method:'POST',agent:false,signal:abort,headers:{Authorization:'Bearer '+this.context.capability,'content-type':'application/json',...(body?{}:{'content-length':String(bytes.length)}),...headers}});
  const response=new Promise((resolve,reject)=>{req.on('response',resolve);req.on('error',reject);});
  if(body){const transfer=pipeline(body,req,{signal:abort});transfer.catch(()=>{});try{const r=await response;await transfer;return await this.decode(r,stream);}catch(e){req.destroy();throw e;}}
  req.end(bytes);return this.decode(await response,stream);
 }
 async decode(r,stream){if(r.statusCode!==200){r.destroy();throw Error('MEDIA_REQUEST_DENIED');}if(stream)return r;const chunks=[],bound=new BoundedStream(16384);await pipeline(r,bound,async src=>{for await(const p of src)chunks.push(p);});return JSON.parse(Buffer.concat(chunks));}
 claim(){return this.request('/claim',{});}
 heartbeat(l){return this.request('/heartbeat',l);}
 async read(l,target,signal){const j=await this.request('/resolve',l),i=j.source||j;const r=await this.request('/input',l,{stream:true,signal}),f=await open(target,'wx',0o600);try{await pipeline(r,new BoundedStream(150000000,Number(i.bytes),i.sha256),f.createWriteStream(),{signal});}finally{await f.close();}await this.request('/resolve',l);return j;}
 async authorizeOutput(l){const job=await this.request('/resolve',l);requireValue(job.source);return Object.freeze({job});}
 writeOutput(l,cap,result,signal){return withVerifiedOutput(result,cap.job.max_bytes,signal,async(file,facts)=>this.request('/output',null,{signal,body:createReadStream('',{fd:file.fd.fd,autoClose:false,start:0,end:facts.actual_bytes-1}),headers:{'content-type':'application/octet-stream','content-length':String(facts.actual_bytes),'x-media-context':JSON.stringify({lease:l,result})}}));}
 async complete(l,result){let error;for(let n=0;n<3;n++){try{return await this.request('/complete',{lease:l,result,error:null});}catch(e){error=e;}}throw error;}
 fail(l,error){return this.request('/complete',{lease:l,result:{},error});}
}
