// Private evidence only. Explicit key custody and scope are supplied by the caller.
// No credential discovery, network access, grant arming, or recovery POST exists here.
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {constants} from 'node:fs';
import {open,mkdir,lstat,readdir} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
const writers=new WeakSet(),limit=16*1024*1024;
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):value;
const canonical=value=>JSON.stringify(stable(value));
const digest=value=>createHash('sha256').update(value).digest('hex');
function validate(scope,keyRef){
 if(!scope||!/^[a-f0-9]{40}$/.test(scope.sourceCommit||'')||!['environmentId','operatorId','authorizationId','runId'].every(k=>typeof scope[k]==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(scope[k]))||!Number.isFinite(Date.parse(scope.executionStartedAt))||typeof keyRef!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(keyRef))throw Error('evidence_scope_rejected');
}
async function privateDirectory(directory){
 if(!isAbsolute(directory))throw Error('evidence_directory_rejected');
 const s=await lstat(directory);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==process.getuid())throw Error('evidence_directory_rejected');
}
async function syncDirectory(directory){const f=await open(directory,constants.O_RDONLY);try{await f.sync();}finally{await f.close();}}
async function keyFrom(provider,keyRef){try{const supplied=await provider(keyRef);if(!Buffer.isBuffer(supplied)||supplied.length!==32)throw Error();return Buffer.from(supplied);}catch{throw Error('evidence_key_rejected');}}
async function readRecord(path){
 const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await f.stat();if(!s.isFile()||s.nlink!==1||(s.mode&0o077)!==0||s.uid!==process.getuid()||s.size>limit)throw Error('evidence_file_rejected');return await f.readFile('utf8');}finally{await f.close();}
}
export async function readDurableExecutionEvidence({directory,keyProvider,keyRef,scope}){
 validate(scope,keyRef);await privateDirectory(directory);
 const names=(await readdir(directory)).sort();
 if(!names.length||names.some((name,i)=>name!==String(i).padStart(6,'0')+'.sealed'))throw Error('evidence_sequence_rejected');
 const key=await keyFrom(keyProvider,keyRef),records=[];let previous='0'.repeat(64);
 try{
  for(let i=0;i<names.length;i++){
   const bytes=await readRecord(join(directory,names[i])),envelope=JSON.parse(bytes);
   if(envelope.version!==1||envelope.index!==i||envelope.previous!==previous)throw Error('evidence_sequence_rejected');
   const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
   decipher.setAAD(Buffer.from(canonical({version:1,index:i,previous,scope,keyRef})));
   decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
   const payload=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString());
   if(i===0&&payload.kind!=='baseline')throw Error('evidence_baseline_missing');
   records.push(payload);previous=digest(bytes);
  }
  return {scope:structuredClone(scope),records,receipt:previous,recoveryMode:'read_only_never_resubmit'};
 }catch{throw Error('evidence_verification_failed');}finally{key.fill(0);}
}
export function createDurableExecutionEvidence({directory,keyProvider,keyRef,scope,fingerprintKey}){
 validate(scope,keyRef);
 if(!Buffer.isBuffer(fingerprintKey)||fingerprintKey.length!==32||typeof keyProvider!=='function')throw Error('evidence_key_rejected');
 const frozenScope=structuredClone(scope),comparisonKey=Buffer.from(fingerprintKey);let initialized=false,index=0,previous='0'.repeat(64),poisoned=false,busy=false;const kinds=new Set();
 const append=async(kind,data)=>{
  if(poisoned||busy)throw Error('evidence_writer_unavailable');busy=true;
  let key;
  try{
   if(kinds.has(kind)||kind==='authorization'&&!kinds.has('baseline')||kind==='single_post_intent'&&!kinds.has('authorization')||kinds.has('terminal'))throw Error('evidence_sequence_rejected');
   if(!initialized){
    if(kind!=='baseline')throw Error('evidence_baseline_missing');
    // Exclusive directory creation is the cross-process claim. Existing runs
    // cannot be reopened for writing, including runs interrupted before POST.
    await privateDirectory(join(directory,'..'));
    await mkdir(directory,{mode:0o700});initialized=true;await privateDirectory(directory);await syncDirectory(join(directory,'..'));
   }
   key=await keyFrom(keyProvider,keyRef);
   const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
   cipher.setAAD(Buffer.from(canonical({version:1,index,previous,scope:frozenScope,keyRef})));
   const plaintext=Buffer.from(JSON.stringify({kind,recordedAt:new Date().toISOString(),data}));
   if(plaintext.length>limit/2)throw Error('evidence_size_rejected');
   const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);plaintext.fill(0);
   const bytes=JSON.stringify({version:1,index,previous,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
   const f=await open(join(directory,String(index).padStart(6,'0')+'.sealed'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
   try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}
   await syncDirectory(directory);
   // Verify the actual durable bytes, key and scope before allowing progress.
   const verified=await readDurableExecutionEvidence({directory,keyProvider,keyRef,scope:frozenScope});
   if(verified.receipt!==digest(bytes)||verified.records.length!==index+1)throw Error('evidence_readback_failed');
   previous=verified.receipt;index++;kinds.add(kind);return {index:index-1,receipt:previous};
  }catch{poisoned=true;throw Error('evidence_write_failed');}finally{key?.fill(0);busy=false;}
 };
 const writer={
  matches:binding=>Object.entries(binding).every(([k,v])=>frozenScope[k]===v),
  baseline:async snapshot=>{const receipt=await append('baseline',{snapshot:structuredClone(snapshot),fingerprintKey:comparisonKey.toString('base64')});comparisonKey.fill(0);return receipt;},
  authorization:auth=>append('authorization',structuredClone(auth)),
  intent:()=>append('single_post_intent',{retryAllowed:false}),
  postflight:after=>append('postflight',structuredClone(after)),
  terminal:state=>append('terminal',state)
 };
 writers.add(writer);return writer;
}
export const isDurableExecutionEvidence=value=>writers.has(value);
// Mandatory preservation is independent of optional health diagnostics. Errors
// are reduced to fixed categories; URLs, credentials and provider bodies stay private.
export async function collectPostflightWithDiagnostics({collectSnapshot,readHealth,healthTimeoutMs=1000}){
 let result;
 try{result=await collectSnapshot();}catch{return {diagnostic:{status:'failed',failureCategory:'snapshot_collection_failed'}};}
 let optionalHealth='not_requested';
 if(readHealth){
  if(!Number.isInteger(healthTimeoutMs)||healthTimeoutMs<1||healthTimeoutMs>15000)throw Error('invalid_health_timeout');
  let timer;const controller=new AbortController();
  try{await Promise.race([Promise.resolve().then(()=>readHealth({signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error()),healthTimeoutMs);})]);optionalHealth='passed';}catch{optionalHealth='failed_or_timeout';}finally{clearTimeout(timer);controller.abort();}
 }
 return {...result,optionalHealth};
}

// Pair the private snapshot collector with the exact per-run HMAC key sealed in
// baseline evidence. Readers must be explicitly injected; no default credentials.
export async function createDurablePreservationSession(options){
 const {createStagingPreservationCollector}=await import('./staging-preservation-collector.mjs');
 if(typeof options.readerFactory!=='function')throw Error('evidence_reader_required');
 const fingerprintKey=randomBytes(32);
 const durableEvidence=createDurableExecutionEvidence({...options,fingerprintKey});
 const collect=async()=>createStagingPreservationCollector({reader:await options.readerFactory(),fingerprintKey}).collect({approvedAdminId:options.scope.operatorId,mode:'BOUNDED_EVENT_EXECUTION',executionAuthorization:options.scope.authorizationId});
 return {durableEvidence,collect};
}
export async function recoverDurablePreservation(options){
 const {createStagingPreservationCollector}=await import('./staging-preservation-collector.mjs');
 if(typeof options.readerFactory!=='function')throw Error('evidence_reader_required');
 const evidence=await readDurableExecutionEvidence(options),baseline=evidence.records[0].data;
 const fingerprintKey=Buffer.from(baseline.fingerprintKey,'base64');
 if(fingerprintKey.length!==32)throw Error('evidence_key_rejected');
 try{
  const after=await createStagingPreservationCollector({reader:await options.readerFactory(),fingerprintKey}).collect({approvedAdminId:options.scope.operatorId,mode:'BOUNDED_EVENT_EXECUTION',executionAuthorization:options.scope.authorizationId});
  const result={mode:'read_only_never_resubmit',receipt:evidence.receipt,postIntentRecorded:evidence.records.some(r=>r.kind==='single_post_intent'),diagnostic:after.diagnostic};
  // Private maps remain outside JSON/public report serialization.
  Object.defineProperties(result,{beforeSnapshot:{value:baseline.snapshot},afterSnapshot:{value:after.snapshot},authorization:{value:evidence.records.find(r=>r.kind==='authorization')?.data}});
  return result;
 }finally{fingerprintKey.fill(0);}
}
