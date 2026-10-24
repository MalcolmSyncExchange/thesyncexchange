import * as artistAccountContract from '../../lib/artist/account-contract.ts';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import * as security from '../../services/auth/security.ts';
import * as flow from '../../services/auth/auth-flow.ts';
import { reconcileAppUserProfile } from '../../services/auth/reconcile-app-user.mjs';
import { inferOnboardingCompletionState } from '../../services/auth/onboarding-completion.ts';
export const userId='11111111-1111-4111-8111-111111111111';
export const factorId='22222222-2222-4222-8222-222222222222';
export const form=(values={})=>{const data=new FormData();for(const[k,v]of Object.entries(values))data.set(k,String(v));return data;};
export class Redirect extends Error { constructor(location){super('TEST_REDIRECT');this.location=location;} }
export async function locationOf(operation){try{await operation();throw Error('Expected a redirect');}catch(e){if(!(e instanceof Redirect))throw e;return new URL(e.location,'http://127.0.0.1:3333');}}
export class TestResponse extends Response {
 constructor(body,init){super(body,init);this.writes=new Map();this.cookies={set:(name,value,options)=>{const c=typeof name==='object'?name:{name,value,...options};this.writes.set(c.name,c);},getAll:()=>[...this.writes.values()]};}
 static redirect(url){return new TestResponse(null,{status:307,headers:{location:String(url)}});}
 static json(body,init){return new TestResponse(JSON.stringify(body),{...init,headers:{'content-type':'application/json',...init?.headers}});}
 static next(){return new TestResponse(null,{status:200});}
}
export function loadAuthModule(path,modules,extra={}){
 const source=ts.transpileModule(readFileSync(new URL('../../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const loaded={exports:{}};
 vm.runInNewContext(source,{module:loaded,exports:loaded.exports,Request,Response,Headers,URL,URLSearchParams,FormData,TextEncoder,TextDecoder,AbortSignal,Buffer,crypto:webcrypto,process:{env:{}},console,setTimeout,clearTimeout,...extra,require(name){if(!(name in modules))throw Error('Unexpected Auth harness import '+name);return modules[name];}},{filename:path});
 return loaded.exports;
}
export function authHarness(options={}){
 const authUser=options.user===undefined?{id:userId,email:'user@fixture.invalid',user_metadata:{full_name:'Fixture',role:options.metadataRole},factors:options.factors||[]}:options.user;
 const state={calls:[],writes:[],events:[],rows:new Map(),cookieValues:new Map(Object.entries(options.cookies||{})),refreshes:0};
 const profile=options.profile===undefined?{id:userId,email:'user@fixture.invalid',role:options.role??'buyer',full_name:'Fixture',onboarding_step:'complete',onboarding_completed_at:'2026-01-01'}:options.profile;
 if(profile)state.rows.set(profile.id,structuredClone(profile));
 const cookieStore={getAll:()=>Array.from(state.cookieValues,([name,value])=>({name,value})),get:name=>state.cookieValues.has(name)?{name,value:state.cookieValues.get(name)}:undefined,set:(name,value)=>state.cookieValues.set(name,value),delete:name=>state.cookieValues.delete(name)};
 const fail=()=>({data:null,error:{code:'provider_failure',message:'PRIVATE PROVIDER DIAGNOSTIC token=DO_NOT_LEAK'}});
 const client={auth:{
  getUser:async()=>{state.calls.push('getUser');if(options.authThrows)throw Error('PRIVATE transport');return {data:{user:options.expired?null:authUser},error:options.expired?{code:'session_not_found'}:null};},
  getSession:async()=>{if(options.sessionThrows)throw Error('PRIVATE transport');return {data:{session:options.expired?null:authUser?{user:authUser,access_token:'SYNTHETIC'}:null},error:null};},
  signInWithPassword:async args=>{state.calls.push('signIn');state.loginArgs=args;if(options.loginThrows)throw Error('PRIVATE transport');return options.loginError?{data:{user:null},error:options.loginError}:{data:{user:authUser,session:{user:authUser}},error:null};},
  signUp:async args=>{state.calls.push('signUp');state.signupArgs=args;if(options.signupThrows)throw Error('PRIVATE uncertain transport');return options.signupError?{data:null,error:options.signupError}:options.signupResponse||{data:{user:{id:userId,email:'user@fixture.invalid',identities:[{id:'fresh'}]},session:options.signupSession?{user:authUser}:null},error:null};},
  signOut:async args=>{state.calls.push('signOut:'+args.scope);return options.logoutFails?fail():{error:null};},
  updateUser:async (args,updateOptions)=>{state.updateOptions=updateOptions;state.calls.push('updateUser');state.updateArgs=args;return options.updateFails?fail():{data:{user:authUser},error:null};},
  resend:async args=>{state.calls.push('resend');state.resendArgs=args;return options.resendFails?fail():{error:null};},
  resetPasswordForEmail:async()=>options.resetFails?fail():{data:{},error:null},
  verifyOtp:async args=>{state.calls.push('verifyOtp');state.otpArgs=args;options.cookieOptions?.setAll?.([{name:'sb-fixture-auth-token',value:options.otpError?'': 'ROTATED_SYNTHETIC',options:{httpOnly:false,maxAge:options.otpError?0:3600,sameSite:'lax'}}]);return options.otpError?fail():{data:{user:authUser,session:{user:authUser}},error:null};},
  exchangeCodeForSession:async()=>{state.calls.push('exchangeCode');return options.exchangeFails?fail():{data:{user:authUser},error:null};},
  mfa:{
   getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:options.aal||'aal1',nextLevel:'aal2'},error:options.aalError?{}:null}),
   listFactors:async()=>({data:{all:authUser?.factors||[],totp:(authUser?.factors||[]).filter(f=>f.factor_type==='totp')},error:options.factorError?{}:null}),
   enroll:async()=>{state.calls.push('enroll');return {data:{id:factorId,totp:{qr_code:'data:image/svg+xml;utf8,SYNTHETIC',secret:'SYNTHETIC_TEST_ONLY'}},error:null};},
   unenroll:async args=>{state.calls.push('unenroll:'+args.factorId);return {error:null};},
   challenge:async args=>{state.calls.push('challenge');return {data:{id:'fixture-challenge'},error:options.challengeFails?{}:null};},
   verify:async args=>{state.calls.push('verify');if(options.verifyFails)return fail();options.aal='aal2';const factor=authUser?.factors.find(f=>f.id===args.factorId);if(factor)factor.status='verified';return {data:{},error:null};}
  }
 },rpc:async name=>{if(name==='sec_registration_open')return{data:!options.registrationPaused,error:options.registrationUnavailable?{code:'08006'}:null};if(name!=='auth_session_is_active')throw Error('Unexpected RPC');return {data:!options.revoked,error:null};},from(table){let mutation=null;const filters=new Map();
  const result=async()=>{if(table!=='user_profiles')return {data:options.hasProfile===false?null:{id:'domain-profile'},error:null};if(options.profileReadError)return {data:null,error:{code:'PRIVATE_READ_ERROR'}};
   const id=filters.get('id')||userId,row=state.rows.get(id)||null;
   if(mutation){if(options.profileWriteFails)return {data:null,error:{code:'PRIVATE_WRITE_ERROR'}};if(!row||[...filters].some(([key,value])=>row[key]!==value))return {data:null,error:null};Object.assign(row,mutation);state.writes.push(structuredClone(mutation));}
   return {data:row?structuredClone(row):null,error:null};};
  const q={select:()=>q,eq:(k,v)=>{filters.set(k,v);return q;},is:(k,v)=>{filters.set(k,v);return q;},maybeSingle:result,then:(a,b)=>result().then(a,b),update:patch=>{mutation=patch;return q;},insert:async row=>{if(options.profileWriteFails)return {error:{code:'PRIVATE_WRITE_ERROR'}};if(state.rows.has(row.id))return {error:{code:'23505'}};state.rows.set(row.id,structuredClone(row));state.writes.push(structuredClone(row));return {error:null};}};return q;
 }};
 const env={appUrl:'http://127.0.0.1:3333',configuredAppUrl:'http://127.0.0.1:3333',supabaseUrl:'http://127.0.0.1:3334',supabaseAnonKey:'synthetic-anon',demoMode:false,avatarsBucket:'avatars'};
 const modules={
  'server-only':{},'@supabase/supabase-js':{createClient:()=>({auth:{signInWithPassword:async()=>({data:{user:options.reauthWrongUser?{id:'other'}:authUser},error:options.reauthFails?{}:null}),signOut:async()=>{state.calls.push('temporarySignOut');return {error:null};}}})},
  'next/headers':{cookies:async()=>cookieStore,headers:async()=>new Headers({origin:env.appUrl})},'next/navigation':{redirect:url=>{throw new Redirect(url);},unstable_rethrow:e=>{if(e instanceof Redirect)throw e;}},'next/server':{NextResponse:TestResponse},react:{cache:fn=>fn},
  '@supabase/ssr':{createServerClient:(_url,_key,opts)=>{options.cookieOptions=opts.cookies;return client;}},
  '@/lib/env':{env,hasSupabaseEnv:true,getDeploymentTarget:()=> 'local'},'@/lib/health/payment-readiness':{isDedicatedStagingIdentity:()=>false},
  '@/lib/monitoring':{reportOperationalError:(...v)=>state.events.push(v),reportOperationalEvent:(...v)=>state.events.push(v)},
  '@/lib/storage':{resolvePublicStorageAssetUrl:()=>null,storageBuckets:{avatars:'avatars'}},'@/lib/demo-data':{demoSessionUsers:{}},
  '@/lib/artist/account-contract':artistAccountContract,'@/services/auth/security':security,'@/services/auth/auth-flow':flow,
  '@/services/auth/onboarding-completion':{inferOnboardingCompletionState},'@/services/auth/reconcile-app-user.mjs':{reconcileAppUserProfile},
  '@/services/auth/user-profiles':{selectUserProfileCompat:async(db,id)=>db.from('user_profiles').select('*').eq('id',id).maybeSingle(),upsertUserProfileCompat:()=>{throw Error('Unexpected overwriting profile upsert');}},
  '@/services/supabase/server':{createServerSupabaseClient:async()=>client},'@/services/supabase/admin':{createAdminSupabaseClient:()=>options.noAdmin?null:client},
  '@/services/auth/demo-store':{clearDemoSession:async()=>state.cookieValues.delete('sync-exchange-session')},
  '@/services/analytics/actor':{capturePersistedSignup:async(...v)=>state.events.push(['signup',...v])},
  '@/services/storage/assets':{},'@/services/auth/buyer-onboarding':{},'@/services/auth/onboarding':{},'@/services/storage/avatar-cleanup':{},'@/services/storage/avatar-validation':{},'@/lib/validation/onboarding':{},zod:{ZodError:class extends Error{}}
 };
 const cookieActions=loadAuthModule('services/auth/cookies.ts',modules);modules['@/services/auth/cookies']=cookieActions;
 const session=loadAuthModule('services/auth/session.ts',modules);modules['@/services/auth/session']=session;
 const actions=loadAuthModule('services/auth/actions.ts',modules);
 modules['@/services/auth/account-actions']=loadAuthModule('services/auth/account-actions.ts',modules);
 modules['@/services/auth/account-mutations']=loadAuthModule('services/auth/account-mutations.ts',modules);
 return {state,client,actions,session,modules,options,cookieStore,account:()=>loadAuthModule('services/auth/account-actions.ts',modules),callback:()=>loadAuthModule('app/auth/confirm/route.ts',modules),middleware:()=>loadAuthModule('middleware.ts',modules)};
}
