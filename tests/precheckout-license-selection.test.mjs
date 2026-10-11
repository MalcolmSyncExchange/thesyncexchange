import test from 'node:test';
import assert from 'node:assert/strict';
import * as selection from '../lib/licenses/selection.ts';
import * as schema from '../lib/analytics/schema.ts';
import { load, source, plain, hookRunner, elements } from './helpers/license-selection-harness.mjs';

const trackId='11111111-1111-4111-8111-111111111111';
const licenseTypeId='22222222-2222-4222-8222-222222222222';
const optionId='33333333-3333-4333-8333-333333333333';
const otherLicense='44444444-4444-4444-8444-444444444444';
const option={id:licenseTypeId,track_license_option_id:optionId,offer_active:true,amount_cents:125099,active:true,slug:'digital-campaign',name:'Digital Campaign',description:'Approved description',terms_summary:'Approved usage and limitations',exclusive:false,base_price:1,price_override:0.01};
const track={id:trackId,slug:'synthetic-track',title:'Synthetic track',status:'approved',preview_file_path:'private-path-not-for-events',license_options:[option]};
function offerService({data=track,role='buyer',demo=false}={}) {
  const calls=[];
  const service=load('services/orders/license-offers.ts',{
    '@/lib/env':{env:{demoMode:demo}}, './checkout-pricing':{CHECKOUT_CURRENCY:'USD'},
    '@/services/auth/session':{requireSession:async expected=>{calls.push(['role',expected]);if(role!==expected)throw Error('role denied');return {id:trackId,role};}},
    '@/services/buyer/queries':{getBuyerTrackBySlug:async(...args)=>{calls.push(['read',...args]);return data;}}
  });
  return {...service,calls};
}
const offers=offerService().getTrackLicenseOffers(track);
const second={...offers[0],licenseTypeId:otherLicense,slug:'broadcast',name:'Broadcast'};

