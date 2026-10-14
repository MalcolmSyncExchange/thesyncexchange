// Dependency injection only. No credentials, grant writes, event POST or live runner.
const checks=['validationEnabled','authorizationMatches','artistMatches','operatorMatches','grantUsable','stagingIdentityValid','globalAnalyticsDisabled','boundedConfigurationRecognized','paymentCapabilitiesOff'];
const steps=['admin_login','session_establishment','auth_get_user','canonical_admin_role','readiness_get_submission','readiness_http_response','readiness_json_validation'];
class Failure extends Error {constructor(category){super();this.category=category;}}
export function responseHttpStatus(response){
 const value=typeof response?.status==='function'?response.status():response?.status;
 if(!Number.isInteger(value)||value<100||value>599)throw new Failure('invalid_http_status');
 return value;
}
export async function runBoundedAuthReadinessDiagnostics({driver,expectedAdminId,writeArtifact,timeoutMs=15000,cleanupTimeoutMs=1000}){
 const state={status:'running',step:'prepared',lastConfirmedCheckpoint:null,failureCategory:null,timeoutCategory:null,cleanup:'pending',artifactPreserved:false,checkpoints:steps.map(step=>({step,state:'not_started',httpStatus:null,requestAttempted:false,responseObserved:false}))};
 const controller=new AbortController();let current;
 const save=async()=>{try{await writeArtifact(structuredClone(state));}catch{throw new Failure('artifact_write_failed');}};
 const bounded=async(operation,ms=timeoutMs)=>{let timer;try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Failure('step_timeout')),ms);})]);}finally{clearTimeout(timer);}};
 const start=async(step,requestAttempted=false)=>{state.step=step;current=state.checkpoints.find(x=>x.step===step);current.state='running';current.requestAttempted=requestAttempted;await save();};
 const confirmed=async()=>{current.state='passed';state.lastConfirmedCheckpoint=current.step;await save();};
 const observe=result=>{if(result?.httpStatus!==undefined){current.httpStatus=responseHttpStatus({status:result.httpStatus});current.responseObserved=true;}return result;};
 let response;
 try{
 await save();
 await start('admin_login',true);const login=observe(await bounded(()=>driver.login({signal:controller.signal})));if(current.httpStatus!==200||login?.authenticated!==true)throw new Failure('login_rejected');await confirmed();
 await start('session_establishment');const session=await bounded(()=>driver.inspectSession());if(session?.expired===true)throw new Failure('session_expired');if(session?.established!==true)throw new Failure('session_missing');await confirmed();
 await start('auth_get_user',true);const user=observe(await bounded(()=>driver.getUser({signal:controller.signal})));if(current.httpStatus!==200||user?.verified!==true||user?.userId!==expectedAdminId)throw new Failure('auth_user_rejected');await confirmed();
 await start('canonical_admin_role',true);const profile=observe(await bounded(()=>driver.getCanonicalRole({signal:controller.signal})));if(current.httpStatus!==200||profile?.role!=='admin')throw new Failure('canonical_role_rejected');await confirmed();
 await start('readiness_get_submission',true);
 // Save submission intent before the single driver call. No retry path exists.
 const pending=Promise.resolve().then(()=>driver.readinessGet({signal:controller.signal}));pending.catch(()=>{});await confirmed();
 await start('readiness_http_response',true);response=await bounded(()=>pending);current.responseObserved=true;current.httpStatus=responseHttpStatus(response);await save();if(current.httpStatus!==200)throw new Failure('readiness_http_rejected');await confirmed();
 await start('readiness_json_validation');let body;try{body=await bounded(()=>response.json());}catch(error){if(error instanceof Failure)throw error;throw new Failure('readiness_invalid_json');}
 if(body?.status!=='ready'||body?.ready!==true||!checks.every(key=>body[key]===true))throw new Failure('readiness_checks_rejected');
 // No raw body, headers, cookies, errors or identity values enter artifacts.
 await confirmed();state.status='passed';
 }catch(error){state.status='failed';state.failureCategory=error instanceof Failure?error.category:'operation_failed';if(current)current.state='failed';if(state.failureCategory==='step_timeout'){state.timeoutCategory=state.step;controller.abort();}}
 finally{
 controller.abort();state.step='terminal';
 try{await save();}catch{state.status='failed';state.failureCategory='artifact_write_failed';}
 try{await bounded(()=>driver.cleanup(),cleanupTimeoutMs);state.cleanup='complete';}catch(error){state.cleanup=error instanceof Failure&&error.category==='step_timeout'?'timeout':'failed';if(state.status==='passed'){state.status='failed';state.failureCategory='cleanup_failed';}}
 state.artifactPreserved=true;try{await save();}catch{state.artifactPreserved=false;state.status='failed';state.failureCategory='artifact_write_failed';}
 }
 return structuredClone(state);
}
