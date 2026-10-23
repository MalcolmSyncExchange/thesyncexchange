import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../services/auth/actions.ts',import.meta.url),'utf8');
function load(text,deps){const exports={};new Function('exports',...Object.keys(deps),ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports,...Object.values(deps));return exports;}
const action=source.slice(source.indexOf('export async function saveArtistOnboardingStepAction'),source.indexOf('export async function finishArtistOnboardingAction'));
const persist='export '+source.slice(source.indexOf('async function persistArtistOnboarding'),source.indexOf('async function persistBuyerOnboarding'));
function harness(mode){let reference='old',objects=new Set(['old']),events=[],order=[];
const client={rpc:async(_name,args)=>{order.push('atomic');
 if(['read-fail','first-fail','first-fail-cleanup-fail'].includes(mode))return{error:{code:'22023'}};
 if(mode==='conflict')return{error:{code:'PT409'}};
 if(mode==='later-fail')return{error:{code:'NETWORK'}};
 reference=args.p_avatar_path;
 if(mode==='lost-response')throw Error('transport');
 return{error:null};}};
const persistFn=load(persist,{hasSupabaseEnv:true,env:{demoMode:false},getUserProfileMutationClient:async()=>client}).persistArtistOnboarding;
const deps={hasSupabaseEnv:true,env:{demoMode:false},parseArtistOnboardingVersion:()=> '2026-01-01T00:00:00Z',assertArtistStepTransition:()=>{},unstable_rethrow:()=>{},getArtistSaveErrorMessage:()=> 'safe-error',ZodError:class extends Error{},captureForUser:async()=>{},requireAuthenticatedUser:async()=>({id:'synthetic',role:'artist',email:'test@example.invalid',avatarPath:'old',onboardingData:{},onboardingStep:'basics',onboardingUpdatedAt:'2026-01-01T00:00:00Z'}),parseArtistBasics:()=>({fullName:'Synthetic',artistName:'Synthetic'}),uploadArtistAvatarIfPresent:async()=>{if(mode==='upload-fail')throw Error('upload');objects.add('new');return{path:'new',publicUrl:'new-url'}},getNextArtistStep:()=> 'profile',getStoredAvatarFields:({avatarPath})=>({avatar_path:avatarPath}),persistArtistOnboarding:persistFn,deleteOwnAvatar:async p=>{if(mode==='old-delete-fail'||mode==='first-fail-cleanup-fail')throw Error('remove');assert.notEqual(reference,p,'never delete the active reference');objects.delete(p)},reportOperationalEvent:n=>events.push(n),reportOperationalError:()=>{},getValidationErrorMessage:()=> 'safe-error',redirect:p=>{throw{redirect:p}}};
return async()=>{const f=new FormData();f.set('step','basics');try{await load(action,deps).saveArtistOnboardingStepAction(f)}catch(e){assert(e.redirect);assert(objects.has(reference));return{reference,old:objects.has('old'),new:objects.has('new'),debt:events.length>0,status:e.redirect.includes('error=')?'error':e.redirect.includes('cleanup=pending')?'warning':'success',order}}};}
for(const [mode,reference,old,fresh,debt,status] of [
['upload-fail','old',true,false,false,'error'],['read-fail','old',true,false,false,'error'],
['first-fail','old',true,false,false,'error'],['first-fail-cleanup-fail','old',true,true,true,'error'],
['conflict','old',true,false,false,'error'],['later-fail','old',true,true,true,'error'],['lost-response','new',true,true,true,'error'],
['ok','new',false,true,false,'success'],['old-delete-fail','new',true,true,true,'warning']])test(mode,async()=>{const r=await harness(mode)();assert.deepEqual({...r,order:undefined},{reference,old,new:fresh,debt,status,order:undefined});if(['later-fail','lost-response','ok','old-delete-fail'].includes(mode))assert.deepEqual(r.order,['atomic']);});
test('retry after ambiguous persistence retains an active object; no blind automatic retry',async()=>{const run=harness('lost-response');const a=await run();const b=await run();assert.equal(a.reference,'new');assert.equal(b.new,true);assert.equal(b.status,'error');});
test('no cleanup authority or media policy changes in this fix',()=>{const cleanup=fs.readFileSync(new URL('../services/storage/avatar-cleanup.ts',import.meta.url),'utf8');assert(cleanup.includes('profile?.role !== "artist"'));assert(cleanup.includes('parts[0] !== user.id'));});
