// Reuses the retained one-shot/reconciliation state machine.
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {requireValue,BoundedStream} from './common.mjs';
import {pipeline} from 'node:stream/promises';
export class RootLauncher {
 constructor(socket='/run/tse-audio/control/launcher.sock'){this.socket=socket;}
 async call(action,value){const body=Buffer.from(JSON.stringify(value)),r=http.request({socketPath:this.socket,method:'POST',path:'/'+action,agent:false,signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json','content-length':String(body.length)}});const response=new Promise((resolve,reject)=>{r.on('response',resolve);r.on('error',reject);});r.end(body);const res=await response;requireValue(res.statusCode===200);const parts=[];await pipeline(res,new BoundedStream(4096),async src=>{for await(const b of src)parts.push(b);});return JSON.parse(Buffer.concat(parts));}
 status(run_id){return this.call('status',{run_id});}
 start(context){return this.call('start',context);}
 stop(run_id){return this.call('stop',{run_id});}
}
export class DODispatcher {
 constructor({db,broker,launcher,digest,syncUsage,log=()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms))}){Object.assign(this,{db,broker,launcher,digest,syncUsage,log,sleep});this.busy=false;}
 async once(signal){if(this.busy)return {state:'busy'};this.busy=true;let context;
  try{
   const existing=await this.db.rpc('do_scope_status',[null]);
   if(existing.state==='issued')return await this.recover(existing);
   const budget=await this.syncUsage();if(!budget.enabled||budget.paused)return {state:budget.enabled?'budget_or_accounting_paused':'operator_disabled'};
   const run=await this.db.rpc('do_admit',[randomUUID(),this.digest]);
   if(run.state!=='issued')return run;
   const prior=await this.launcher.status(run.run_id);
   // Restart recovery never starts a previously issued operation again. The
   // root launcher is authoritative about process death before lease release.
   if(run.recovery)return await this.recover(run);
   requireValue(prior.state==='NONE');
   if(!(await this.db.rpc('do_scope_status',[run.run_id])).authorized)return await this.recover(run);
   context=this.broker.bind(run.run_id,this.digest);
   let launched;try{launched=await this.launcher.start(context);}catch{return {state:'uncertain_launch',run_id:run.run_id};}
   requireValue(['RUNNING','EXITED'].includes(launched.state));
   while((await this.launcher.status(run.run_id)).state==='RUNNING'){
    let authorized=false;try{authorized=(await this.db.rpc('do_scope_status',[run.run_id])).authorized===true;}catch{/* Losing authority stops the process; reservation stays until reconciliation. */}
    if(signal?.aborted||!authorized){await this.launcher.stop(run.run_id);break;}
    await this.sleep(1000);
   }
   requireValue((await this.launcher.status(run.run_id)).state==='EXITED');return await this.db.rpc('do_settle',[run.run_id]);
  }finally{if(context)this.broker.revoke();this.busy=false;}
 }
 async recover(run){const prior=await this.launcher.status(run.run_id);if(prior.state==='RUNNING')await this.launcher.stop(run.run_id);const checked=await this.launcher.status(run.run_id);requireValue(['EXITED','NONE'].includes(checked.state));return this.db.rpc('do_settle',[run.run_id]);}
}
