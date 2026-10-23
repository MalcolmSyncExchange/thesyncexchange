import test from 'node:test';
import assert from 'node:assert/strict';
import {load,elements} from './helpers/license-selection-harness.mjs';
const id='11111111-1111-4111-8111-111111111111',license='22222222-2222-4222-8222-222222222222';
const review={trackId:id,trackSlug:'track',trackTitle:'Track',offer:{licenseTypeId:license,revision:'a'.repeat(64)}};
function harness({valid=true,role='buyer'}={}){
 const calls=[];const redirect=url=>{throw Object.assign(Error('redirect'),{url,digest:'NEXT_REDIRECT'});};
 const module=load('services/licensing/actions.ts',{
  'next/navigation':{redirect,unstable_rethrow:e=>{if(e.digest==='NEXT_REDIRECT')throw e;}},
  '@/services/auth/session':{requireSession:async expected=>{assert.equal(role,expected);return {id};}},
  '@/services/orders/license-offers':{loadBuyerCheckoutReview:async()=>{calls.push('offer');if(role!=='buyer')throw Error('role denied');return valid?review:null;}},
  '@/services/security/rate-limit':{consumeRateLimit:async()=>({status:'allowed'})},
  '@/services/supabase/server':{createServerSupabaseClient:async()=>({})},
  './purchases':{licensingRpc:async(_db,name,args)=>{calls.push(name);assert.equal(name,'prepare_purchase_quote');assert.equal(args.p_license,license);return {id:'quote_fixture'};}}
 });
 const form=()=>{const f=new FormData();for(const [k,v]of Object.entries({trackId:id,trackSlug:'track',licenseTypeId:license,reviewRevision:review.offer.revision,reviewConfirmed:'on'}))f.set(k,v);return f;};
 return {module,calls,form};
}
test('offer confirmation navigates to legal identification and never prepares payment or quote',async()=>{
 const h=harness();await assert.rejects(h.module.continueLicenseReviewAction(h.form()),e=>e.url.includes('details=1')&&e.url.includes(review.offer.revision));assert.deepEqual(h.calls,['offer']);
});
for(const change of [{reviewConfirmed:''},{reviewRevision:'stale'},{trackId:license}])test('stale or forged offer confirmation remains read-only '+JSON.stringify(change),async()=>{
 const h=harness(),f=h.form();for(const [k,v]of Object.entries(change))f.set(k,v);await assert.rejects(h.module.continueLicenseReviewAction(f),e=>e.url.includes('review=changed'));assert.deepEqual(h.calls,['offer']);
});
test('stale offer cannot create a legally accepted quote or reserve payment',async()=>{
 const h=harness(),f=h.form();f.set('reviewRevision','stale');await assert.rejects(h.module.preparePurchaseQuoteAction(f),e=>e.url.includes('review=changed'));assert.deepEqual(h.calls,['offer']);
});
test('current reviewed selection can prepare only a quote, followed by separate exact assent',async()=>{
 const h=harness();await assert.rejects(h.module.preparePurchaseQuoteAction(h.form()),e=>e.url.includes('quote=quote_fixture'));assert.deepEqual(h.calls,['offer','prepare_purchase_quote']);
});
test('cross-role offer review cannot enter legal preparation',async()=>{
 const h=harness({role:'artist'});await assert.rejects(h.module.continueLicenseReviewAction(h.form()),/role denied/);assert.deepEqual(h.calls,['offer']);
});
