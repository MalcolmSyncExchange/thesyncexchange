"""Local journal alerts only. Read-only, no credentials or lifecycle authority."""
import json,pathlib,time
def health(value,now):
 if not isinstance(value,dict) or type(value.get('sampled_at'))is not int or not 0<=now-value['sampled_at']<90000:
  return ['worker_unavailable']
 alerts=value.get('alerts')
 allowed={'worker_unavailable','health_evidence_missing','queue_stalled','processing_delayed','repeated_processing_failures','financial_evidence_missing','budget_approaching_exhaustion'}
 if not isinstance(alerts,list) or any(x not in allowed for x in alerts):return ['health_evidence_missing']
 return alerts
if __name__=='__main__':
 try:
  p=pathlib.Path('/run/tse-audio/status/runtime-status.json')
  value=json.loads(p.read_text()) if p.stat().st_size<65536 else None
 except (OSError,ValueError):value=None
 print(json.dumps({'audio_operational_alerts':health(value,int(time.time()*1000))}))
