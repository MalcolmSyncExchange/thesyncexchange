import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerActionRehearsalDriver,runServerActionDormantRehearsal} from '../scripts/diagnostics/server-action-rehearsal-adapter.mjs';
const admin='6faee3df-7b4b-4d63-ba8d-1275139ccff5',origin='https://sync-exchange-posthog-staging.netlify.app',project='oppijylbkcbiqfuvckgj';
const body={status:'not_ready',ready:false,grantUsable:false,authorizationMatches:false,artistMatches:false,operatorMatches:false,validationEnabled:true,stagingIdentityValid:true,globalAnalyticsDisabled:true,boundedConfigurationRecognized:true,paymentCapabilitiesOff:true};
async function run(options={}){
 const calls=[],artifacts=[];let url=origin+'/login';
 const timeout=()=>{const e=Error('SECRET timeout');e.name='TimeoutError';throw e;};
 const page={goto:async()=>calls.push('goto'),getByTestId:id=>({fill:async()=>calls.push(id),click:async()=>{calls.push('submit');url=origin+(options.invalid?'/login?error=SECRET':'/admin');}}),waitForResponse:async predicate=>{
  const response=(path,method)=>({url:()=>origin+path,request:()=>({method:()=>method}),status:()=>200});
  assert.equal(predicate(response('/auth/v1/token','POST')),false);assert.equal(predicate(response('/login','GET')),false);assert.equal(predicate(response('/login','POST')),true);
  calls.push('server_action');if(options.timeout)return new Promise(()=>{});return response('/login','POST');
 },waitForURL:async predicate=>{if(options.navigationTimeout)timeout();assert.equal(predicate(new URL(url)),true);},url:()=>url};
 const claims={sub:admin,session_id:'fixture-session',iss:'https://'+project+'.supabase.co/auth/v1',exp:options.expired?0:Date.now()/1000+3600};
 const session={access_token:'SECRET.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.SECRET'};
 const context={cookies:async()=>options.missing?[]:[{name:'sb-'+project+'-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64')}],request:{get:async()=>{calls.push('readiness');return {status:()=>503,json:async()=>{if(options.invalidJson)throw Error('SECRET response');return {...body,secret:'SECRET'};}};}},close:async()=>{calls.push('context_close');if(options.cleanupFailure)throw Error('SECRET cleanup');}};
 const browser={close:async()=>calls.push('browser_close')};
 const request=async target=>{calls.push(target.endsWith('/user')?'getUser':'role');return new Response(JSON.stringify(target.endsWith('/user')?{id:admin}:[{role:options.role||'admin'}]));};
 const driver=createServerActionRehearsalDriver({page,context,browser,credentialProvider:async()=> 'SECRET password',anonKey:'SECRET anon',request});
 const result=await runServerActionDormantRehearsal({driver,writeArtifact:async s=>artifacts.push(s),timeoutMs:20,cleanupTimeoutMs:20});
 return {result,calls,artifacts,authorization:driver.preservationAuthorization()};
}
test('server-action login persists eight independent checkpoints; one submission, one GET; secret-safe',async()=>{
 const r=await run();assert.equal(r.result.status,'passed');assert.equal(r.result.checkpoints.length,8);assert.equal(r.result.readiness.category,'EXPECTED_DORMANT');
 for(const c of r.result.checkpoints)assert.ok(r.artifacts.some(a=>a.checkpoints.some(x=>x.step===c.step&&x.state==='passed')));
 assert.equal(r.calls.filter(x=>x==='submit').length,1);assert.equal(r.calls.filter(x=>x==='readiness').length,1);assert.doesNotMatch(JSON.stringify(r.artifacts),/SECRET|fixture-session/);
 assert.equal(r.authorization.mode,'AUTHENTICATED_REHEARSAL');assert.equal(r.authorization.expectedNewSessions,1);assert.equal(r.authorization.approvedSessionId,'fixture-session');assert.ok(Date.parse(r.authorization.loginFinishedAt)>=Date.parse(r.authorization.loginStartedAt));
});
for(const [name,options,step,category]of [
 ['invalid credentials',{invalid:true},'server_action_outcome','login_rejected'],
 ['missing session',{missing:true},'session_establishment','session_missing'],
 ['expired session',{expired:true},'session_establishment','session_expired'],
 ['incorrect canonical role',{role:'artist'},'canonical_admin_role','canonical_role_rejected'],
 ['server-action timeout',{timeout:true},'server_action_outcome','step_timeout'],
 ['navigation timeout',{navigationTimeout:true},'server_action_outcome','step_timeout'],
 ['invalid readiness JSON',{invalidJson:true},'readiness_json_validation','readiness_invalid_json']
])test(name+' localizes failure, stops and preserves cleanup',async()=>{const r=await run(options);assert.equal(r.result.failedStep,step);assert.equal(r.result.failureCategory,category);assert.equal(r.result.cleanup,'complete');assert.ok(r.calls.includes('browser_close'));assert.equal(r.calls.filter(x=>x==='submit').length,1);assert.doesNotMatch(JSON.stringify(r.artifacts),/SECRET/);if(step!=='readiness_json_validation')assert.ok(!r.calls.includes('readiness'));});
test('browser cleanup still runs after context cleanup failure',async()=>{const r=await run({cleanupFailure:true});assert.equal(r.result.failureCategory,'cleanup_failed');assert.equal(r.result.artifactPreserved,true);assert.ok(r.calls.includes('browser_close'));});
