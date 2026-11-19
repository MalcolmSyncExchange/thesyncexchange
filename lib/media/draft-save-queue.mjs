// Serialize committed revisions while coalescing rapid background save requests.
// The caller remains synchronous: editing/navigation never awaits ordinary saves.
export function serialDraftFlush(save){
 let running=null,again=false;
 return function flush(){
  again=true;
  if(!running)running=(async()=>{try{while(again){again=false;await save();}}finally{running=null;}})();
  return running;
 };
}
