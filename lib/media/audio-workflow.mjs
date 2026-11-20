export function waveformTransfer(bytes,total){
 if(!Number.isFinite(bytes)||!Number.isFinite(total)||total<=0||bytes<0||bytes>total)return null;
 return Math.floor(bytes/total*100);
}
export function processingCopy(stage,state,reason){
 if(state==='paused')return {title:'Your track is safe. We’re holding its place.',detail:({operator_disabled:'Automatic processing is currently paused by the team.',window_expired:'The processing service is paused until its authorization is renewed.',accounting_closed:'Processing is paused while operating capacity is verified.',accounting_stale:'The worker has not reported a fresh health check. Processing will wait safely.',budget_reserved:'Processing capacity is reserved. Your recording will wait for available capacity.'})[reason]||'Processing is safely paused. You do not need to upload again.'};
 if(state==='failed')return {title:'This track needs another look.',detail:'Processing could not finish. Check the message below for a safe recovery action.'};
 if(state==='retry_wait')return {title:'Taking another pass…',detail:'A bounded retry is scheduled. Your uploaded recording is safe.'};
 if(state==='queued')return {title:'Warming up the studio…',detail:'Your recording is waiting for secure processing.'};
 return ({'Validating audio':{title:'Checking the frequencies…',detail:'Verifying your audio file and integrity'},'Generating waveform':{title:'Giving your track some shape…',detail:'Generating your final waveform'},'Generating preview':{title:'Cooking up your preview…',detail:'Creating your 30-second Public Preview'},'Ready for review':{title:'Sounds like we’re in business.',detail:'Your recording is ready'}})[stage]||{title:stage,detail:'Your recording stays private.'};
}

// Presentation only: never grants admission or changes the server's stage/state.
export function recordingPresentation({stage='',state='',local=false,analyzed=false,transfer=false,paused=false,unavailable=false}={}) {
 const label=transfer?(paused?'Upload paused':'Uploading recording'):local?(analyzed?'Ready to upload':'Preparing waveform'):unavailable?'Checking saved status':({'Generating waveform':'Generating final waveform','Generating preview':'Creating AAC preview'})[stage]||stage||'Choose your recording';
 return {label,animate:state==='running'&&!local&&!transfer&&!paused&&!unavailable};
}

// Each completion comes from the current master, never a retired file or a
// simulated percentage. A stage without an issued job stays waiting.
export function studioStages(state,{localPending=false,transferring=false,paused=false,unavailable=false}={}) {
 const master=state.files.findLast(f=>!f.retired&&f.role==='master')?.asset;
 const source=!localPending&&state.source?.id===master?.id?state.source:null;
 const wave=source?(state.waveform?.source_id===source.id?state.waveform:state.derivatives.find(a=>a.kind==='waveform'&&a.source_id===source.id)):null;
 const done=[!localPending&&!!master&&['uploaded','verifying','ready','failed'].includes(master.state),source?.state==='ready',wave?.state==='ready'];
 const targets=[master,source||master,wave];
 const labels=['Uploading','Verifying audio','Generating waveform','Ready'];
 const first=done.findIndex(v=>!v),current=first<0?3:first;
 return labels.map((label,i)=>{
  let status=i<current?'completed':'waiting';
  if(i===current){
   const target=targets[i];
   const job=target&&state.jobs.find(j=>j.asset_id===target.id&&['running','failed','retry_wait','queued'].includes(j.state));
   if(i===3)status='completed';
   else if(!localPending&&(job?.state==='failed'||target?.state==='failed'))status='failed';
   else if(unavailable||i===0&&paused||!localPending&&job?.state!=='running'&&!!state.processing?.paused_reason)status='paused';
   else if(i===0&&transferring||!localPending&&job?.state==='running')status='active';
  }
  return {label,state:status};
 });
}

// Recording readiness does not assert AAC readiness or SEC eligibility.
export function recordingProcessing(state){
 const master=state.files.findLast(f=>!f.retired&&f.role==='master')?.asset;
 const source=master&&state.source?.id===master.id?state.source:null;
 const waveform=source?(state.waveform?.source_id===source.id?state.waveform:state.derivatives.find(a=>a.kind==='waveform'&&a.source_id===source.id)):null;
 if(source?.state==='ready'&&waveform?.state==='ready')return {stage:'Ready for review',state:'succeeded',jobs:[]};
 const ids=new Set([master?.id,waveform?.id]);
 const jobs=state.jobs.filter(j=>ids.has(j.asset_id));
 const stage=master?.state==='reserved'?'Upload your master':source?.state==='ready'?'Generating waveform':'Validating audio';
 const pending=['running','failed','retry_wait','queued'].map(s=>jobs.find(j=>j.state===s)).find(Boolean);
 const failed=(source?.state==='ready'?waveform:source||master)?.state==='failed';
 const paused=!!state.processing?.paused_reason&&pending?.state!=='running'&&pending?.state!=='failed'&&master?.state!=='reserved';
 return {stage,state:failed?'failed':paused?'paused':pending?.state||'waiting',jobs};
}
