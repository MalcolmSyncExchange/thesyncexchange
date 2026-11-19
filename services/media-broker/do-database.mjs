import {AsyncLocalStorage} from 'node:async_hooks';
import {BrokerError,requireValue,uuid} from './common.mjs';
const names=new Set(['do_admit','do_observe','do_claim','do_resolve','do_charge','do_finish','do_settle','do_heartbeat','do_inspect','do_record','do_scope_status','do_health']);
export class DODatabase {
 constructor(pool,boot){requireValue(uuid(boot));this.pool=pool;this.boot=boot;this.scope=new AsyncLocalStorage();}
 async rpc(name,args=[]){requireValue(names.has(name));const client=this.scope.getStore()||this.pool;
 const bound=name==='do_health'?[this.boot]:name==='do_observe'?[this.boot,...args]:[args[0],this.boot,...args.slice(1)];
 try{return (await client.query(`select submission_media.${name}(${bound.map((_,i)=>'$'+(i+1)).join(',')}) value`,bound)).rows[0].value;}catch{throw new BrokerError('TEMPORARY_SYSTEM_ERROR');}}
 async transaction(body){const c=await this.pool.connect();try{await c.query('begin');await c.query("set local statement_timeout='20s';set local lock_timeout='5s'");const result=await this.scope.run(c,body);await c.query('commit');return result;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
}
export class DOAuthority {
 constructor(db,run){this.db=db;this.run=run;}
 claim(){return this.db.rpc('do_claim',[this.run]);}
 resolve(l){return this.db.rpc('do_resolve',[this.run,l.job_id,l.lease_epoch,l.lease_token]);}
 heartbeat(l){return this.db.rpc('do_heartbeat',[this.run,l.job_id,l.lease_epoch,l.lease_token]);}
 complete(l,result,error=null){return this.db.rpc('do_finish',[this.run,l.job_id,l.lease_epoch,l.lease_token,result,error]);}
 inspect(l){return this.db.rpc('do_inspect',[this.run,l.job_id,l.lease_epoch,l.lease_token]);}
 async withLease(l,body){
  // Each RPC owns its atomic live-fence check. Never hold its row locks while
  // awaiting the application transfer: that independent authority must lock
  // the same run before consuming a signed nonce or accessing private Storage.
  // A revoked transfer may leave only an unreferenced immutable private object;
  // post-I/O resolve, do_record and do_finish all reject its stale fence.
  const resolve=()=>this.resolve(l),record=i=>this.db.rpc('do_record',[this.run,l.job_id,l.lease_epoch,l.lease_token,i.object_id,i.version,i.sha256,i.bytes]);
  const result=await body(await resolve(),resolve,record);await resolve();return result;
 }

}
