// User-facing progress is derived only from immutable active-master relationships.
export function humanBytes(bytes){return Number.isFinite(bytes)&&bytes>=0?`${(bytes/1_000_000).toLocaleString('en-US',{maximumFractionDigits:1})} MB`:'Size unavailable';}
export function activeMaster(state){return state.files.filter(f=>f.role==='master'&&!f.retired).at(-1)||null;}
export function currentProcessing(state){
 const active=activeMaster(state);if(!active)return {stage:'Upload your master',state:'waiting',jobs:[]};
 const id=active.asset.id,related=state.derivatives.filter(a=>a.source_id===id&&(a.kind!=='buyer_preview'||a.start_ms===state.selection?.start_ms&&a.end_ms===state.selection?.end_ms)),ids=new Set([id,...related.map(a=>a.id)]),jobs=state.jobs.filter(j=>ids.has(j.asset_id));
 const pending=jobs.find(j=>['running','retry_wait','failed','queued'].includes(j.state));
 if(active.asset.state==='reserved')return {stage:'Upload your master',state:'waiting',jobs};
 const source=state.source?.id===id?state.source:null;
 const wave=related.find(a=>a.kind==='waveform'),preview=related.filter(a=>a.kind==='buyer_preview'&&a.start_ms===state.selection?.start_ms&&a.end_ms===state.selection?.end_ms).at(-1);
 const stage=source?.state!=='ready'?'Validating audio':wave?.state!=='ready'?'Generating waveform':preview?.state!=='ready'?'Generating preview':'Ready for review';
 return {stage,state:pending?.state||(stage==='Ready for review'?'succeeded':'queued'),jobs};
}
export function transferEstimate(samples,now,bytes,total){
 const recent=samples.filter(s=>s.at>=now-15000&&s.bytes<=bytes),first=recent[0];
 if(!first||now-first.at<2000||bytes<=first.bytes||bytes>=total)return null;
 const seconds=(total-bytes)/((bytes-first.bytes)/((now-first.at)/1000));return Number.isFinite(seconds)&&seconds>0?Math.ceil(seconds):null;
}
