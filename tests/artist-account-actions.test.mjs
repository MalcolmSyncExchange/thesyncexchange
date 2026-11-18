import test from 'node:test';
import assert from 'node:assert/strict';
import * as zod from 'zod';
import {authHarness,loadAuthModule,locationOf,form,userId} from './helpers/auth-system-harness.mjs';
const values={onboardingVersion:'2026-10-23T12:00:00.000Z',fullName:'Account Artist',artistName:'Public Stage',bio:'A useful artist biography with sufficient context.',location:'London',website:'',instagram:'',spotify:'',youtube:'',defaultLicensingPreferences:'Private preference',legalName:'Private Representative',entityType:'individual',businessName:'',country:'GB',contactEmail:'private@fixture.invalid',masterRights:'owner',publishingRights:'unknown',collaboratorStatus:'solo',noticeVersion:'artist-account-2026-10-23-v1',acceptNotice:'on'};
function harness(options={}){const h=authHarness({role:'artist',...options});h.modules.zod=zod;h.modules['@/lib/validation/onboarding']=loadAuthModule('lib/validation/onboarding.ts',{zod});const actions=loadAuthModule('services/auth/actions.ts',h.modules,{File});const calls=[];h.client.rpc=async(name,args)=>{calls.push({name,args});if(options.throws)throw Error('PRIVATE transport secret=DO_NOT_LEAK');return {data:null,error:options.rpcError||null};};return {...h,actions,calls};}
test('Artist profile action derives actor from canonical session and never accepts forged roles, ownership or finance',async()=>{
 const h=harness();const response=await locationOf(()=>h.actions.saveArtistProfileAction(form({...values,userId:'foreign',p_actor:'foreign',role:'admin',payoutEmail:'forged@fixture.invalid',verification_status:'verified'})));assert.equal(response.searchParams.get('saved'),'1');assert.equal(h.calls.length,1);const {name,args}=h.calls[0];assert.equal(name,'save_artist_account_step');assert.equal(args.p_actor,userId);assert.equal(args.p_step,'edit');assert.equal(args.p_private.identity.contactEmail,'private@fixture.invalid');assert.equal(JSON.stringify(args.p_public).includes('private@'),false);for(const key of ['role','userId','payoutEmail','verification_status'])assert.equal(key in args.p_public,false);
});
test('invalid private identity, declaration or notice payload cannot bypass validation through forged form fields',async()=>{
 for(const patch of [{legalName:''},{country:'XX'},{contactEmail:'invalid'},{masterRights:'verified'},{collaboratorStatus:'listed'},{website:'https://name:secret@fixture.invalid'}]){const h=harness();const url=await locationOf(()=>h.actions.saveArtistProfileAction(form({...values,...patch})));assert.ok(url.searchParams.get('error'));assert.equal(h.calls.length,0);}
});
test('foreign canonical roles and unauthenticated profile mutations are denied before privileged RPC use',async()=>{
 for(const options of [{role:'buyer'},{user:null}]){const h=harness(options);const url=await locationOf(()=>h.actions.saveArtistProfileAction(form(values)));assert.notEqual(url.pathname,'/artist/profile');assert.equal(h.calls.length,0);}
});
test('stale editor conflicts expose recovery guidance without provider diagnostic contents',async()=>{
 const h=harness({rpcError:{code:'PT409',message:'PRIVATE provider detail DO_NOT_LEAK'}});const url=await locationOf(()=>h.actions.saveArtistProfileAction(form(values)));assert.match(url.searchParams.get('error'),/Reload/);assert.equal(url.href.includes('DO_NOT_LEAK'),false);
});

test('uncertain provider transport errors do not expose diagnostic strings to the profile URL',async()=>{const h=harness({throws:true});const url=await locationOf(()=>h.actions.saveArtistProfileAction(form(values)));assert.ok(url.searchParams.get('error'));assert.equal(url.href.includes('PRIVATE'),false);assert.equal(url.href.includes('DO_NOT_LEAK'),false);});
