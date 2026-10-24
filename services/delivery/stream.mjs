import {createHash} from 'node:crypto';
import {mkdtemp,open,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DeliveryFailure,MAX_ASSET_BYTES} from './transfer.mjs';

// Disk spool bounds broker heap use. No bytes leave before the entire private
// object matches the sealed SHA/size. Directory 0700 and file 0600, removed on
// every normal/error/cancellation path; dedicated encrypted ephemeral disk is
// a hosted prerequisite. A crashed process requires the documented janitor.
export async function spoolArtifact(response,expected,{signal}={}) {
 if(!response.ok||!response.body) {void response.body?.cancel().catch(()=>{});throw new DeliveryFailure('storage_failed');}
 if(!Number.isSafeInteger(expected.byteSize)||expected.byteSize<1||expected.byteSize>MAX_ASSET_BYTES||!/^[a-f0-9]{64}$/.test(expected.sha256))throw new DeliveryFailure('integrity_failed');
 const length=response.headers.get('content-length');
 if(length!==null&&Number(length)!==expected.byteSize){void response.body.cancel().catch(()=>{});throw new DeliveryFailure('integrity_failed');}
 const dir=await mkdtemp(join(tmpdir(),'tse-delivery-'));let file,reader;
 const close=async()=>{await file?.close();await rm(dir,{recursive:true,force:true});};
 try{
  file=await open(join(dir,'asset'),'wx+',0o600);reader=response.body.getReader();const hash=createHash('sha256');let size=0;
  const aborted=()=>signal?.aborted;
  for(;;){if(aborted())throw new DeliveryFailure('aborted');const part=await reader.read();if(part.done)break;
   if(aborted())throw new DeliveryFailure('aborted');size+=part.value.byteLength;if(size>expected.byteSize)throw new DeliveryFailure('integrity_failed');
   hash.update(part.value);let n=0;while(n<part.value.byteLength){const written=await file.write(part.value,n,part.value.byteLength-n);if(!written.bytesWritten)throw new DeliveryFailure('storage_failed');n+=written.bytesWritten;}
  }
  if(size!==expected.byteSize||hash.digest('hex')!==expected.sha256)throw new DeliveryFailure('integrity_failed');
  reader.releaseLock();reader=null;
  let closed=false;
  return {size,read:async(offset,count)=>{const buffer=new Uint8Array(count);const r=await file.read(buffer,0,count,offset);if(r.bytesRead!==count)throw new DeliveryFailure('storage_failed');return buffer;},close:async()=>{if(closed)return;closed=true;await close();}};
 }catch(error){void reader?.cancel().catch(()=>{});reader?.releaseLock();await close();throw error instanceof DeliveryFailure?error:new DeliveryFailure('storage_failed');}
}

// Transport uses <=64KiB chunks; authority checkpoints every <=1MiB or 1s. A committed hold/revocation denies subsequent
// checks; bytes already handed to transport cannot be recalled. The terminal
// record means the server exhausted its stream, never verified client receipt.
export async function guardedArtifactStream(prepared,authorization,{signal,check,record}) {
 let offset=0,lastCheckOffset=0,lastCheckAt=0,done=false,controller,tail=Promise.resolve();
 const expires=Date.parse(authorization.expiresAt);
 const cleanup=async()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);await prepared.close();};
 const finish=async outcome=>{if(done)return;done=true;try{await record(outcome,offset);}finally{await cleanup();}};
 const serialized=fn=>{const task=tail.then(fn);tail=task.catch(()=>{});return task;};
 const stop=outcome=>serialized(async()=>{if(done)return;try{await finish(outcome);}finally{try{controller?.error(new DeliveryFailure(outcome));}catch{}}});
 const onAbort=()=>{void stop('interrupted').catch(()=>{});};
 const timer=setTimeout(()=>{void stop('expired').catch(()=>{});},Number.isFinite(expires)?Math.max(0,expires-Date.now()):0);timer.unref?.();
 try{
  if(!Number.isFinite(expires)||expires<=Date.now()||signal?.aborted||!await check()||!await record('started',0))throw new DeliveryFailure('revoked');
 }catch(error){clearTimeout(timer);await prepared.close();throw error;}
 signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();
 return new ReadableStream({
  start(c){controller=c;},
  pull(c){return serialized(async()=>{
   if(done)return;
   try{
    if(signal?.aborted){await finish('interrupted');throw new DeliveryFailure('aborted');}
    if(expires<=Date.now()){await finish('expired');throw new DeliveryFailure('expired');}
    const checkpoint=offset===0||offset-lastCheckOffset>=1_048_576||Date.now()-lastCheckAt>=1000||offset+65536>=prepared.size;
    if(checkpoint&&!await check()){await finish('revoked');throw new DeliveryFailure('revoked');}
    const bytes=await prepared.read(offset,Math.min(65536,prepared.size-offset));
    // Close the validation-to-use gap after disk I/O.
    if(signal?.aborted||(checkpoint&&!await check())){await finish(signal?.aborted?'interrupted':'revoked');throw new DeliveryFailure('revoked');}
    if(checkpoint){lastCheckOffset=offset;lastCheckAt=Date.now();}
    if(offset+bytes.byteLength===prepared.size){
     if(!await record('stream_exhausted',prepared.size)){done=true;await cleanup();throw new DeliveryFailure('revoked');}
     done=true;await cleanup();offset=prepared.size;c.enqueue(bytes);c.close();
    }else {offset+=bytes.byteLength;c.enqueue(bytes);}
   }catch(error){if(!done)await finish(error instanceof DeliveryFailure&&error.code==='revoked'?'revoked':'storage_failed');throw error;}
  });},
  cancel(){return serialized(()=>finish('interrupted'));}
 },{highWaterMark:0});
}
