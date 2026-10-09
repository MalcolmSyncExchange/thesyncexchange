import { PgAuthority } from '../../workers/media/broker.mjs';
import { BrokerError } from './common.mjs';
const names=new Set(['create_execution_permit','request_execution','bind_execution','claim_targeted_job','resolve_execution_lease','complete_execution','read_execution','inspect_worker_output','heartbeat_job','resolve_worker_io','record_worker_output']);
export async function rpc(pool,name,args=[]){if(!names.has(name))throw new BrokerError('AUTH_DENIED');try{const c=await pool.connect();try{await c.query('begin');await c.query("set local statement_timeout='20s'; set local lock_timeout='5s'");const r=await c.query(`select submission_media.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args);await c.query('commit');return r.rows[0].value;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}catch(e){throw new BrokerError(['PERMIT_INVALID','JOB_NOT_ELIGIBLE','LEASE_STALE'].includes(e.message)?e.message:e.code==='40001'?'LEASE_STALE':e.code==='42501'?'PERMIT_INVALID':'TEMPORARY_SYSTEM_ERROR');}}
export class PermitAuthority extends PgAuthority {
 constructor(pool,context){super(pool);this.context=context;}
 tuple(l){return [this.context.permit_id,this.context.execution_name,l.job_id,l.lease_epoch,l.lease_token];}
 claim(){return rpc(this.pool,'claim_targeted_job',[this.context.permit_id,this.context.execution_name]);}
 complete(l,result,error=null){return rpc(this.pool,'complete_execution',[...this.tuple(l),result,error]);}
 async heartbeat(l){return this.withLease(l,async(_j,_r,_w,c)=>c.query('select submission_media.heartbeat_job($1,$2,$3)',[l.job_id,l.lease_epoch,l.lease_token]));}
 async withLease(l,body){const c=await this.pool.connect();try{
 await c.query('begin');await c.query("set local statement_timeout='20s'; set local lock_timeout='5s'");
 const resolve=async()=>{const r=await c.query('select submission_media.resolve_execution_lease($1,$2,$3,$4,$5) as value',this.tuple(l));return r.rows[0].value;};
 const record=async i=>c.query('select submission_media.record_worker_output($1,$2,$3,$4,$5,$6,$7)',[l.job_id,l.lease_epoch,l.lease_token,i.object_id,i.version,i.sha256,i.bytes]);
 this.client=c;const result=await body(await resolve(),resolve,record,c);await resolve();await c.query('commit');return result;
 }catch(e){await c.query('rollback');throw e instanceof BrokerError?e:new BrokerError(e.code==='40001'?'LEASE_STALE':'TEMPORARY_SYSTEM_ERROR');}finally{this.client=null;c.release();}}
 async inspectOutput(l){const args=[l.job_id,l.lease_epoch,l.lease_token];if(!this.client)return rpc(this.pool,'inspect_worker_output',args);const r=await this.client.query('select submission_media.inspect_worker_output($1,$2,$3) as value',args);return r.rows[0].value;}
}
