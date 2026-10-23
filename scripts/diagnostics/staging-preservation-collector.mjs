import { createHmac,randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { getStagingPublicationCredential,assertStagingCredential } from '../staging-publication-credential.mjs';
import { preservationDomains,capturePreservationSnapshot } from './postflight-preservation.mjs';
import { project,preservationQuery } from './staging-preservation-query.mjs';
const site='d8e851a6-ab37-4b0e-9403-9b2c1be65f13',team='69dd559baa411c224e5e8507';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const fail=category=>{throw Error(category);};
const categories=['credential_unavailable','identity_mismatch','collection_failed','partial_collection','invalid_collection','environment_unavailable','artifact_write_failed'];
function keychain(){try{let value=execFileSync('/usr/bin/security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();if(value.startsWith('go-keyring-base64:'))value=Buffer.from(value.slice(18),'base64').toString();if(!value)fail('credential_unavailable');return value;}catch{fail('credential_unavailable');}}
async function json(response){if(!response.ok)fail('collection_failed');const declared=Number(response.headers?.get('content-length'));if(declared>8*1024*1024)fail('partial_collection');const text=await response.text();if(Buffer.byteLength(text)>8*1024*1024)fail('partial_collection');try{return JSON.parse(text);}catch{fail('invalid_collection');}}
// Existing service-role credential is verified first. Management read-only SQL
// access is additionally required: Auth sessions/catalogs are not Data API tables.
export function createSecureStagingReader({request=fetch,serviceCredential=getStagingPublicationCredential,managementCredential=keychain,netlifyCredential=()=>{try{const c=JSON.parse(readFileSync(homedir()+'/Library/Preferences/netlify/config.json','utf8'));return c.users[c.userId].auth.token;}catch{fail('credential_unavailable');}}}={}){
 let pat,netlifyToken,verified=false;
 const call=async(url,options={})=>json(await request(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)}));
 return {
  verify:async()=>{
   verified=false;pat=undefined;netlifyToken=undefined;
   let key;try{key=await serviceCredential();}catch{fail('credential_unavailable');}try{assertStagingCredential(key);}catch{fail('identity_mismatch');}
   pat=await managementCredential();const identity=await call(`https://api.supabase.com/v1/projects/${project}`,{headers:{Authorization:`Bearer ${pat}`}});
   if(identity.id!==project||identity.name!=='sync-exchange-posthog-staging')fail('identity_mismatch');verified=true;
  },
  database:async (admin,executionAuthorization)=>{if(!verified)fail('identity_mismatch');return call(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${pat}`,'Content-Type':'application/json'},body:JSON.stringify({query:preservationQuery(admin,executionAuthorization),read_only:true})});},
  environment:async()=>{
   if(!verified)fail('identity_mismatch');netlifyToken??=await netlifyCredential();
   const headers={Authorization:`Bearer ${netlifyToken}`};const identity=await call(`https://api.netlify.com/api/v1/sites/${site}`,{headers});if(identity.id!==site||identity.name!=='sync-exchange-posthog-staging')fail('identity_mismatch');
   const rows=await call(`https://api.netlify.com/api/v1/accounts/${team}/env?site_id=${site}`,{headers});if(!Array.isArray(rows))fail('environment_unavailable');
   // Values stay private. Masked secrets are tracked by provider metadata/version,
   // scope and context; this does not prove effective secret-to-project equality.
   const data=rows.map(row=>{if(!row.key||!Array.isArray(row.scopes)||!Array.isArray(row.values))fail('environment_unavailable');return {id:row.key,scopes:[...row.scopes].sort(),is_secret:row.is_secret,updated_at:row.updated_at,values:row.values.map(v=>({...v})).sort((a,b)=>String(a.context).localeCompare(String(b.context))||String(a.id).localeCompare(String(b.id)))};});
   return {success:true,complete:true,count:data.length,readAt:new Date().toISOString(),rows:data};
  },
  close:()=>{pat=undefined;netlifyToken=undefined;verified=false;}
 };
}
// Paired collections must share this private per-run HMAC key. Never export it.
export function createStagingPreservationCollector({reader=createSecureStagingReader(),fingerprintKey=randomBytes(32),writeArtifact=async()=>{}}={}){
 const hash=value=>createHmac('sha256',fingerprintKey).update(JSON.stringify(canonical(value))).digest('hex');
 let active=false;
 return {collect:async({approvedAdminId,mode,executionAuthorization})=>{
  if(active)fail('invalid_collection');active=true;
  const diagnostic={status:'running',step:'identity',mode:['AUTHENTICATED_REHEARSAL','READ_ONLY_NO_LOGIN','BOUNDED_EVENT_EXECUTION'].includes(mode)?mode:'invalid',failureCategory:null,failedAssertion:null,sources:preservationDomains.map(source=>({source,status:'not_attempted',success:false,count:null,complete:false,readAt:null,fingerprintPresent:false})),artifactPreserved:false};
  const save=async()=>{try{await writeArtifact(structuredClone(diagnostic));}catch{fail('artifact_write_failed');}};let result;
  try{
   await save();if(!['AUTHENTICATED_REHEARSAL','READ_ONLY_NO_LOGIN','BOUNDED_EVENT_EXECUTION'].includes(mode))fail('invalid_collection');
   if(mode==='BOUNDED_EVENT_EXECUTION'&&!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(executionAuthorization||''))fail('invalid_collection');
   await reader.verify();diagnostic.step='database';await save();const response=await reader.database(approvedAdminId,mode==='BOUNDED_EVENT_EXECUTION'?executionAuthorization:undefined);
   if(!Array.isArray(response)||response.length!==1)fail('invalid_collection');const raw=response[0].snapshot;diagnostic.step='database.snapshot_metadata';
   if(raw?.environmentId!==project||raw.complete!==true||raw.consistent!==true||raw.readOnly!==true||raw.privilegedRead!==true||typeof raw.transactionId!=='string'||!raw.transactionId||!Number.isFinite(Date.parse(raw.startedAt))||!Number.isFinite(Date.parse(raw.finishedAt))||Date.parse(raw.finishedAt)<Date.parse(raw.startedAt))fail('invalid_collection');
   diagnostic.step='environment_configuration';await save();const env=await reader.environment();raw.sources.environment_configuration=env;
   const domains={},privateCoverage=[];
   for(const source of preservationDomains){
    diagnostic.step=source;const s=raw.sources?.[source],target=diagnostic.sources.find(x=>x.source===source);
    if(s){target.count=Number.isSafeInteger(s.count)&&s.count>=0?s.count:null;target.readAt=Number.isFinite(Date.parse(s.readAt))?s.readAt:null;}
    if(!s||s.success!==true||s.complete!==true||!Number.isSafeInteger(s.count)||s.count<0||!Array.isArray(s.rows)||s.count!==s.rows.length||!Number.isFinite(Date.parse(s.readAt)))fail('partial_collection');
    const seen=new Set();domains[source]=s.rows.map(row=>{
     if(!row||typeof row.id!=='string'||!row.id||seen.has(row.id))fail('invalid_collection');seen.add(row.id);
     if(source==='environment_configuration')return {id:row.id,fingerprint:hash(row),loginFingerprint:null,loginTimes:null,ownerId:null,createdAt:null};
     if(!/^[a-f0-9]{64}$/.test(row.fingerprint||'')||(row.loginFingerprint!==null&&!/^[a-f0-9]{64}$/.test(row.loginFingerprint||'')))fail('invalid_collection');
     return {id:row.id,fingerprint:hash(row.fingerprint),loginFingerprint:row.loginFingerprint===null?null:hash(row.loginFingerprint),loginTimes:row.loginTimes,ownerId:row.ownerId,createdAt:row.createdAt,execution:mode==='BOUNDED_EVENT_EXECUTION'?row.execution??null:null};
    }).sort((a,b)=>a.id.localeCompare(b.id));
    const fingerprint=hash(domains[source].map(row=>[row.id,row.fingerprint]));privateCoverage.push({source,fingerprint,count:s.count,readAt:s.readAt});
    Object.assign(target,{status:'passed',success:true,count:s.count,complete:true,readAt:s.readAt,fingerprintPresent:true});await save();
   }
   const finishedAt=new Date(Math.max(Date.parse(raw.finishedAt),Date.parse(env.readAt))).toISOString();
   const snapshot=capturePreservationSnapshot({...raw,finishedAt,domains,fingerprinted:true},approvedAdminId);
   diagnostic.status='passed';result={snapshot,privateCoverage};
  }catch(error){diagnostic.status='failed';diagnostic.failedAssertion=diagnostic.step+'.collection_complete';diagnostic.failureCategory=categories.includes(error?.message)?error.message:'collection_failed';for(const source of diagnostic.sources){if(!source.success){source.status=diagnostic.step===source.source?'failed':'not_verified';}}}
  finally{try{reader.close?.();}catch{diagnostic.status='failed';diagnostic.failureCategory='cleanup_failed';diagnostic.failedAssertion='reader.cleanup';result=undefined;}active=false;diagnostic.step='terminal';diagnostic.artifactPreserved=true;try{await save();}catch{diagnostic.artifactPreserved=false;diagnostic.status='failed';diagnostic.failureCategory='artifact_write_failed';result=undefined;}}
  const output={diagnostic};if(diagnostic.status==='passed')for(const [key,value]of Object.entries(result))Object.defineProperty(output,key,{value,enumerable:false});return output;
 },close:()=>reader.close?.()};
}
