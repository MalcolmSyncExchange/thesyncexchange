// Planning only: no provider SDK, provisioning authority, credentials or network.
// A future operator must explicitly authorize every additional verified worker.
export function scalingDecision(metrics,policy){
 const number=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 if(!metrics||!policy||!['queueDepth','oldestSeconds','meanStageSeconds','utilization','headroomUsd','running','idleSeconds','sampleAgeSeconds'].every(k=>number(metrics[k]))||metrics.utilization>1||!Number.isInteger(metrics.queueDepth)||!Number.isInteger(metrics.running)||!Number.isInteger(policy.authorizedWorkers)||policy.authorizedWorkers<0||policy.authorizedWorkers>32||!Number.isInteger(policy.maxWorkers)||policy.maxWorkers<0||policy.maxWorkers>32||!number(policy.reservationUsd)||policy.reservationUsd<=0||!number(policy.safetyReserveUsd))throw Error('SCALING_EVIDENCE_REQUIRED');
 if(metrics.sampleAgeSeconds>90)return {admit:false,targetWorkers:0,provision:false,reason:'stale_health'};
 const capacity=Math.floor(Math.max(0,Math.floor(metrics.headroomUsd*1e6)-Math.ceil(policy.safetyReserveUsd*1e6))/Math.ceil(policy.reservationUsd*1e6));
 if(!capacity)return {admit:false,targetWorkers:0,provision:false,reason:'budget_capacity',drain:metrics.running>0};
 const ceiling=Math.min(policy.authorizedWorkers,policy.maxWorkers,capacity);
 const pressure=metrics.queueDepth>=10||metrics.oldestSeconds>=60||metrics.utilization>=.8;
 const desired=metrics.queueDepth?Math.max(1,Math.ceil(metrics.queueDepth*Math.max(1,metrics.meanStageSeconds)/60)):metrics.idleSeconds<300||metrics.running?1:0;
 return {admit:ceiling>0,targetWorkers:desired===0?0:Math.min(ceiling,pressure?desired:1),provision:false,reason:desired>ceiling?'authorized_capacity_limit':metrics.queueDepth?'queue_demand':'idle',drain:metrics.running>ceiling};
}