test('selection identifiers are explicit and never accept amounts, arrays or URLs',()=>{
  assert.deepEqual(selection.readBuyerSelection(licenseTypeId),{licenseTypeId});
  for(const value of [null,undefined,[],[licenseTypeId],'lt-1','https://evil.invalid',licenseTypeId+'|0.01',{licenseTypeId}]) assert.equal(selection.readBuyerSelection(value),null);
  assert.deepEqual(selection.readBuyerSelection('lt-1',true),{licenseTypeId:'lt-1'});
  const url=new URL(selection.checkoutReviewHref('unsafe/slug',licenseTypeId),'https://app.invalid');
  assert.equal(url.origin,'https://app.invalid');assert.equal(url.pathname,'/buyer/checkout/unsafe%2Fslug');
  assert.deepEqual([...url.searchParams.keys()],['licenseTypeId']);
  assert.equal(selection.formatOfferPrice(offers[0]),'$1,250.99');
});
test('server offer preserves option/type identity and exact database cents; ignores legacy dollar display',()=>{
  assert.equal(offers[0].licenseTypeId,licenseTypeId);assert.equal(offers[0].trackLicenseOptionId,optionId);
  assert.equal(offers[0].trackId,trackId);assert.equal(offers[0].amountCents,125099);assert.equal(offers[0].currency,'USD');
  assert.ok(!JSON.stringify(offers).includes('private-path'));
});
test('unapproved, previewless, inactive, missing and invalid-price offers fail closed',()=>{
  const svc=offerService();
  for(const status of ['draft','pending_review','rejected','archived']) assert.equal(svc.getTrackLicenseOffers({...track,status}).length,0);
  assert.equal(svc.getTrackLicenseOffers({...track,preview_file_path:null}).length,0);
  for(const patch of [{active:false},{offer_active:false},{track_license_option_id:undefined},{amount_cents:undefined},{amount_cents:0},{amount_cents:-1},{amount_cents:1.5},{amount_cents:NaN},{amount_cents:Infinity}]) {
    assert.equal(svc.getTrackLicenseOffers({...track,license_options:[{...option,...patch}]}).length,0,JSON.stringify(patch));
  }
});
test('review requires canonical buyer access, belongs-to-track selection and current server offer',async()=>{
  const svc=offerService();const review=await svc.loadBuyerCheckoutReview(track.slug,licenseTypeId);
  assert.equal(review.offer.amountCents,125099);assert.deepEqual(plain(svc.calls),[['role','buyer'],['read',track.slug,trackId]]);
  for(const role of ['artist','admin',null]) await assert.rejects(offerService({role}).loadBuyerCheckoutReview(track.slug,licenseTypeId),/role denied/);
  for(const value of [undefined,'bad',otherLicense,optionId,[licenseTypeId]]) assert.equal(await offerService().loadBuyerCheckoutReview(track.slug,value),null);
  for(const data of [null,{...track,license_options:[]},{...track,license_options:[{...option,active:false}]},{...track,license_options:[{...option,offer_active:false}]}]) assert.equal(await offerService({data}).loadBuyerCheckoutReview(track.slug,licenseTypeId),null);
});
test('price and material terms produce new revisions, without reserving the old offer',()=>{
  const svc=offerService();
  for(const patch of [{amount_cents:125199},{terms_summary:'Changed approved terms'},{description:'Changed description'},{exclusive:true}]) {
    assert.notEqual(svc.getTrackLicenseOffers({...track,license_options:[{...option,...patch}]} )[0].revision,offers[0].revision);
  }
  assert.equal(svc.getTrackLicenseOffers({...track,lyrics:'not part of offer'})[0].revision,offers[0].revision);
});
test('session comparison stores identifiers and digest only and tolerates storage denial',()=>{
  const data=new Map();const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  selection.rememberViewedOffer(storage,offers[0]);assert.equal(selection.previousOfferRevision(storage,offers[0]),offers[0].revision);
  assert.deepEqual(Object.keys(JSON.parse([...data.values()][0])).sort(),['licenseTypeId','revision']);
  assert.equal(selection.previousOfferRevision(storage,second),null);
  const denied={getItem(){throw Error()},setItem(){throw Error()}};
  assert.doesNotThrow(()=>selection.rememberViewedOffer(denied,offers[0]));assert.equal(selection.previousOfferRevision(denied,offers[0]),null);
});
function selectorHarness(initialLicenseTypeId=null) {
  const runner=hookRunner();const events=[];const navigation=[];const stored=[];
  const Component=load('components/catalog/buyer-license-selector.tsx',{
    react:runner.hooks,'next/link':{default:'link'},'next/navigation':{useRouter:()=>({replace:(...args)=>navigation.push(args)})},
    '@/components/analytics/provider':{useAnalytics:()=> (...args)=>events.push(plain(args))},'@/components/ui/button':{Button:'button'},'./license-option-card':{LicenseOptionCard:'license-card'}
  },{window:{sessionStorage:{setItem:(...args)=>stored.push(args)}}}).BuyerLicenseSelector;
  const props={trackId,trackSlug:track.slug,offers:[offers[0],second],initialLicenseTypeId,paymentAvailable:false};
  const render=()=>runner.render(Component,props);
  return {events,navigation,stored,props,render,cards:tree=>elements(tree,e=>e.type==='license-card')};
}
test('no default, render or hydration event; payment-off selection is interactive and exact',()=>{
  const h=selectorHarness();let tree=h.render();assert.equal(h.events.length,0);
  assert.ok(h.cards(tree).every(card=>card.props.selected===false));
  assert.equal(elements(tree,e=>e.type==='button'&&e.props.disabled).length,1);
  h.cards(tree)[0].props.onSelect();tree=h.render();
  assert.deepEqual(h.events,[['license_selected',{track_id:trackId,license_type:'digital-campaign',selection_method:'explicit'}]]);
  assert.equal(h.cards(tree)[0].props.selected,true);assert.equal(elements(tree,e=>e.type==='button'&&e.props.disabled).length,0);
  assert.match(h.navigation[0][0],/licenseTypeId=/);assert.ok(!JSON.stringify(h.events).includes('price'));
  const filtered=schema.filterProperties('license_selected',{...h.events[0][1],email:'secret@example.com',url:'https://private',price:0.01,licenseTypeId});
  assert.deepEqual(filtered,h.events[0][1]);
});
test('already-selected clicks do not duplicate; another genuine selection emits once',()=>{
  const h=selectorHarness();let tree=h.render();h.cards(tree)[0].props.onSelect();h.cards(tree)[0].props.onSelect();
  tree=h.render();h.cards(tree)[0].props.onSelect();assert.equal(h.events.length,1);
  h.cards(tree)[1].props.onSelect();h.cards(tree)[1].props.onSelect();assert.equal(h.events.length,2);
  assert.equal(h.events[1][1].license_type,'broadcast');assert.equal(h.navigation.length,2);
});
test('deep link, Back restoration, remount and price refresh never emit',()=>{
  for(let i=0;i<3;i++) {
    const h=selectorHarness(licenseTypeId);let tree=h.render();assert.equal(h.cards(tree)[0].props.selected,true);
    h.props.offers=[{...offers[0],amountCents:999999},second];tree=h.render();
    h.cards(tree)[0].props.onSelect();assert.equal(h.events.length,0);assert.equal(h.navigation.length,0);
  }
  const invalid=selectorHarness(optionId);assert.ok(invalid.cards(invalid.render()).every(card=>!card.props.selected));
  const back=selectorHarness(licenseTypeId);back.render();back.props.initialLicenseTypeId=otherLicense;
  assert.equal(back.cards(back.render())[1].props.selected,true);
  back.props.initialLicenseTypeId=null;assert.ok(back.cards(back.render()).every(card=>!card.props.selected));
  assert.equal(back.events.length,0);assert.equal(back.navigation.length,0);
});
test('native radio and details are separate controls; opening details cannot call selection',()=>{
  const {LicenseOptionCard}=load('components/catalog/license-option-card.tsx');let selected=0;
  const tree=LicenseOptionCard({offer:offers[0],selected:false,onSelect:()=>selected++});
  const radio=elements(tree,e=>e.type==='input')[0];const label=elements(tree,e=>e.type==='label')[0];const details=elements(tree,e=>e.type==='details')[0];
  assert.equal(radio.props.type,'radio');assert.equal(radio.props.checked,false);assert.equal(label.props.htmlFor,radio.props.id);
  assert.equal(elements(label,e=>e.type==='details'||e.type==='summary').length,0);assert.equal(details.props.onClick,undefined);assert.equal(selected,0);
  radio.props.onChange();assert.equal(selected,1);
});
test('real review render has no analytics or commerce, requires new confirmation, and reports changed offer',()=>{
  const runner=hookRunner();let mutations=0;
  const Component=load('components/checkout/license-review.tsx',{react:runner.hooks,'react-dom':{useFormStatus:()=>({pending:false})},'next/link':{default:'link'},'@/components/ui/button':{Button:'button'}},
    {window:{sessionStorage:{getItem:()=>JSON.stringify({licenseTypeId,revision:'a'.repeat(64)})}}}).LicenseReview;
  const props={review:{trackId,trackSlug:track.slug,trackTitle:track.title,offer:offers[0]},paymentAvailable:false,testPayment:false,action:async()=>mutations++};
  const tree=runner.render(Component,props);
  assert.equal(mutations,0);assert.equal(elements(tree,e=>e.type==='input'&&e.props.type==='radio').length,0);
  const checkbox=elements(tree,e=>e.type==='input'&&e.props.type==='checkbox')[0];assert.equal(checkbox.props.checked,false);assert.equal(checkbox.props.required,true);
  assert.equal(elements(tree,e=>e.props?.role==='alert').length,1);
  const button=elements(tree,e=>typeof e.type==='function'&&e.type.name==='PaymentButton')[0];assert.equal(button.props.disabled,true);
  checkbox.props.onChange({target:{checked:true}});const next=runner.render(Component,props);assert.equal(elements(next,e=>typeof e.type==='function'&&e.type.name==='PaymentButton')[0].props.disabled,true);
  assert.deepEqual(elements(tree,e=>e.type==='input'&&e.props.type==='hidden').map(e=>e.props.name),['trackId','trackSlug','licenseTypeId','reviewRevision']);
});
test('checkout page uses read-only review and rejects missing/invalid selections without substitution',async()=>{
  const review={trackId,trackSlug:track.slug,trackTitle:track.title,offer:offers[0]};let mutations=0;
  const base={'next/navigation':{redirect:url=>{throw Object.assign(Error('redirect'),{url})}},'@/components/checkout/license-review':{LicenseReview:'review'},'@/lib/server-env':{getPaymentDisplayConfiguration:()=>({checkoutAvailable:false,paymentMode:'off'})},'@/services/buyer/actions':{createOrderAction:async()=>mutations++}};
  const page=load('app/(app)/buyer/checkout/[trackSlug]/page.tsx',{...base,'@/services/orders/license-offers':{loadBuyerCheckoutReview:async()=>review}}).default;
  const tree=await page({params:Promise.resolve({trackSlug:track.slug}),searchParams:Promise.resolve({licenseTypeId,error:'PRIVATE RAW ERROR'})});
  assert.equal(mutations,0);assert.equal(elements(tree,e=>e.type==='review').length,1);assert.ok(!JSON.stringify(tree).includes('PRIVATE RAW ERROR'));
  const bad=load('app/(app)/buyer/checkout/[trackSlug]/page.tsx',{...base,'@/services/orders/license-offers':{loadBuyerCheckoutReview:async()=>null}}).default;
  await assert.rejects(bad({params:Promise.resolve({trackSlug:track.slug})}),error=>error.url===selection.licenseDetailHref(track.slug,null,true));assert.equal(mutations,0);
});
test('detail integrates selection and review contains no repeated selector or automatic payment calls',()=>{
  const detail=source('app/(app)/buyer/catalog/[slug]/page.tsx');
  assert.match(detail,/BuyerLicenseSelector/);assert.match(detail,/Select License/);assert.match(detail,/BuyerLicenseSelector key=\{track.id\}/);
  const review=source('app/(app)/buyer/checkout/[trackSlug]/page.tsx');
  assert.doesNotMatch(review,/defaultChecked|LicenseForm|await createOrderAction|createStripeCheckoutSession|\.insert\(/);
  for(const file of ['services/analytics/checkout.ts','services/buyer/actions.ts','app/api/checkout/route.ts']) assert.doesNotMatch(source(file),/captureAcceptedLicense|default_accepted/);
});
