import {randomUUID,sign,createPrivateKey} from 'node:crypto';
import {readBounded} from '../../workers/media/files.mjs';
import {Readable} from 'node:stream';
import {transferBytes} from './do-transfer-proof.mjs';
import {requireValue,boundedJson} from './common.mjs';
const endpoint='https://thesyncexchange.com/api/media/worker-transfer';
export class HostSigner {
 constructor(key,boot,now=Date.now){this.key=createPrivateKey(key);requireValue(this.key.asymmetricKeyType==='ed25519');this.boot=boot;this.now=now;}
 proof(run,l,operation,bytes=null,sha256=null){const now=this.now();const p={version:1,host_id:'620470021',run_id:run,boot_id:this.boot,job_id:l.job_id,lease_epoch:l.lease_epoch,lease_token:l.lease_token,nonce:randomUUID(),operation,bytes,sha256,issued_at:now,expires_at:now+30000};return {'x-tse-proof':transferBytes(p).toString(),'x-tse-signature':sign(null,transferBytes(p),this.key).toString('base64')};}
}
export class DOStorage {
 constructor(signer,authority,lease,fetcher=fetch){Object.assign(this,{signer,authority,lease,fetcher});}
 async request(operation,body,bytes=null,sha256=null,signal=AbortSignal.timeout(25000)){
 const response=await this.fetcher(endpoint,{method:'POST',headers:{...this.signer.proof(this.authority.run,this.lease,operation,bytes,sha256),'content-type':'application/octet-stream'},body,signal,redirect:'error'});requireValue(response.ok,'AUTH_DENIED');return boundedJson(response,8192);}
 async stream(i,signal){
 const grant=await this.request('input',undefined,null,null,signal);const url=new URL(grant.url);const prefix='/storage/v1/object/sign/'+i.bucket+'/';
 requireValue(url.protocol==='https:'&&url.hostname==='sgpubcpldfxcuhjjdcau.supabase.co'&&!url.username&&!url.password&&!url.port&&decodeURIComponent(url.pathname)===prefix+i.path&&Number(grant.bytes)===Number(i.bytes)&&grant.sha256===(i.sha256||null),'INPUT_MISMATCH');
 const response=await this.fetcher(url,{signal,redirect:'error'});requireValue(response.ok&&response.body,'INPUT_MISMATCH');const size=response.headers.get('content-length');requireValue(size===null||Number(size)===Number(i.bytes),'INPUT_MISMATCH');return Readable.fromWeb(response.body);
 }
 async inspectExact(i){const output=await this.authority.inspect(this.lease);requireValue(output&&output.object_id===i.object_id&&output.version===i.version&&Number(output.bytes)===Number(i.bytes),'STORAGE_CONFLICT');
 const result=await this.request('verify',undefined,Number(i.bytes),i.sha256);requireValue(result.object_id===i.object_id&&result.version===i.version&&result.sha256===i.sha256&&Number(result.bytes)===Number(i.bytes),'STORAGE_CONFLICT');return result;}

 async createExact(job,file,facts,signal){
 const stat=await file.fd.stat();requireValue(stat.size===facts.actual_bytes&&stat.size<=4000000,'OUTPUT_TOO_LARGE');
 // Generated artifacts are capped at 4 MB; original audio never crosses Netlify.
 const chunks=[];const actual=await readBounded(file,4000000,signal,chunk=>chunks.push(Buffer.from(chunk)));requireValue(actual.actual_bytes===facts.actual_bytes&&actual.sha256===facts.sha256,'INPUT_MISMATCH');const bytes=Buffer.concat(chunks);
 const result=await this.request('output',bytes,facts.actual_bytes,facts.sha256,signal);requireValue(result.object_id&&result.version&&result.sha256===facts.sha256&&Number(result.bytes)===facts.actual_bytes,'STORAGE_CONFLICT');return result;
 }
}
