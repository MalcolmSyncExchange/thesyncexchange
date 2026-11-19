export function operationalAlerts({queue,projectedUsd,ceilingUsd,available=true}){
 const alerts=[];
 if(!available)alerts.push('worker_unavailable');
 if(!queue||!Number.isFinite(queue.queue_depth)||!Number.isFinite(queue.oldest_queued_seconds)||!Number.isFinite(queue.running))alerts.push('health_evidence_missing');
 else{
  if(queue.queue_depth>0&&queue.oldest_queued_seconds>=120&&queue.running===0)alerts.push('queue_stalled');
  if(queue.oldest_queued_seconds>=300)alerts.push('processing_delayed');
  const total=queue.completed_24h+queue.failed_24h;
  if(total>=4&&queue.failed_24h/total>=.25)alerts.push('repeated_processing_failures');
 }
 if(!Number.isFinite(projectedUsd)||!Number.isFinite(ceilingUsd))alerts.push('financial_evidence_missing');
 else if(ceilingUsd-projectedUsd<.3)alerts.push('budget_approaching_exhaustion');
 return alerts;
}
