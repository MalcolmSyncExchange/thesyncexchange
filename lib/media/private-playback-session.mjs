// Component-local, short-lived capability. Never persisted or shared across assets.
export function privatePlaybackSession(submission,asset,{fetcher=fetch,now=Date.now}={}){
 let value=null,inFlight=null,controller=null,closed=false;
 function clear(){value=null;controller?.abort();controller=null;inFlight=null;}
 async function get(){
  if(closed)throw Error('PLAYBACK_CLOSED');
  if(value&&value.expiresAt>now()+5000)return value.url;
  if(inFlight)return inFlight;
  const abort=new AbortController();controller=abort;
  const task=(async()=>{
   const response=await fetcher(`/api/media/${submission}/${asset}/original`,{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});
   if(!response.ok)throw Error('PLAYBACK_DENIED');
   const result=await response.json();
   if(result.assetId!==asset||typeof result.url!=='string'||!Number.isFinite(result.expiresAt)||result.expiresAt<=now()||result.expiresAt>now()+60000)throw Error('PLAYBACK_IDENTITY');
   const url=new URL(result.url);if(url.protocol!=='https:'||url.username||url.password)throw Error('PLAYBACK_URL');
   if(closed||abort.signal.aborted)throw Error('PLAYBACK_CLOSED');
   value=result;return result.url;
  })();
  inFlight=task;
  try{return await task;}catch(error){if(inFlight===task)value=null;throw error;}
  finally{if(inFlight===task){inFlight=null;controller=null;}}
 }
 return {activate:()=>{closed=false;},get,warm:()=>{void get().catch(()=>{});},clear,dispose:()=>{closed=true;clear();}};
}
