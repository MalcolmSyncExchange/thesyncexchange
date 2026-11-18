import { rpc } from './database.mjs';
import { requireValue,PROJECT,BrokerError,boundedJson } from './common.mjs';
import { accessToken } from './auth.mjs';
const JOB=`projects/${PROJECT}/locations/us-east5/jobs/media-worker-staging`;
export class DispatchAuthority {
 constructor(pool){this.pool=pool;}
 async dispatch(b,subject){const p=await rpc(this.pool,'create_execution_permit',[b.job_id,b.asset_id,b.job_type,b.profile,b.state,b.attempt,b.correlation_id,subject]);const request=await rpc(this.pool,'request_execution',[p.permit_id,subject]);return {...p,...request};}
 bind(permit,subject,execution){return rpc(this.pool,'bind_execution',[permit,subject,execution]);}
}
// Runs under the dispatcher identity, never under broker/worker identity.
export class Dispatcher {
 constructor(transport,cloud){this.transport=transport;this.cloud=cloud;}
 async dispatch(b){const p=await this.transport('/dispatch',b);
 if(p.invoke){try{const execution=await this.cloud.run(p.permit_id);await this.transport('/bind',{permit_id:p.permit_id,execution_name:execution});}catch{/* Unknown outcome: never repeat invocation. */}}
 else if(p.state==='requested'&&!p.execution_name){const executions=await this.cloud.find(p.permit_id);requireValue(executions.length<=1,'PERMIT_INVALID');if(executions.length===1)await this.transport('/bind',{permit_id:p.permit_id,execution_name:executions[0]});}
 return this.transport('/status',{permit_id:p.permit_id});}
}
export class CloudRunControl {
 constructor(config,fetcher=fetch,token=()=>accessToken()){this.config=config;this.fetcher=fetcher;this.token=token;}
 async api(path,options={}){requireValue(path.startsWith(JOB)||path.startsWith(`projects/${PROJECT}/locations/us-east5/operations/`),'TARGET_MISMATCH');const r=await this.fetcher('https://run.googleapis.com/v2/'+path,{...options,headers:{Authorization:'Bearer '+await this.token(),'content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new BrokerError('TEMPORARY_SYSTEM_ERROR');return boundedJson(r,1048576);}
 async run(permit){const operation=await this.api(JOB+':run',{method:'POST',body:JSON.stringify({overrides:{taskCount:1,containerOverrides:[{name:'worker',env:[{name:'EXECUTION_PERMIT_ID',value:permit}]}]}})});for(let i=0;i<5;i++){const o=await this.api(operation.name);if(o.done){requireValue(o.response?.name&&!o.error,'TEMPORARY_SYSTEM_ERROR');return o.response.name;}await new Promise(resolve=>setTimeout(resolve,1000));}throw new BrokerError('TEMPORARY_SYSTEM_ERROR');}
 async find(permit){const names=[];let page='';for(let n=0;n<5;n++){const result=await this.api(JOB+'/executions?pageSize=100'+(page?'&pageToken='+encodeURIComponent(page):''));for(const e of result.executions||[])if(e.template?.containers?.some(c=>c.env?.some(x=>x.name==='EXECUTION_PERMIT_ID'&&x.value===permit)))names.push(e.name);page=result.nextPageToken;if(!page)return names;}throw new BrokerError('TEMPORARY_SYSTEM_ERROR');}
}
