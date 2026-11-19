const valid = r => r && /^[a-f0-9-]{36}$/.test(r.source) && Number.isSafeInteger(r.start) && Number.isSafeInteger(r.end) && r.start>=0 && r.end>r.start && r.end-r.start<=60000;
const same=(a,b)=>a?.source===b?.source&&a?.start===b?.start&&a?.end===b?.end;
// Serial, durable intent + exact idempotency-key replay. No generation during dragging.
export function previewAutosave({read,save,generate,store,onState=()=>{},onRead=()=>{},delay=750,schedule=setTimeout,cancel=clearTimeout,key=()=>crypto.randomUUID()}){
 let desired=null,pending=null,flight=null,generationFlight=null,timer=null,error=null,disposed=false;
 try{const saved=store.read();if(saved){if(!valid(saved.desired)||saved.pending&&(!valid(saved.pending)||!Number.isSafeInteger(saved.pending.revision)||typeof saved.pending.key!=='string'))throw Error('Saved preview position needs recovery.');desired=saved.desired;pending=saved.pending;}}catch(e){error=e;}
 const emit=()=>onState({dirty:!!desired,saving:!!flight,error:error?.message||'',source:desired?.source});
 const persist=()=>store.write(desired?{desired,pending}:null);
 async function drain(background=false){
  while(desired){
   const target={...desired};
   let state=await read();const master=state.files.filter(f=>f.role==='master'&&!f.retired).at(-1)?.asset;
   if(master?.id!==target.source||state.source?.id!==target.source||state.source.state!=='ready')throw Error('The recording changed. Reload before saving the preview.');
   if(pending){if(pending.source!==master.id)throw Error('Interrupted save belongs to a different recording.');await save(pending);pending=null;persist();state=await read();}
   if(!same(target,{source:state.source.id,start:state.selection.start_ms,end:state.selection.end_ms})){
    pending={...target,revision:state.revision,key:key()};persist();await save(pending);pending=null;persist();state=await read();
   }
   onRead(state);
   if(same(target,desired)){desired=null;persist();}else if(background)return;
  }
 }
 async function flush({preview=false,background=false}={}){
  cancel(timer);if(error)throw error;
  if(!flight){flight=drain(background).catch(e=>{error=e;throw e;}).finally(()=>{flight=null;emit();});emit();}
  await flight;
  if(desired){if(background)return;return flush({preview});}
  if(preview){if(!generationFlight)generationFlight=(async()=>{const state=await read();onRead(state);await generate(state);})().finally(()=>{generationFlight=null;});await generationFlight;}
 }
 function update(region){if(!valid(region))throw Error('Invalid preview position');if(same(desired,region))return;desired={...region};try{persist();}catch(e){error=e;}cancel(timer);emit();if(!error&&!disposed)timer=schedule(()=>{flush({background:true}).catch(()=>{});},delay);}
 return {update,flush,retry:async()=>{if(error?.status===409){pending=null;persist();}error=null;emit();return flush();},snapshot:()=>({desired,pending,error:error?.message||''}),dispose:()=>{disposed=true;cancel(timer);},restore:()=>{disposed=false;emit();if(desired&&!error)timer=schedule(()=>{flush({background:true}).catch(()=>{});},delay);}};
}
