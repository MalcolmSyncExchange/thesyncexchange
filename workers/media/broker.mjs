import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat, mkdir, chmod } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { hashFile } from './media.mjs';
import { deny, MediaError } from './errors.mjs';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function lease(value) {
  if(!value || Object.keys(value).sort().join(',')!=='job_id,lease_epoch,lease_token'||!uuid.test(value.job_id)||!uuid.test(value.lease_token)||!Number.isSafeInteger(value.lease_epoch)||value.lease_epoch<1) deny();
  return [value.job_id,value.lease_epoch,value.lease_token];
}
export const leaseOf = job => ({job_id:job.job_id,lease_epoch:job.lease_epoch,lease_token:job.lease_token});
// Pool is an injected broker-only PostgreSQL connection. The worker never owns it.
export class PgAuthority {
  constructor(pool) {this.pool=pool;}
  async rpc(name,args=[]) {
    const allowed=['claim_job','heartbeat_job','complete_job'];if(!allowed.includes(name))deny();
    try {const r=await this.pool.query(`select submission_media.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args);return r.rows[0].value;}
    catch(error){throw new MediaError(error.code==='40001'?'worker_lease_expired':'temporary_system_error');}
  }
  claim() {return this.rpc('claim_job');}
  heartbeat(l) {return this.rpc('heartbeat_job',lease(l));}
  complete(l,result,error=null) {return this.rpc('complete_job',[...lease(l),result,error]);}
  async withLease(l,body) {
    const client=await this.pool.connect();
    try {
      await client.query('begin');await client.query("set local statement_timeout='20s'; set local lock_timeout='5s'");
      const resolve=async()=>{const r=await client.query('select submission_media.resolve_worker_io($1,$2,$3) as value',lease(l));return r.rows[0].value;};
      const record=async identity=>{await client.query('select submission_media.record_worker_output($1,$2,$3,$4,$5,$6,$7)',[...lease(l),identity.object_id,identity.version,identity.sha256,identity.bytes]);};
      const job=await resolve();const result=await body(job,resolve,record);await resolve();await client.query('commit');return result;
    } catch(error) {await client.query('rollback');throw error instanceof MediaError?error:new MediaError(error.code==='40001'?'worker_lease_expired':'temporary_system_error');}
    finally {client.release();}
  }
}
// Broker is a separate trust boundary. Worker-facing requests contain only a lease
// and an opaque one-use capability, never destinations, credentials, URLs or paths.
export class MediaBroker {
  #outputs=new Map();
  constructor(authority,storage) {this.authority=authority;this.storage=storage;}
  claim() {return this.authority.claim();}
  heartbeat(l) {return this.authority.heartbeat(l);}
  async read(l,target,signal) {
    lease(l);
    const job=await this.authority.withLease(l,async value=>value),input=job.source||job;
    await this.storage.readExact(input,target,signal);
    const facts=await hashFile(target,job.source?250_000_000:job.max_bytes);
    if(facts.actual_bytes!==Number(input.bytes)||(input.sha256&&facts.sha256!==input.sha256))throw new MediaError('checksum_mismatch');
    await this.authority.withLease(l,async value=>{
      const current=value.source||value;
      if(value.asset_id!==job.asset_id||value.profile!==job.profile||current.object_id!==input.object_id||current.version!==input.version)deny();
    });
    return job;
  }
  async authorizeOutput(l) {
    lease(l);
    return this.authority.withLease(l,async job=>{
      if(!['waveform_generation','preview_generation'].includes(job.job_type)||job.bucket!=='submission-derived'||job.object_id!==null)deny();
      for(const [id,c] of this.#outputs)if(c.expires<Date.now())this.#outputs.delete(id);
      if(this.#outputs.size>=16)throw new MediaError('temporary_system_error');
      const capability=randomUUID();this.#outputs.set(capability,{lease:l,job,expires:Date.now()+30000});return capability;
    });
  }
  async writeOutput(l,capability,path,signal) {
    lease(l);const c=this.#outputs.get(capability);this.#outputs.delete(capability);
    if(!c||c.expires<Date.now()||c.lease.job_id!==l.job_id||c.lease.lease_epoch!==l.lease_epoch||c.lease.lease_token!==l.lease_token)deny();
    const facts=await hashFile(path,c.job.max_bytes);
    // Staging bytes grants no authority. The row lock and live expiry are checked
    // immediately before create; independent recheck follows object observation.
    return this.authority.withLease(l,async(job,recheck,record)=>{
      if(job.asset_id!==c.job.asset_id||job.profile!==c.job.profile||job.bucket!==c.job.bucket||job.path!==c.job.path)deny();
      await recheck();const identity=job.output?await this.storage.inspectExact(job.output):await this.storage.createExact(job,path,facts,signal);
      if(identity.sha256!==facts.sha256||identity.bytes!==facts.actual_bytes)throw new MediaError('checksum_mismatch');
      await recheck();await record(identity);return identity;
    });
  }
  async complete(l,result) {
    lease(l);
    if(!result||Buffer.byteLength(JSON.stringify(result))>4096)throw new MediaError('validation_failed');
    await this.authority.withLease(l,async job=>{
      if(job.source&&(!job.output||job.output.lease_epoch!==l.lease_epoch||job.output.sha256!==result.sha256||Number(job.output.bytes)!==result.actual_bytes))deny();
    });
    return this.authority.complete(l,result);
  }
  fail(l,code) {
    lease(l);
    if(!['validator_timeout','temporary_system_error','storage_identity_mismatch','checksum_mismatch','worker_lease_expired','unsupported_format','file_too_large','audio_unreadable','no_audio_frames','unsupported_audio_configuration','waveform_generation_failed','preview_generation_failed','artwork_invalid'].includes(code))throw new MediaError('validation_failed');
    return this.authority.complete(l,{},code);
  }
}
// Local-only disposable byte adapter. No hosted Storage implementation is enabled.
// Metadata observer must use the exact trusted destination, with INSERT not UPSERT.
export class LocalObjects {
  constructor(root,observe) {this.root=root;this.observe=observe;this.objects=new Map();this.destinations=new Map();}
  async register(identity,path) {
    if(!uuid.test(identity.object_id)||!identity.version)deny();this.objects.set(identity.object_id,{...identity,path});
  }
  async readExact(identity,target,signal) {
    const o=this.objects.get(identity.object_id);if(!o||o.version!==identity.version||Number(identity.bytes)!==(await stat(o.path)).size)deny();
    const f=await open(target,'wx',0o600);
    try {await pipeline(createReadStream(o.path),f.createWriteStream(),{signal});}finally{await f.close();}
  }
  async inspectExact(identity) {
    if(!uuid.test(identity.object_id)||!identity.version)deny();const path=this.objects.get(identity.object_id)?.path||this.root+'/'+identity.object_id;
    const facts=await hashFile(path,4e6);if(facts.sha256!==identity.sha256||facts.actual_bytes!==Number(identity.bytes))deny();return {...identity,bytes:facts.actual_bytes};
  }
  async createExact(job,path,facts,signal) {
    if(signal?.aborted)deny();const dest=job.bucket+'/'+job.path;
    if(this.destinations.has(dest))deny();
    await mkdir(this.root,{recursive:true,mode:0o700});const object_id=randomUUID(),version=randomUUID(),output=this.root+'/'+object_id;
    // Broker-owned copy avoids trusting a mutable worker file after hashing it.
    const f=await open(output,'wx',0o600);try{await pipeline(createReadStream(path),f.createWriteStream(),{signal});}finally{await f.close();}
    const observed=await hashFile(output,job.max_bytes);if(observed.sha256!==facts.sha256||observed.actual_bytes!==facts.actual_bytes)throw new MediaError('checksum_mismatch');
    await chmod(output,0o400);const identity={object_id,version,bytes:observed.actual_bytes,sha256:observed.sha256};
    // A failed/uncertain metadata observation retains a private, unreferenced blob.
    await this.observe(job,identity);this.destinations.set(dest,object_id);this.objects.set(object_id,{...identity,path:output});return identity;
  }
}
