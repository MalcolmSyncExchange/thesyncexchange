import {setTimeout as wait} from 'node:timers/promises';

// Only confirmed settlement earns an immediate next pass. Idle, uncertainty,
// failures and accounting pauses retain backoff; every pass rechecks authority.
export function dispatchDelay(result){return result?.state==='completed'?0:5000;}
export async function dispatchLoop({dispatcher,verify,signal,sleep=(ms,signal)=>wait(ms,undefined,{signal}),onResult=()=>{}}){
 while(!signal.aborted){
  await verify();
  const result=await dispatcher.once(signal);
  onResult(result);
  const delay=dispatchDelay(result);
  if(delay&&!signal.aborted)try{await sleep(delay,signal);}catch(error){if(!signal.aborted)throw error;}
 }
}
