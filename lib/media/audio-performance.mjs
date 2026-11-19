// Local-only bounded diagnostics: never audio bytes, names, paths, capabilities
// or credentials. No network transmission and no persistent storage.
const traces=new WeakMap(),stages=new Set(['selected','waveform_ready','reserve_started','reserved','upload_started','fingerprint_started','fingerprint_complete','session_started','session_ready','transfer_started','upload_complete','confirmed','validation_ready','server_waveform_ready','aac_ready']);
const clock=()=>globalThis.performance?.now?.()??0;
let sequence=0;
function emit(stage,start,detail){
 try{
  const p=globalThis.performance;if(!p?.measure)return;
  const own=p.getEntriesByType('measure').filter(e=>e.name.startsWith('tse.audio.'));
  if(own.length>=128)for(const name of new Set(own.map(e=>e.name)))p.clearMeasures(name);
  p.measure('tse.audio.'+stage,{start,end:clock(),detail});
 }catch{/* Diagnostics cannot affect upload or processing. */}
}
export function audioTrace(file){
 let trace=traces.get(file);if(trace)return trace;
 const id=++sequence,start=clock(),seen=new Set();
 trace={mark(stage){if(!stages.has(stage)||seen.has(stage))return;seen.add(stage);emit(stage,start,{trace:id,file_bytes:file.size,elapsed_ms:clock()-start});},patch(bytes,elapsed){if(!Number.isFinite(bytes)||bytes<0||!Number.isFinite(elapsed)||elapsed<0)return;emit('transfer_chunk',Math.max(0,clock()-elapsed),{trace:id,file_bytes:file.size,bytes,elapsed_ms:elapsed,bytes_per_second:elapsed>0?bytes*1000/elapsed:null});}};
 traces.set(file,trace);trace.mark('selected');return trace;
}
