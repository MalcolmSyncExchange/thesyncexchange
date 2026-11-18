// User-facing progress is derived only from immutable active-master relationships.
export function humanBytes(bytes){return Number.isFinite(bytes)&&bytes>=0?`${(bytes/1_000_000).toLocaleString('en-US',{maximumFractionDigits:1})} MB`:'Size unavailable';}
export function activeMaster(state){return state.files.filter(f=>f.role==='master'&&!f.retired).at(-1)||null;}
export function currentMedia(state){const id=activeMaster(state)?.asset.id,source=state.source?.id===id?state.source:null;return {source,waveform:source&&state.waveform?.source_id===id?state.waveform:null,previews:source?state.derivatives.filter(a=>a.kind==='buyer_preview'&&a.source_id===id&&a.start_ms===state.selection?.start_ms&&a.end_ms===state.selection?.end_ms):[]};}
export function currentProcessing(state){
 const active=activeMaster(state);if(!active)return {stage:'Upload your master',state:'waiting',jobs:[]};
 const id=active.asset.id,related=state.derivatives.filter(a=>a.source_id===id&&(a.kind!=='buyer_preview'||a.start_ms===state.selection?.start_ms&&a.end_ms===state.selection?.end_ms)),ids=new Set([id,...related.map(a=>a.id)]),jobs=state.jobs.filter(j=>ids.has(j.asset_id));
 const pending=['running','failed','retry_wait','queued'].map(state=>jobs.find(j=>j.state===state)).find(Boolean);
 if(active.asset.state==='reserved')return {stage:'Upload your master',state:'waiting',jobs};
 const source=state.source?.id===id?state.source:null;
 const wave=related.find(a=>a.kind==='waveform'),preview=related.filter(a=>a.kind==='buyer_preview'&&a.start_ms===state.selection?.start_ms&&a.end_ms===state.selection?.end_ms).at(-1);
 let stage=source?.state!=='ready'?'Validating audio':wave?.state!=='ready'?'Generating waveform':preview?.state!=='ready'?'Generating preview':'Ready for review';
 if(pending?.state==='running'){const target=related.find(a=>a.id===pending.asset_id);stage=target?.kind==='buyer_preview'?'Generating preview':target?.kind==='waveform'?'Generating waveform':'Validating audio';}
 if(state.processing?.paused_reason&&stage!=='Ready for review'&&pending?.state!=='running'&&pending?.state!=='failed')return {stage:'Waiting for processing',state:'paused',jobs};
 return {stage,state:pending?.state||(stage==='Ready for review'?'succeeded':'queued'),jobs};
}
export function transferEstimate(samples,now,bytes,total){
 const recent=samples.filter(s=>s.at>=now-15000&&s.bytes<=bytes),first=recent[0];
 if(!first||now-first.at<2000||bytes<=first.bytes||bytes>=total)return null;
 const seconds=(total-bytes)/((bytes-first.bytes)/((now-first.at)/1000));return Number.isFinite(seconds)&&seconds>0?Math.ceil(seconds):null;
}

export function readinessActions(state){
 const master=activeMaster(state),actions=[];
 if(!master)actions.push('Upload your master recording');
 else if(master.asset.state==='reserved')actions.push('Finish or resume your master upload');
 else if(master.asset.state==='failed')actions.push('Retry processing or replace the master');
 if(!state.metadata)actions.push('Add your track details');
 if(state.derivatives.some(a=>a.kind==='buyer_preview'&&a.source_id===master?.asset.id&&a.state==='ready'&&!a.accepted&&a.start_ms===state.selection?.start_ms&&a.end_ms===state.selection?.end_ms))actions.push('Listen to and accept your preview');
 if(state.files.some(f=>!f.retired&&f.role!=='master'&&['reserved','failed','expired'].includes(f.asset.state)))actions.push('Finish or remove incomplete additional files');
 return actions;
}

export function processingPollDelay(state,failures=0){if(failures)return Math.min(60000,3000*2**Math.min(5,failures));if(!state)return 5000;const current=currentProcessing(state);return current.state==='paused'?30000:current.state==='succeeded'?60000:current.state==='waiting'?15000:current.state==='failed'?10000:2000;}
