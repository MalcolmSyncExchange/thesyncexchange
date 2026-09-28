import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {source,ids} from './helpers/artist-baseline-db.mjs';
const require=createRequire(import.meta.url);
function load(path,mocks={}) {const m={exports:{}};vm.runInNewContext(ts.transpileModule(source(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,console,Error,URL,require:k=>k in mocks?mocks[k]:k.startsWith('@/')?{}:require(k)});return m.exports;}
function context({role='artist',id=ids.a,authError=null,roleError=null,records={},licenseStatus='generated'}={}) {
 const events=[];
 const client={auth:{getUser:async()=>{events.push('auth');return {data:{user:id?{id,user_metadata:{role:'admin'}}:null},error:authError};}},
  rpc:async name=>{events.push(`rpc:${name}`);return{data:[{payout_email:'private@fixture.invalid'}],error:null};},
  from(table){let fields,filters=[];const result=()=>{events.push({table,fields,filters});return{data:records[table]??[],error:null};};const q={select:v=>{fields=v;return q;},eq:(k,v)=>{filters.push([k,v]);return q;},order:()=>q,in:()=>q,maybeSingle:async()=>({...result(),data:records[table]||null}),then:resolve=>Promise.resolve(result()).then(resolve)};return q;}
 };
 const mocks={
  '@/lib/env':{hasSupabaseEnv:true,env:{demoMode:false}},
  '@/services/supabase/server':{createServerSupabaseClient:async()=>client},
  '@/services/supabase/privileged':{createPrivilegedSupabaseClient:async()=>{events.push('privileged');return client;}},
  '@/services/auth/user-profiles':{selectUserProfileCompat:async()=>{events.push('role');return{data:{role},error:roleError};}},
  '@/services/artist/profile-contract':load('services/artist/profile-contract.ts'),
  './profile-contract':load('services/artist/profile-contract.ts'),
  '@/lib/storage':{getPublicStorageUrl:()=>null,storageBuckets:{}},
  '@/lib/orders':{hasAgreementBeenGenerated:()=>true,hasExtendedOrderMetadata:()=>true},
  '@/services/generated-licenses/server':{listGeneratedLicensesByOrderIds:async()=>new Map([[ids.order,{status:licenseStatus,pdf_storage_path:'private.pdf',agreement_number:'TSE-TEST'}]])}
 };
 mocks['@/services/auth/authorization']=load('services/auth/authorization.ts',mocks);
 return {mocks,events,client};
}
for(const opts of [{id:null},{id:ids.b},{role:'buyer'},{role:'admin'},{authError:{}},{roleError:{}}]) test(`artist profile and finance reject invalid account scope ${JSON.stringify(opts)}`,async()=>{
 const h=context(opts);
 for(const [path,fn] of [['services/artist/queries.ts','getArtistWorkspaceData'],['services/artist/finance.ts','getArtistFinance']]) await assert.rejects(load(path,h.mocks)[fn](ids.a));
 assert.ok(!h.events.some(e=>typeof e==='object'||String(e).startsWith('rpc:')||e==='privileged'));
});
test('ordinary profile serialization cannot inherit finance; explicit finance loader does not load catalog',async()=>{
 const h=context({records:{artist_profiles:{id:'artist',user_id:ids.a,artist_name:'A',payout_email:'private@fixture.invalid',verification_status:'pending'}}});
 const workspace=await load('services/artist/queries.ts',h.mocks).getArtistWorkspaceData(ids.a);
 assert.equal(workspace.profile.artist_name,'A');assert.ok(!JSON.stringify(workspace).includes('payout_email'));
 assert.ok(h.events.find(e=>e.table==='artist_profiles').fields.split(',').every(f=>f!=='payout_email'));
 h.events.length=0;
 const finance=await load('services/artist/finance.ts',h.mocks).getArtistFinance(ids.a);
 assert.equal(finance.payout_email,'private@fixture.invalid');assert.equal(finance.legal_entity,null);
 assert.deepEqual(h.events,['auth','role','rpc:get_own_artist_finance']);
 const page=source('app/(app)/artist/payout-settings/page.tsx');assert.match(page,/finance\.legal_entity \|\| "Not provided"/);assert.doesNotMatch(page,/artist_name|user.email|Music`/);
});
test('serialized buyer order history preserves fulfillment UI without private artifact/webhook fields',async()=>{
 const h=context({role:'buyer',id:ids.buyer,records:{orders:[{id:ids.order,buyer_user_id:ids.buyer,track_id:ids.live,status:'fulfilled',amount_cents:5000,currency:'USD',agreement_path:'private/order.pdf',last_webhook_error:'private error',last_webhook_event_id:'evt_secret',stripe_payment_intent_id:'pi_secret',agreement_generation_error:null,tracks:{id:ids.live,title:'Title',slug:'title'},license_types:{id:ids.license,name:'Digital',default_price_cents:5000}}]}});
 const orders=await load('services/buyer/queries.ts',h.mocks).getBuyerOrders(ids.buyer);
 const serialized=JSON.stringify(orders);
 for(const key of ['agreement_path','last_webhook_error','last_webhook_event_id','stripe_payment_intent_id','agreement_generation_error']) assert.ok(!serialized.includes(`"${key}"`));
 assert.equal(orders[0].amount_paid,50);assert.equal(orders[0].order_status,'fulfilled');assert.equal(orders[0].agreement_ready,true);
 assert.equal(orders[0].agreement_url,`/api/orders/${ids.order}/agreement`);assert.equal(orders[0].track.title,'Title');
 assert.ok(h.events.indexOf('role')<h.events.indexOf('privileged'));
 assert.ok(h.events.find(e=>e.table==='orders').filters.some(([k,v])=>k==='buyer_user_id'&&v===ids.buyer));
});
test('buyer/private admin loaders reject wrong roles or supplied user IDs before privileged client creation',async()=>{
 for(const options of [{id:ids.buyer,role:'artist'},{id:ids.a,role:'buyer'},{id:null,role:'buyer'}]) {
  const h=context(options);const buyer=load('services/buyer/queries.ts',h.mocks);
  await assert.rejects(buyer.getBuyerOrders(ids.buyer));assert.ok(!h.events.includes('privileged'));
 }
 const h=context({role:'buyer'});const admin=load('services/admin/queries.ts',h.mocks);
 await assert.rejects(admin.getAdminDashboardData());assert.ok(!h.events.includes('privileged'));
});
test('trusted onboarding writes omit finance copies and protected fields from client input',()=>{
 const s=source('services/auth/actions.ts');
 assert.doesNotMatch(s,/onboarding_payload: (payload|user.onboardingData)/);
 assert.match(s,/verification_status: existingProfile\?\.verification_status \|\| "unverified"/);
 assert.doesNotMatch(s,/verification_status: profileUpdates|verification_status: onboardingPayload/);
});

test('failed agreements expose an actionable safe status without raw diagnostic strings',async()=>{
 const h=context({role:'buyer',id:ids.buyer,licenseStatus:'failed',records:{orders:[{id:ids.order,buyer_user_id:ids.buyer,status:'paid',agreement_generation_error:'secret database/path diagnostic'}]}});
 const rows=await load('services/buyer/queries.ts',h.mocks).getBuyerOrders(ids.buyer);
 assert.equal(rows[0].agreement_failed,true);assert.equal(rows[0].agreement_ready,false);
 assert.ok(!JSON.stringify(rows).includes('secret database/path diagnostic'));
 for(const f of ['components/orders/license-confirmation-client.tsx','app/(app)/buyer/orders/page.tsx']) {assert.match(source(f),/agreement_failed/);assert.doesNotMatch(source(f),/agreement_generation_error/);}
});
