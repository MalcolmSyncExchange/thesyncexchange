// Dependency injection only: no credentials, grant arming or live request entrypoint.
const categories=new Set(['request_denied','configuration_rejected','invalid_body','service_unavailable','capabilities_unavailable','claim_failed','finalization_failed','delivery_accepted','grant_rejected','delivery_held']);
const claims=new Set(['not_attempted','unknown','empty','claimed']);
export async function runBoundedValidationDiagnostics({request,writeArtifact,cleanup=async()=>{},timeoutMs=15000,cleanupTimeoutMs=1000}) {
 const state={status:'running',checkpoint:'prepared',submissionStarted:false,responseReceived:false,httpStatus:null,responseCategory:'not_observed',handlerAcknowledgment:'not_observed',grantClaimOutcome:'unknown',failureCategory:null,timeout:false,cleanup:'pending',eventId:null};
 const controller=new AbortController();let timer;
 const save=()=>writeArtifact(structuredClone(state));
 const bounded=operation=>Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error();e.name='TimeoutError';reject(e);},timeoutMs);})]).finally(()=>clearTimeout(timer));
 try {
  await save();state.checkpoint='submission_started';state.submissionStarted=true;await save();
  const response=await bounded(()=>request({signal:controller.signal,timeoutMs}));
  const status=typeof response.status==='function'?response.status():response.status;
  if(!Number.isInteger(status)||status<100||status>599)throw Error();
  state.httpStatus=status;state.responseReceived=true;state.checkpoint='response_headers';await save();
  let body;
  try {body=await bounded(()=>response.json());}
  catch(error){if(error.name==='TimeoutError')throw error;state.responseCategory='non_json';const failure=new Error();failure.name='UnusableAcknowledgment';throw failure;}
  if(body&&categories.has(body.category)&&claims.has(body.claimOutcome)) {
   state.responseCategory=body.category;state.grantClaimOutcome=body.claimOutcome;
   state.handlerAcknowledgment='structured';
   if(typeof body.eventId==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.eventId))state.eventId=body.eventId;
   const accepted=status===200&&body.status==='accepted'&&body.category==='delivery_accepted'&&body.claimOutcome==='claimed'&&body.ingestionAcknowledged===true&&state.eventId;
   state.status=accepted?'passed':'failed';state.failureCategory=accepted?null:'handler_rejected_or_held';
  } else {state.responseCategory='unexpected_payload';state.status='failed';state.failureCategory='unusable_acknowledgment';}
 }catch(error){state.status='failed';state.timeout=error?.name==='TimeoutError';state.failureCategory=state.responseCategory==='non_json'?'unusable_acknowledgment':state.timeout?'timeout':state.responseReceived?'artifact_or_processing_failure':'request_or_artifact_failure';}
 finally {
  controller.abort();state.checkpoint='terminal';
  try {await save();}finally{
   let cleanupTimer;try{state.cleanup=await Promise.race([Promise.resolve().then(()=>cleanup()).then(()=> 'complete',()=> 'failed'),new Promise(resolve=>{cleanupTimer=setTimeout(()=>resolve('timeout'),cleanupTimeoutMs);})]);}finally{clearTimeout(cleanupTimer);}
   await save();
  }
 }
 return structuredClone(state);
}
