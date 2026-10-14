import { createHash } from 'node:crypto';
export const preservationDomains=['auth.users','auth.identities','auth.sessions','public.user_profiles','public.artist_profiles','public.buyer_profiles','storage.objects','storage.buckets','analytics_outbox','staging_analytics_validation','staging_analytics_validation_slot','existing_policies','onboarding_records','purchase_capabilities','authorization_grants','table_security','migration_history','environment_configuration'];
const stable=value=>JSON.stringify(canonical(value));
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
const digest=value=>createHash('sha256').update(stable(value)).digest('hex');
const time=value=>typeof value==='string'?Date.parse(value):NaN;
class CaptureFailure extends Error {constructor(category,assertion){super(category);this.assertion=assertion;}}
const authorizedTimestampFields=['last_sign_in_at','updated_at'];
// Capture private fingerprints from a complete, consistent read-only snapshot.
// Caller must never log or serialize the input rows or returned private snapshot.
export function capturePreservationSnapshot(read,approvedAdminId){
 if(!read||read.complete!==true||read.consistent!==true||read.readOnly!==true||typeof read.transactionId!=='string'||!read.transactionId||typeof read.environmentId!=='string'||!Number.isFinite(time(read.startedAt))||!Number.isFinite(time(read.finishedAt))||time(read.finishedAt)<time(read.startedAt))throw new CaptureFailure('invalid_snapshot','snapshot.read_metadata');
 const domains={};
 for(const domain of preservationDomains){
  const rows=read.domains?.[domain];if(!Array.isArray(rows))throw new CaptureFailure('partial_snapshot',domain+'.capture_complete');
  const seen=new Set();domains[domain]=rows.map(row=>{
   if(!row||typeof row.id!=='string'||!row.id||seen.has(row.id))throw new CaptureFailure('invalid_record_identity',domain+'.stable_identities');seen.add(row.id);
   if(read.fingerprinted===true){
    if(!/^[a-f0-9]{64}$/.test(row.fingerprint||'')||(row.loginFingerprint!==null&&!/^[a-f0-9]{64}$/.test(row.loginFingerprint||'')))throw new CaptureFailure('invalid_record_identity',domain+'.fingerprints');
    return {...row};
   }
   const approved=(domain==='auth.users'&&row.id===approvedAdminId)||(domain==='auth.identities'&&row.user_id===approvedAdminId);
   const normalized={...row};if(approved)for(const key of authorizedTimestampFields)delete normalized[key];
   return {id:row.id,fingerprint:digest(row),loginFingerprint:approved?digest(normalized):null,loginTimes:approved?Object.fromEntries(authorizedTimestampFields.map(key=>[key,row[key]??null])):null,ownerId:domain==='auth.sessions'?row.user_id:null,createdAt:domain==='auth.sessions'?row.created_at:null};
  }).sort((a,b)=>a.id.localeCompare(b.id));
 }
 return {environmentId:read.environmentId,approvedAdminId,transactionId:read.transactionId,startedAt:read.startedAt,finishedAt:read.finishedAt,domains};
}
export function comparePreservationSnapshots(before,after,{approvedAdminId,environmentId,loginStartedAt,loginFinishedAt,expectedNewSessions,approvedSessionId,mode}){
 const assertions=[];const record=(assertion,passed,category='unexpected_mutation')=>assertions.push({assertion,passed,category:passed?'preserved':category});
 const start=time(loginStartedAt),end=time(loginFinishedAt),authenticated=mode==='AUTHENTICATED_REHEARSAL',readonly=mode==='READ_ONLY_NO_LOGIN';
 record('snapshot.authorization',typeof approvedAdminId==='string'&&!!approvedAdminId&&((authenticated&&typeof approvedSessionId==='string'&&!!approvedSessionId&&expectedNewSessions===1&&Number.isFinite(start)&&Number.isFinite(end)&&end>=start)||(readonly&&expectedNewSessions===0&&approvedSessionId===undefined&&loginStartedAt===undefined&&loginFinishedAt===undefined)),'invalid_authorization');
 record('snapshot.identity',!!before&&!!after&&environmentId==='oppijylbkcbiqfuvckgj'&&before.environmentId===environmentId&&after.environmentId===environmentId&&before.approvedAdminId===approvedAdminId&&after.approvedAdminId===approvedAdminId,'snapshot_identity_mismatch');
 record('snapshot.timing',!!before&&!!after&&Number.isFinite(time(before.finishedAt))&&Number.isFinite(time(after.startedAt))&&(readonly?time(before.finishedAt)<=time(after.startedAt):time(before.finishedAt)<=start&&end<=time(after.startedAt)),'ambiguous_snapshot_timing');
 record('snapshot.completeness',!!before?.domains&&!!after?.domains&&preservationDomains.every(domain=>Array.isArray(before.domains[domain])&&Array.isArray(after.domains[domain])),'partial_snapshot');
 record('snapshot.record_integrity',preservationDomains.every(domain=>[before?.domains?.[domain],after?.domains?.[domain]].every(rows=>Array.isArray(rows)&&rows.every(row=>typeof row.id==='string'&&!!row.id&&/^[a-f0-9]{64}$/.test(row.fingerprint||'')&&(row.loginFingerprint===null||/^[a-f0-9]{64}$/.test(row.loginFingerprint||'')&&row.loginTimes&&authorizedTimestampFields.every(key=>Object.hasOwn(row.loginTimes,key)))))),'invalid_record_fingerprint');
 if(assertions.every(x=>x.passed))for(const domain of preservationDomains){
  const old=before.domains[domain],next=after.domains[domain];const oldMap=new Map(old.map(x=>[x.id,x])),nextMap=new Map(next.map(x=>[x.id,x]));
  record(domain+'.unique_identities',oldMap.size===old.length&&nextMap.size===next.length,'invalid_record_identity');
  record(domain+'.existing_records',old.every(row=>{const current=nextMap.get(row.id);if(!current)return false;if(row.fingerprint===current.fingerprint)return true;
   if(!authenticated||!row.loginFingerprint||row.loginFingerprint!==current.loginFingerprint)return false;
   return authorizedTimestampFields.every(key=>{const was=row.loginTimes[key],now=current.loginTimes[key];if(was===now)return true;return Number.isFinite(time(now))&&(was===null||Number.isFinite(time(was))&&time(now)>=time(was))&&time(now)>=start&&time(now)<=end;});
  }));
  const added=next.filter(row=>!oldMap.has(row.id));
  if(domain==='auth.sessions'){
   record('auth.sessions.new_session_count',added.length===expectedNewSessions,'unexpected_session_count');
   record('auth.sessions.new_session_identity',added.every(row=>row.id===approvedSessionId),'unexpected_session_identity');
   record('auth.sessions.new_session_owner',added.every(row=>row.ownerId===approvedAdminId),'unexpected_session_owner');
   record('auth.sessions.new_session_time',added.every(row=>Number.isFinite(time(row.createdAt))&&time(row.createdAt)>=start&&time(row.createdAt)<=end),'unexpected_session_time');
  }else record(domain+'.no_added_records',added.length===0);
 }
 return {status:assertions.every(x=>x.passed)?'passed':'failed',firstFailedAssertion:assertions.find(x=>!x.passed)?.assertion??null,assertions};
}
// Compare every assertion independently. Artifacts contain fixed names/categories
// and booleans only, never row IDs, raw data, fingerprints or provider exceptions.
export async function runPostflightPreservation({readBefore,readAfter,authorization,writeArtifact}){
 const state={status:'running',step:'read_before',firstFailedAssertion:null,failureCategory:null,assertions:[],artifactPreserved:false};
 let lastWritten=null;
 const save=async()=>{try{await writeArtifact(structuredClone(state));lastWritten=state.step;}catch{throw Error('artifact_write_failed');}};
 try{
  await save();const before=capturePreservationSnapshot(await readBefore(),authorization.approvedAdminId);state.step='read_after';await save();
  const after=capturePreservationSnapshot(await readAfter(),authorization.approvedAdminId);state.step='compare';await save();
  const result=comparePreservationSnapshots(before,after,authorization);state.firstFailedAssertion=result.firstFailedAssertion;state.failureCategory=result.assertions.find(x=>!x.passed)?.category??null;state.status=result.status;
  for(const assertion of result.assertions){state.assertions.push(assertion);state.step=assertion.assertion;await save();}
 }catch(error){state.status='failed';state.firstFailedAssertion??=error instanceof CaptureFailure?error.assertion:state.step;const categories=['invalid_snapshot','partial_snapshot','invalid_record_identity','artifact_write_failed'];state.failureCategory=categories.includes(error?.message)?error.message:'snapshot_read_failed';}
 finally{state.step='terminal';state.artifactPreserved=true;try{await save();}catch{state.artifactPreserved=false;state.status='failed';state.failureCategory='artifact_write_failed';}state.lastPersistedStep=lastWritten;}
 return structuredClone(state);
}
