export function waveformTransfer(bytes,total){
 if(!Number.isFinite(bytes)||!Number.isFinite(total)||total<=0||bytes<0||bytes>total)return null;
 return Math.floor(bytes/total*100);
}
export function processingCopy(stage,state,reason){
 if(state==='paused')return {title:'Your track is safe. We’re holding its place.',detail:({operator_disabled:'Automatic processing is currently paused by the team.',window_expired:'The processing service is paused until its authorization is renewed.',accounting_closed:'Processing is paused while operating capacity is verified.',accounting_stale:'The worker has not reported a fresh health check. Processing will wait safely.',budget_reserved:'Processing capacity is reserved. Your recording will wait for available capacity.'})[reason]||'Processing is safely paused. You do not need to upload again.'};
 if(state==='failed')return {title:'This track needs another look.',detail:'Processing could not finish. Check the message below for a safe recovery action.'};
 if(state==='retry_wait')return {title:'Taking another pass…',detail:'A bounded retry is scheduled. Your uploaded recording is safe.'};
 if(state==='queued')return {title:'Your track is in line.',detail:'Waiting for a secure processing slot. This page updates automatically.'};
 return ({'Validating audio':{title:'Checking the frequencies…',detail:'Verifying audio format and integrity'},'Generating waveform':{title:'Giving your track some shape…',detail:'Generating your final waveform'},'Generating preview':{title:'Finding the good stuff…',detail:'Creating your selected audio preview'},'Ready for review':{title:'Sounds like we’re in business.',detail:'Your preview is ready'}})[stage]||{title:stage,detail:'Your recording stays private.'};
}
