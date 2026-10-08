import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leaseOf } from './broker.mjs';
import { validateSource, validateArtwork, waveform, preview, region } from './media.mjs';
import { safeError, MediaError } from './errors.mjs';
const profiles={source_validation:'source-validator-v1',legacy_source_verification:'source-validator-v1',artwork_validation:'artwork-validator-v1',waveform_generation:'waveform-minmax-v1',preview_generation:'preview-aac-lc-v1'};
export async function runOne(broker,tools,buildDigest,log=()=>{}) {
  if(!/^sha256:[a-f0-9]{64}$/.test(buildDigest))throw new MediaError('temporary_system_error');
  await tools.verify();const claimed=await broker.claim();if(!claimed)return {state:'idle'};
  const l=leaseOf(claimed),controller=new AbortController();let leaseLost=false, heartbeatRunning=false;
  const heartbeat=setInterval(async()=>{if(heartbeatRunning)return;heartbeatRunning=true;try{await broker.heartbeat(l);}catch{leaseLost=true;controller.abort();}finally{heartbeatRunning=false;}},30000);
  const deadline=setTimeout(()=>controller.abort(),540000);
  const directory=await mkdtemp(join(tmpdir(),'tse-media-'));const input=join(directory,'input'),output=join(directory,'output');
  try {
    const job=await broker.read(l,input,controller.signal);
    if(job.asset_id!==claimed.asset_id||job.job_type!==claimed.job_type||job.profile!==profiles[job.job_type]||job.profile!==claimed.profile)throw new MediaError('worker_lease_expired');
    let result;
    switch(job.job_type) {
      case 'source_validation':case 'legacy_source_verification':result=await validateSource(tools,input,controller.signal);break;
      case 'artwork_validation':result=await validateArtwork(tools,input,controller.signal);break;
      case 'waveform_generation':result=await waveform(tools,input,job.source,job.source,output,controller.signal);break;
      case 'preview_generation': {
        const [start,end]=region(job.source,job.region_start_ms,job.region_end_ms);
        if(start!==job.start_sample||end!==job.end_sample)throw new MediaError('preview_generation_failed');
        result=await preview(tools,input,job.source,job.region_start_ms,job.region_end_ms,output,controller.signal);break;
      }
      default:throw new MediaError('worker_lease_expired');
    }
    if(leaseLost)throw new MediaError('worker_lease_expired');
    if(job.source) {const c=await broker.authorizeOutput(l);await broker.writeOutput(l,c,output,controller.signal);}
    const outcome=await broker.complete(l,{...result,build_digest:buildDigest});
    log({job_id:job.job_id,asset_id:job.asset_id,profile:job.profile,state:'completed'});return outcome;
  } catch(error) {
    const safe=safeError(error);if(!leaseLost&&safe.code!=='worker_lease_expired')await broker.fail(l,safe.code==='validation_failed'?'audio_unreadable':safe.code);
    log({job_id:l.job_id,state:'failed',code:safe.code});throw safe;
  } finally {clearInterval(heartbeat);clearTimeout(deadline);controller.abort();await rm(directory,{recursive:true,force:true});}
}
