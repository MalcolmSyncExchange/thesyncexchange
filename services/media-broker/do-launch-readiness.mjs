import {boundedJson} from './common.mjs';

const endpoint='https://thesyncexchange.com/api/media/worker-launch';
// No proof, signing key, permit or job identifier is sent. The exact denied
// response proves application readiness, never authority to launch a parser.
export function launchReadiness({fetcher=fetch,now=Date.now,timeoutMs=10000}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('INVALID_READINESS_BOUND');
 let checkedAt=-1,until=0;
 return async signal=>{
  if(signal?.aborted)return false;
  const time=now();if(!Number.isSafeInteger(time)||time<0)return false;
  if(time>=checkedAt&&time<until)return true;
  checkedAt=-1;until=0;
  let response;
  try{
   response=await fetcher(endpoint,{method:'POST',body:'{}',headers:{'content-type':'application/json'},credentials:'omit',redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])])});
   if(response.status!==403||response.redirected||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||''))return false;
   const body=await boundedJson(response,256);
   if(!body||Object.keys(body).length!==1||body.authorized!==false||signal?.aborted)return false;
   checkedAt=now();if(!Number.isSafeInteger(checkedAt)||checkedAt<time)return false;
   until=checkedAt+30000;return true;
  }catch{return false;}finally{try{await response?.body?.cancel();}catch{/* Already consumed, canceled or locked by the bounded reader. */}}
 };
}
