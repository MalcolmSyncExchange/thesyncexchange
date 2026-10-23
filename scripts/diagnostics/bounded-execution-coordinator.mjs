// Explicitly supplied private driver/snapshots only. No credential lookup,
// grant arming, hosted URL entrypoint, deployment or automatic retry.
import {runBoundedAuthReadinessDiagnostics} from './bounded-auth-readiness-harness.mjs';
import {runBoundedValidationDiagnostics} from './bounded-validation-harness.mjs';
import {preservationDomains,comparePreservationSnapshots} from './postflight-preservation.mjs';
import {createServerActionRehearsalDriver} from './server-action-rehearsal-adapter.mjs';
import {isDurableExecutionEvidence} from './durable-execution-evidence.mjs';
const approved={executionAuthorization:'a2926e46-df3b-4631-807e-4643e1f8c1f5',approvedAdminId:'6faee3df-7b4b-4d63-ba8d-1275139ccff5',artistId:'9e61c9ea-ed51-4328-8937-0b989dece2c9'};
// Same browser context and Origin header; empty body, never arbitrary properties.
export function createBoundedExecutionDriver(options){
 const driver=createServerActionRehearsalDriver(options);let submitted=false;
 return {...driver,eventPost:async({signal,timeoutMs})=>{
  if(submitted||signal.aborted)throw Error('execution_already_attempted');submitted=true;
  return options.context.request.post('https://sync-exchange-posthog-staging.netlify.app/api/admin/analytics/validation',{headers:{Origin:'https://sync-exchange-posthog-staging.netlify.app'},timeout:timeoutMs,maxRetries:0,maxRedirects:0,failOnStatusCode:false});
 }};
}
export function createBoundedExecutionCoordinator({driver,beforeSnapshot,collectAfter,executionStartedAt,writeArtifact,durableEvidence,timeoutMs=15000,cleanupTimeoutMs=5000}){
 let started=false;
 return {run:async()=>{
  if(started)return {status:'failed',failureCategory:'execution_already_attempted',postAttempts:0};started=true;
  const state={status:'running',step:'prepared',failureCategory:null,postAttempts:0,eventId:null,authentication:null,event:null,preservation:null,cleanup:'pending',artifactPreserved:false};
  const save=async()=>{try{await writeArtifact(structuredClone(state));}catch{throw Error('artifact_write_failed');}};
  const stage=async step=>{state.step=step;await save();};
  let after,executionFinishedAt,auth,durableInitialized=false;
  try{
   if(!beforeSnapshot||beforeSnapshot.environmentId!=='oppijylbkcbiqfuvckgj'||beforeSnapshot.approvedAdminId!==approved.approvedAdminId||!Number.isFinite(Date.parse(executionStartedAt))||Date.parse(beforeSnapshot.finishedAt)>Date.parse(executionStartedAt))throw Error('baseline_rejected');
   if(!preservationDomains.every(d=>Array.isArray(beforeSnapshot.domains?.[d])&&new Set(beforeSnapshot.domains[d].map(r=>r.id)).size===beforeSnapshot.domains[d].length&&beforeSnapshot.domains[d].every(r=>typeof r.id==='string'&&/^[a-f0-9]{64}$/.test(r.fingerprint||'')))||beforeSnapshot.domains.staging_analytics_validation.some(r=>r.id===approved.executionAuthorization)||beforeSnapshot.domains.analytics_outbox.some(r=>r.execution!==null&&r.execution!==undefined))throw Error('baseline_rejected');
   if(!isDurableExecutionEvidence(durableEvidence)||!durableEvidence.matches({environmentId:beforeSnapshot.environmentId,operatorId:approved.approvedAdminId,authorizationId:approved.executionAuthorization,executionStartedAt}))throw Error('durable_evidence_required');
   await durableEvidence.baseline(beforeSnapshot);durableInitialized=true;
   await save();
   await stage('authentication');
   // Inner cleanup is deliberately deferred. The coordinator owns closure once.
   const retained={...driver,cleanup:async()=>{}};
   state.authentication=await runBoundedAuthReadinessDiagnostics({driver:retained,expectedAdminId:approved.approvedAdminId,loginFlow:'server-action',readinessExpectation:'ready',timeoutMs,cleanupTimeoutMs,writeArtifact:async diagnostic=>{state.authentication=diagnostic;await save();}});
   auth=driver.preservationAuthorization();
   if(state.authentication.status!=='passed')throw Error('authentication_or_readiness_failed');
   if(auth.approvedAdminId!==approved.approvedAdminId||auth.environmentId!=='oppijylbkcbiqfuvckgj'||auth.expectedNewSessions!==1||!auth.approvedSessionId)throw Error('session_authorization_failed');
   await durableEvidence.authorization(auth);
   await stage('event_submission');
   state.event=await runBoundedValidationDiagnostics({timeoutMs,cleanupTimeoutMs,cleanup:async()=>{},writeArtifact:async diagnostic=>{state.event=diagnostic;await save();},request:async options=>{
    if(state.postAttempts!==0)throw Error('execution_already_attempted');
    // Durable intent precedes the single POST; artifact failure prevents it.
    await durableEvidence.intent();state.postAttempts=1;await save();return driver.eventPost(options);
   }});
   state.eventId=state.event.eventId;
   if(state.event.status!=='passed')throw Error('delivery_unconfirmed');
  }catch(error){state.status='failed';state.failureCategory=['durable_evidence_required','evidence_write_failed','artifact_write_failed','baseline_rejected','authentication_or_readiness_failed','session_authorization_failed','delivery_unconfirmed'].includes(error?.message)?error.message:'operation_failed';}
  finally{
   executionFinishedAt=new Date().toISOString();
   try{
    state.step='postflight_collection';
    // Public reporting must never suppress mandatory private collection.
    after=await collectAfter();
    if(durableInitialized){await durableEvidence.postflight({diagnostic:after?.diagnostic,snapshot:after?.snapshot,optionalHealth:after?.optionalHealth});state.durablePostflightPreserved=true;}
    try{await save();}catch{state.status='failed';state.failureCategory??='artifact_write_failed';}
    state.postflightCollection=after?.diagnostic?{status:after.diagnostic.status,failureCategory:after.diagnostic.failureCategory??null,failedAssertion:after.diagnostic.failedAssertion??null}:null;
    if(after?.diagnostic?.status!=='passed'||!after.snapshot)throw Error('partial_postflight');
    auth??=driver.preservationAuthorization();
    // Ambiguous HTTP delivery is never resent; reconcile only by private rows.
    const grant=after.snapshot.domains.staging_analytics_validation?.find(r=>r.id===approved.executionAuthorization);
    const eventId=state.eventId??grant?.execution?.event_id;
    state.preservation=comparePreservationSnapshots(beforeSnapshot,after.snapshot,{...auth,...approved,mode:'BOUNDED_EVENT_EXECUTION',eventId,executionStartedAt,executionFinishedAt});
    state.eventId=eventId??null;
    await stage('postflight_comparison');
    if(state.preservation.status!=='passed'){state.status='failed';state.failureCategory??='preservation_failed';}
   }catch{state.status='failed';state.failureCategory??='postflight_collection_failed';}
   let timer;
   try{await Promise.race([Promise.resolve().then(()=>driver.cleanup()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error()),cleanupTimeoutMs);})]);state.cleanup='complete';}
   catch{state.cleanup='failed_or_timeout';state.status='failed';state.failureCategory??='cleanup_failed';}finally{clearTimeout(timer);}
   if(state.status==='running')state.status='passed';
   state.step='terminal';state.artifactPreserved=true;
   try{await save();}catch{state.artifactPreserved=false;state.status='failed';state.failureCategory='artifact_write_failed';}
   if(durableInitialized){try{await durableEvidence.terminal(structuredClone(state));state.durableTerminalPreserved=true;}catch{state.status='failed';state.failureCategory??='evidence_write_failed';state.durableTerminalPreserved=false;}}
  }
  return structuredClone(state);
 }};
}
