import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import * as schema from '../lib/analytics/schema.ts';
import * as config from '../lib/analytics/config.ts';
import * as transport from '../lib/analytics/transport.ts';
import * as triggers from '../lib/analytics/triggers.ts';
import { reconcileAppUserProfile } from '../services/auth/reconcile-app-user.mjs';
const require = createRequire(import.meta.url);
const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';
const cfg = config.resolveAnalyticsConfig({ ANALYTICS_ENABLED: 'true', POSTHOG_HOST: 'https://us.i.posthog.com', POSTHOG_PREVIEW_TOKEN: 'phc_synthetic' }, 'preview');
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
function load(path, stubs = {}, globals = {}) {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, Request, Response, FormData, File, URL, TextDecoder, AbortSignal, crypto: webcrypto, console: { warn() {}, info() {}, error() {} },
    fetch: async () => { throw Error('Unmocked network forbidden'); }, process: { env: {} }, require: name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), ...globals }, { filename: path });
  return loadedModule.exports;
}
const sensitive = { email: 'private@example.com', raw_query: 'private song', lyrics: 'private lyrics', filename: 'private.wav', storage_path: 'bucket/private', agreement: 'private agreement', url: 'https://private.invalid/file?token=secret#secret', '$current_url': 'https://private.invalid', '$set': { email: 'private@example.com' }, stripe: { amount: 42 }, role: 'admin', environment: 'production', is_test: false };
test('every schema strips unknown private properties; strings cannot smuggle free text', () => {
  const examples = {
    signup_completed: { confirmation_required: true }, onboarding_started: {}, onboarding_completed: {},
    submission_started: { submission_attempt_id: id, surface: 'submission_create' },
    submission_completed: { track_id: id, is_resubmission: false },
    catalog_searched: { search_id: id, result_count: 0, has_query: true, filter_count: 2, filter_types: ['genre','mood'], sort: 'featured' },
    track_preview_started: { track_id: id, surface: 'catalog' },
    license_selected: { track_id: id, license_type: 'broadcast', selection_method: 'default_accepted' },
    checkout_started: { order_id: orderId, track_id: id, license_type: 'broadcast', checkout_attempt_id: other },
    purchase_verified: { order_id: orderId, track_id: id, license_type: 'broadcast', payment_mode: 'test' },
    funnel_step_failed: { step: 'submission', error_code: 'validation', retryable: true }
  };
  for (const [event, properties] of Object.entries(examples)) {
    assert.deepEqual(schema.filterProperties(event, { ...sensitive, ...properties }), properties);
    for (const [key, value] of Object.entries(properties)) if (typeof value === 'string') {
      for (const privateValue of Object.values(sensitive).filter(v => typeof v === 'string')) assert.equal(schema.filterProperties(event, { ...properties, [key]: privateValue }), null);
    }
  }
  assert.equal(schema.filterProperties('$pageview', {}), null);
  assert.equal(schema.filterProperties('__proto__', {}), null);
});
test('environment is explicit, preview cannot fall back to production, local/demo disabled', () => {
  const vars = { ANALYTICS_ENABLED: 'true', POSTHOG_HOST: 'https://us.i.posthog.com', POSTHOG_PRODUCTION_TOKEN: 'phc_prod', POSTHOG_PREVIEW_TOKEN: 'phc_preview', NODE_ENV: 'production' };
  assert.equal(config.resolveAnalyticsConfig(vars, 'preview').token, 'phc_preview');
  for (const [v, target] of [[{...vars, ANALYTICS_ENABLED:'false'},'preview'], [{...vars, POSTHOG_PREVIEW_TOKEN:undefined},'preview'], [vars,'local'], [{...vars,SYNC_EXCHANGE_DEMO_MODE:'true'},'production'], [{...vars,POSTHOG_HOST:'https://evil.invalid/?secret'},'preview'], [{...vars,POSTHOG_PREVIEW_TOKEN:'phc_prod'},'preview']]) assert.equal(config.resolveAnalyticsConfig(v,target), null);
  assert.equal(config.commonProperties({...cfg,internalIds:[id]}, {id,role:'buyer'}).is_internal,true);
  assert.equal(config.commonProperties(cfg, {id,role:'buyer'}).is_test,true);
  const prod = {...cfg,environment:'production',testIds:[id]};
  assert.equal(config.commonProperties(prod,{id,role:'buyer'}).is_test,true);
  assert.equal(config.commonProperties({...prod,testIds:[]},{id,role:'buyer'}).is_test,false);
  assert.equal(config.commonProperties(prod,{id,role:'admin'}).is_internal,true);
});
test('transport sends only allowlisted data, stable identity/UUID/time; no URL/referrer or request forwarding', async () => {
  const row = {id:other,event:'onboarding_started',actor_id:id,actor_role:'artist',properties:sensitive,occurred_at:'2026-09-15T01:00:00Z',environment:'preview',is_internal:false,is_test:true};
  const payloads=[];
  const request=async (url,options) => { assert.equal(url,'https://us.i.posthog.com/i/v0/e/'); assert.deepEqual(options.headers,{'Content-Type':'application/json'}); payloads.push(JSON.parse(options.body)); return {ok:true}; };
  await transport.sendEvent(cfg,row,request); await transport.sendEvent(cfg,row,request);
  assert.deepEqual(payloads[0],payloads[1]); assert.equal(payloads[0].distinct_id,id);
  assert.equal(payloads[0].properties.$ip,null); assert.equal(payloads[0].properties.$geoip_disable,true);
  assert.ok(!JSON.stringify(payloads).includes('private'));
  assert.equal(await transport.sendEvent(cfg,{...row,actor_id:'email@example.com'},request),false);
  assert.equal(await transport.sendEvent(cfg,{...row,environment:'production'},request),false);
  assert.equal(await transport.sendEvent(cfg,row,async()=>{throw Error('private error')}),false);
});
function endpoint(user = { id, role:'buyer' }) {
  const captured=[];
  const POST=load('app/api/analytics/route.ts',{'@/services/analytics/actor':{getAnalyticsActor:async()=>user},'@/services/analytics/server':{analyticsConfig:()=>cfg,captureEvent:async(...args)=>captured.push(args)},'@/lib/analytics/schema':schema}).POST;
  const request=(input={},origin='https://app.invalid')=>new Request('https://app.invalid/api/analytics',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({expectedUserId:id,event:'catalog_searched',properties:{search_id:other,result_count:2,has_query:true,filter_count:0,filter_types:[],sort:'featured',...sensitive},...input})});
  return {POST,captured,request};
}
test('endpoint derives identity and flags from session; rejects logout, account switch, forged purchases and wrong roles',async()=>{
  const h=endpoint(); assert.equal((await h.POST(h.request())).status,204); assert.equal(h.captured[0][0].id,id); assert.equal(h.captured[0][0].role,'buyer'); assert.equal(h.captured[0][2].environment,undefined);
  assert.equal((await h.POST(h.request({event:'purchase_verified'}))).status,400);
  assert.equal((await h.POST(h.request({},'https://evil.invalid'))).status,403);
  const switched=endpoint({id:other,role:'buyer'}); assert.equal((await switched.POST(switched.request())).status,409);
  const loggedOut=endpoint(null); assert.equal((await loggedOut.POST(loggedOut.request())).status,401);
  const artist=endpoint({id,role:'artist'}); assert.equal((await artist.POST(artist.request())).status,400);
  assert.equal((await h.POST(h.request({properties:{junk:'x'.repeat(3000)}}))).status,413);
});
test('preview counts actual playing once, never click/resume; submissions start once per attempt',()=>{
  const events=[]; const capture=(...args)=>events.push(args);
  const preview=triggers.previewTracker(capture);
  assert.equal(events.length,0); preview.failed(); assert.equal(events[0][0],'funnel_step_failed');
  preview.playing(id); preview.playing(id); preview.playing(other); assert.equal(events.filter(e=>e[0]==='track_preview_started').length,2);
  const submission=triggers.submissionTracker(capture,'submission_create'); assert.equal(submission.start(),submission.start());
  assert.equal(events.filter(e=>e[0]==='submission_started').length,1);
  assert.equal(triggers.submissionCompleted('draft'),false); assert.equal(triggers.submissionCompleted('pending_review','draft'),true); assert.equal(triggers.submissionCompleted('pending_review','pending_review'),false);
  assert.equal(triggers.selectionMethod(null),'default_accepted'); assert.equal(triggers.selectionMethod('explicit'),'explicit'); assert.equal(triggers.selectionMethod('private@example.com'),'default_accepted');
});
function outboxHarness() {
  const rows=[]; const sent=[]; let transportWorks=true; let ackWorks=true; let lease=0;
  const db={rpc(name,args){ const run=()=>{
    if(name==='enqueue_analytics_event') {
      let row=rows.find(r=>r.dedupe_key===args.p_dedupe_key && r.environment===args.p_environment);
      if(!row) { row={id:webcrypto.randomUUID(),dedupe_key:args.p_dedupe_key,event:args.p_event,actor_id:args.p_actor_id,actor_role:args.p_actor_role,properties:args.p_properties,environment:args.p_environment,is_internal:args.p_is_internal,is_test:args.p_is_test,occurred_at:'2026-09-15T01:00:00Z',delivered_at:null,lease_id:null}; rows.push(row); }
      return {data:row.id};
    }
    const row=rows.find(r=>(!args.p_id||r.id===args.p_id)&&r.environment===args.p_environment&&!r.delivered_at&&!r.lease_id);
    if(row) row.lease_id=String(++lease);
    return {data:row?[{...row}]:[]};
  }; return {abortSignal:async()=>run()};},from(){let filters={};return {update(values){this.values=values;return this;},eq(k,v){filters[k]=v;return this;},async abortSignal(){if(!ackWorks)return {error:{}};const row=rows.find(r=>r.id===filters.id&&r.lease_id===filters.lease_id);if(row)Object.assign(row,this.values);return {error:null};}};}};
  const restart=(target='preview')=>load('services/analytics/server.ts',{'server-only':{},'@/lib/env':{env:{demoMode:false},getDeploymentTarget:()=> target},'@/lib/analytics/config':config,'@/lib/analytics/schema':schema,'@/lib/analytics/transport':{sendEvent:async(c,row)=>{sent.push(plain(row));return transportWorks;}},'@/services/supabase/admin':{createAdminSupabaseClient:()=>db}}, {process:{env:{ANALYTICS_ENABLED:'true',POSTHOG_HOST:'https://us.i.posthog.com',POSTHOG_PREVIEW_TOKEN:'phc_synthetic',POSTHOG_PRODUCTION_TOKEN:'phc_syntheticprod'}}});
  return {rows,sent,restart,expire(){for(const r of rows)r.lease_id=null;},transportWorks(v){transportWorks=v;},ackWorks(v){ackWorks=v;}};
}
test('durable outbox deduplicates repeated/concurrent purchases across module restarts',async()=>{
  const h=outboxHarness(); const props={order_id:orderId,track_id:other,license_type:'broadcast',payment_mode:'test'};
  const server=h.restart(); const ids=await Promise.all(Array.from({length:5},()=>server.enqueueEvent({id,role:'buyer'},'purchase_verified',props,`purchase:${orderId}`)));
  assert.equal(new Set(ids).size,1); assert.equal(h.rows.length,1);
  await Promise.all([server.deliverEvent(ids[0]),h.restart().deliverEvent(ids[0])]);
  assert.equal(h.sent.length,1); assert.ok(h.rows[0].delivered_at);
  await h.restart().deliverEvent(ids[0]); assert.equal(h.sent.length,1);
});
test('ingestion/ack failures preserve pending event and retry with identical UUID/time/user',async()=>{
  const h=outboxHarness(); const server=h.restart(); const eventId=await server.enqueueEvent({id,role:'artist'},'onboarding_started',{},'started');
  h.transportWorks(false); assert.equal(await server.deliverEvent(eventId),false); assert.equal(h.rows[0].delivered_at,null);
  h.expire(); h.transportWorks(true); h.ackWorks(false); assert.equal(await h.restart().deliverEvent(eventId),false);
  h.expire(); h.ackWorks(true); assert.equal(await h.restart().deliverEvent(eventId),true);
  for(const row of h.sent) for(const key of ['id','occurred_at','actor_id','event']) assert.equal(row[key],h.sent[0][key]);
});
function purchaseHarness({paid=true,amount=100,currency='usd',persisted=true,role='buyer',enqueueFailure=false,adapterEnabled=true,sessionId='cs_test',storedSessionId='cs_test',livemode=false,evidenceExists=true}={}) {
  const events=[];
  const proof={order_id:orderId,buyer_user_id:id,track_id:other,checkout_session_id:storedSessionId,payment_intent_id:'pi_fixture',amount_minor:100,currency:'USD',license_type:'broadcast',payment_mode:'test'};
  const db={rpc(name,args){assert.equal(name,'get_analytics_verified_purchase');assert.deepEqual(plain(args),{p_order_id:orderId,p_provider_account:'acct_fixture',p_provider_event_id:'evt_fixture'});events.push('read:evidence');return {abortSignal:async()=>({data:persisted&&role==='buyer'&&evidenceExists?[proof]:[],error:null})};}};
  const service=load('services/analytics/purchase.ts',{'server-only':{},'@/lib/server-env':{getPurchaseCompletionAdapterConfiguration:()=>({enabled:adapterEnabled,providerAccount:'acct_fixture'}),assertStripeRuntimeObject(_label,input){if(input.livemode!==false)throw Error('wrong mode');}},'@/services/supabase/admin':{createAdminSupabaseClient:()=>db},'./server':{analyticsConfig:()=>cfg,enqueueEvent:async(...args)=>{events.push(args);if(enqueueFailure)throw Error('analytics_enqueue_failed');return other;},deliverEvent:async()=>events.push('deliver')}});
  const session={id:sessionId,client_reference_id:orderId,payment_status:paid?'paid':'unpaid',payment_intent:'pi_fixture',amount_total:amount,currency,livemode,metadata:{},customer_details:{email:'private@example.com'}};
  return {run:()=>service.recordVerifiedPurchase(orderId,session,'evt_fixture'),events};
}
test('purchase requires paid session, immutable matching evidence, persisted payment and canonical buyer',async()=>{
  for(const options of [{amount:1},{currency:'eur'},{persisted:false},{role:'artist'},{enqueueFailure:true},{sessionId:'cs_test_other'},{storedSessionId:null},{livemode:true},{evidenceExists:false}]) {const h=purchaseHarness(options);await assert.rejects(h.run());assert.ok(!h.events.includes('deliver'));}
  const dormant=purchaseHarness({adapterEnabled:false});await dormant.run();assert.equal(dormant.events.length,0);
  const unpaid=purchaseHarness({paid:false});await unpaid.run();assert.equal(unpaid.events.length,0);
  const h=purchaseHarness();await h.run();const event=h.events.find(Array.isArray);assert.equal(event[0].id,id);assert.equal(event[1],'purchase_verified');assert.equal(event[3],`purchase:${orderId}`);assert.ok(!JSON.stringify(event).includes('private'));
});
test('outbox SQL grants only service role access and serializes claims, dedupe and quotas',()=>{
  const sql=source('supabase/migrations/20260915072720_analytics_purchase_outbox.sql');
  for(const invariant of ['enable row level security','unique (environment, dedupe_key)','for update skip locked','pg_advisory_xact_lock','security invoker',"o.paid_at is not null",'to service_role','from public, anon, authenticated']) assert.ok(sql.includes(invariant),invariant);
  assert.ok(!sql.includes('security definer'));
});

// A small hook runner executes the real UI handlers without browser/network access.
function hookRunner() {
  const slots=[];let cursor=0;const effects=[];
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const hooks={
    createContext:()=>({Provider:'context'}),useContext:()=>null,
    useRef(initial){const n=cursor++;return slots[n] ||= {current:initial};},
    useState(initial){const n=cursor++;if(!(n in slots))slots[n]=initial;return [slots[n],v=>{slots[n]=typeof v==='function'?v(slots[n]):v;}];},
    useMemo(fn,deps){const n=cursor++;if(!same(slots[n]?.deps,deps))slots[n]={deps,value:fn()};return slots[n].value;},
    useCallback(fn,deps){return hooks.useMemo(()=>fn,deps);},
    useEffect(fn,deps){const n=cursor++;if(!same(slots[n]?.deps,deps)){slots[n]?.cleanup?.();const state={deps};slots[n]=state;effects.push(()=>{state.cleanup=fn();});}}
  };
  return {hooks,render(Component,props={}){cursor=0;const tree=Component(props);while(effects.length)effects.shift()();return tree;}};
}
function findElement(tree,predicate) {
  if(!tree||typeof tree!=='object')return null;
  if(Array.isArray(tree)){for(const child of tree){const found=findElement(child,predicate);if(found)return found;}return null;}
  if(predicate(tree))return tree;
  return findElement(tree.props?.children,predicate);
}
test('real catalog component debounces search changes and sends only counts and controlled sort',()=>{
  const runner=hookRunner();const events=[];let filters={query:'',genre:'all',mood:'all',licenseType:'all',vocalProfile:'all',explicitFilter:'all',priceBand:'all',minBpm:'',maxBpm:'',sort:'featured',layout:'list'};
  const timers=new Map();let next=0;const capture=(...args)=>events.push(args);
  const Browser=load('components/catalog/buyer-catalog-browser.tsx',{
    react:runner.hooks,'@/lib/analytics/schema':schema,'@/components/buyer/buyer-workspace.module.css':{},'@/components/ui/first-use-state':{FirstUseState:'empty'},'@/components/analytics/provider':{useAnalytics:()=>capture},'lucide-react':{LayoutGrid:'grid',Rows3:'rows',SlidersHorizontal:'sliders',X:'x'},
    '@/components/catalog/buyer-track-card':{BuyerTrackCard:'card'},'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},
    '@/components/audio/buyer-discovery-provider':{useBuyerDiscovery:()=>({filters,setFilters(){}})},'@/lib/catalog-discovery':{filterCatalog:()=>[],defaultCatalogFilters:filters}
  },{setTimeout(fn){const n=++next;timers.set(n,fn);return n;},clearTimeout(n){timers.delete(n);}}).BuyerCatalogBrowser;
  runner.render(Browser,{tracks:[{id:other,genre:'Pop',mood:[],license_options:[]}],basePath:'/buyer/catalog'});assert.equal(timers.size,0);
  filters={...filters,query:'private search'};runner.render(Browser,{tracks:[{id:other,genre:'Pop',mood:[],license_options:[]}],basePath:'/buyer/catalog'});
  filters={...filters,query:'private search continued'};runner.render(Browser,{tracks:[{id:other,genre:'Pop',mood:[],license_options:[]}],basePath:'/buyer/catalog'});
  assert.equal(timers.size,1);for(const fn of timers.values())fn();timers.clear();
  assert.equal(events.length,1);assert.equal(events[0][1].result_count,0);assert.equal(events[0][1].has_query,true);assert.ok(!JSON.stringify(events).includes('private'));
  filters={...filters,layout:'grid'};runner.render(Browser,{tracks:[{id:other,genre:'Pop',mood:[],license_options:[]}],basePath:'/buyer/catalog'});assert.equal(timers.size,0);
  filters={...filters,genre:'Private genre',minBpm:'120',sort:'price-low'};runner.render(Browser,{tracks:[{id:other,genre:'Pop',mood:[],license_options:[]}],basePath:'/buyer/catalog'});for(const fn of timers.values())fn();timers.clear();
  assert.deepEqual(plain(events[1][1].filter_types),['genre','minBpm']);assert.equal(events[1][1].filter_count,2);assert.equal(events[1][1].sort,'price-low');assert.ok(!JSON.stringify(events).includes('Private genre'));
  const empty=runner.render(Browser,{tracks:[],basePath:'/buyer/catalog'});assert.equal(empty.type,'empty');
});
test('real license form marks explicit changes and preserves default acceptance without reading input values',()=>{
  const runner=hookRunner();const events=[];class Input {name='licenseSelection';dataset={licenseType:'broadcast'};value='private payment details';}
  const Form=load('components/analytics/license-form.tsx',{react:runner.hooks,'./provider':{useAnalytics:()=> (...args)=>events.push(args)},'@/lib/analytics/schema':schema},{HTMLInputElement:Input}).LicenseForm;
  let tree=runner.render(Form,{trackId:other,action:async()=>{},children:null});
  assert.equal(findElement(tree,e=>e.type==='input').props.value,'default_accepted');
  tree.props.onChange({target:new Input()});tree=runner.render(Form,{trackId:other,action:async()=>{},children:null});
  assert.equal(findElement(tree,e=>e.type==='input').props.value,'explicit');assert.equal(events[0][0],'license_selected');assert.ok(!JSON.stringify(events).includes('private'));
});
test('browser provider sends no identity persistence or ambient browser metadata and is inert when disabled',async()=>{
  const requests=[];const runner=hookRunner();
  const Provider=load('components/analytics/provider.tsx',{react:runner.hooks,'@/lib/analytics/schema':schema},{fetch:async(...args)=>{requests.push(args);return {ok:true};}}).AnalyticsProvider;
  let tree=runner.render(Provider,{userId:id,enabled:false,children:null});tree.props.value('onboarding_started',sensitive);assert.equal(requests.length,0);
  tree=runner.render(Provider,{userId:id,enabled:true,children:null});tree.props.value('onboarding_started',sensitive);
  assert.equal(requests.length,1);assert.equal(requests[0][0],'/api/analytics');assert.equal(requests[0][1].referrerPolicy,'strict-origin');
  assert.deepEqual(JSON.parse(requests[0][1].body),{event:'onboarding_started',properties:{},expectedUserId:id});
});
test('manual outbox retry denies non-admin callers before dispatch and bounds each batch',async()=>{
  for(const role of [null,'buyer','artist','admin']) {
    let calls=0;
    const POST=load('app/api/admin/analytics/retry/route.ts',{'@/services/analytics/actor':{getAnalyticsActor:async()=>role?{id,role}:null},'@/services/analytics/server':{deliverEvent:async()=>{calls++;return true;}}}).POST;
    const response=await POST(new Request('https://app.invalid/api/admin/analytics/retry',{method:'POST',headers:{origin:'https://app.invalid'}}));
    assert.equal(response.status,role==='admin'?200:403);assert.equal(calls,role==='admin'?10:0);
  }
});

test('disabled analytics performs no authentication, outbox write, claim or transport',async()=>{
 let calls=0;const forbidden=()=>{calls++;throw Error('disabled side effect');};
 const server=load('services/analytics/server.ts',{'server-only':{},'@/lib/env':{env:{demoMode:false},getDeploymentTarget:()=> 'preview'},'@/lib/analytics/config':config,'@/lib/analytics/schema':schema,'@/lib/analytics/transport':{sendEvent:forbidden},'@/services/supabase/admin':{createAdminSupabaseClient:forbidden}});
 assert.equal(await server.enqueueEvent({id,role:'buyer'},'onboarding_started',{}),null);
 assert.equal(await server.deliverEvent(),false);await server.captureEvent({id,role:'buyer'},'onboarding_completed',{});
 const POST=load('app/api/analytics/route.ts',{'@/services/analytics/actor':{getAnalyticsActor:forbidden},'@/services/analytics/server':server,'@/lib/analytics/schema':schema}).POST;
 assert.equal((await POST(new Request('https://app.invalid/api/analytics',{method:'POST'}))).status,204);assert.equal(calls,0);
});

function actorHarness({user={id,user_metadata:{role:'admin'},app_metadata:{role:'admin'}},role='buyer',profileExists=true,profileError=false,enabled=true}={}) {
 const events=[];const reads=[];
 const db={auth:{getUser:async()=>({data:{user}})},from(table){reads.push(table);return {select(columns){assert.equal(columns,'role');return this;},eq(column,value){reads.push([column,value]);return this;},maybeSingle:async()=>({data:profileExists?{role}:null,error:profileError?{}:null})};}};
 const actor=load('services/analytics/actor.ts',{'server-only':{},'@/services/supabase/server':{createServerSupabaseClient:async()=>db},'@/services/supabase/admin':{createAdminSupabaseClient:()=>db},'@/lib/analytics/schema':schema,'./server':{analyticsConfig:()=>enabled?cfg:null,captureEvent:async(...args)=>events.push(args)}});
 return {actor,events,reads};
}
test('canonical roles override metadata, missing profiles fail closed, and stale server attribution is rejected',async()=>{
 for(const role of ['buyer','artist','admin',null]) {
  const h=actorHarness({role});assert.deepEqual(plain(await h.actor.getAnalyticsActor()),{id,role:role||'unassigned'});
 }
 for(const options of [{profileExists:false},{profileError:true},{role:'invented'},{user:null},{user:{id:'email@example.com'}}]) assert.equal(await actorHarness(options).actor.getAnalyticsActor(),null);
 const h=actorHarness();await h.actor.captureForUser(other,'checkout_started',{});assert.equal(h.events.length,0);
 await h.actor.captureForUser(id,'submission_completed',{});assert.equal(h.events.length,0);
 await h.actor.captureForUser(id,'onboarding_completed',{});assert.equal(h.events.length,1);assert.equal(h.events[0][0].role,'buyer');
 const disabled=actorHarness({enabled:false});await disabled.actor.captureForUser(id,'onboarding_started',{});await disabled.actor.capturePersistedSignup(id,true);assert.equal(disabled.reads.length,0);
});
test('persisted signup uses UUID and canonical role only, dedupes by account, and omits missing profiles',async()=>{
 const h=actorHarness({role:'artist'});await h.actor.capturePersistedSignup(id,true);
 assert.deepEqual(plain(h.events),[[{id,role:'artist'},'signup_completed',{confirmation_required:true},`signup:${id}`]]);
 for(const opts of [{profileExists:false},{profileError:true},{role:'forged'}]) {const bad=actorHarness(opts);await bad.actor.capturePersistedSignup(id,true);assert.equal(bad.events.length,0);}
});
test('failure codes, search filter names, browser purchase attempts and forbidden event names are rejected',()=>{
 for(const text of ['raw error','private@example.com','https://private.invalid','stack trace']) {
  assert.equal(schema.filterProperties('funnel_step_failed',{step:'checkout',error_code:text,retryable:true}),null);
  assert.equal(schema.filterProperties('catalog_searched',{search_id:id,result_count:1,has_query:true,filter_count:1,filter_types:[text],sort:'featured'}),null);
 }
 for(const role of ['artist','buyer','admin','unassigned']) assert.equal(schema.browserEventAllowed('purchase_verified',role,{}),false);
 for(const name of ['$pageview','$pageleave','$snapshot','$exception','$autocapture'])assert.equal(schema.filterProperties(name,{}),null);
});

function playbackHarness(withObserver=true) {
 const runner=hookRunner();const events=[];const observer=triggers.previewTracker((...args)=>events.push(args));
 const Provider=load('components/audio/preview-audio-provider.tsx',{
  react:runner.hooks,'next/image':{default:'image'},'next/link':{default:'link'},'lucide-react':{},
  '@/components/ui/button':{Button:'button'},'@/lib/utils':{formatDuration:()=>''},'./preview-audio-provider.module.css':{default:{}}
 }).PreviewAudioProvider;
 const tree=runner.render(Provider,{children:null,...(withObserver?{playbackObserver:observer}:{})});
 const node=findElement(tree,e=>e.type==='audio');let rejection=false;let deferred=null;
 const audio={paused:true,readyState:2,src:'',get currentSrc(){return this.src;},volume:0.7,muted:false,
  play:async()=>{if(deferred)await deferred;if(rejection)throw Error('private URL');audio.paused=false;},pause(){this.paused=true;},load(){},removeAttribute(){this.src='';}};
 node.props.ref.current=audio;
 const track={id:other,previewUrl:'https://private.invalid/file?signature=private',title:'Private title',discoverySurface:'track_detail'};
 return {runner,tree,node,audio,track,events,Provider,observer,reject(value){rejection=value;},defer(value){deferred=value;}};
}
test('current shared audio provider counts actual playback once per track, preserves surface and excludes artist auditions',async()=>{
 const h=playbackHarness();await h.tree.props.value.toggle(h.track);assert.equal(h.events.length,0);
 h.node.props.onPlaying();assert.deepEqual(h.events,[['track_preview_started',{track_id:other,surface:'track_detail'}]]);
 await h.tree.props.value.toggle(h.track);await h.tree.props.value.toggle(h.track);h.node.props.onPlaying();assert.equal(h.events.length,1);
 h.runner.render(h.Provider,{playbackObserver:h.observer});h.node.props.onPlaying();assert.equal(h.events.length,1);
 await h.tree.props.value.toggle({...h.track,id,discoverySurface:'catalog'});h.node.props.onPlaying();assert.equal(h.events.length,2);
 h.tree.props.value.close();h.node.props.onPlaying();assert.equal(h.events.length,2);
 const artist=playbackHarness(false);await artist.tree.props.value.toggle(artist.track);artist.node.props.onPlaying();artist.node.props.onError();assert.equal(artist.events.length,0);
 assert.ok(!JSON.stringify(h.events).includes('private'));
});
test('play rejection/error does not count a start; retry and stale switch preserve playback semantics',async()=>{
 const h=playbackHarness();h.reject(true);await h.tree.props.value.toggle(h.track);h.node.props.onError();assert.equal(h.events.length,1);assert.equal(h.events[0][0],'funnel_step_failed');
 h.node.props.onPlaying();assert.equal(h.events.length,1); // paused: not genuinely playing
 h.reject(false);await h.tree.props.value.toggle(h.track);h.node.props.onPlaying();assert.equal(h.events.at(-1)[0],'track_preview_started');
 const next=playbackHarness();let reject;next.defer(new Promise((_,r)=>reject=r));const pending=next.tree.props.value.toggle(next.track);
 next.defer(null);await next.tree.props.value.toggle({...next.track,id});reject(Error('private stale load'));await pending;next.node.props.onPlaying();
 assert.deepEqual(next.events,[['track_preview_started',{track_id:id,surface:'track_detail'}]]);
});
test('buyer wrapper supplies the observer while artist layout supplies none',()=>{
 const runner=hookRunner();const capture=()=>{};
 const Provider=load('components/audio/buyer-discovery-provider.tsx',{react:runner.hooks,'@/components/analytics/provider':{useAnalytics:()=>capture},'@/lib/analytics/triggers':triggers,'@/components/audio/preview-audio-provider':{PreviewAudioProvider:'audio-provider'},'@/lib/catalog-discovery':{defaultCatalogFilters:{}}}).BuyerDiscoveryProvider;
 assert.equal(typeof findElement(runner.render(Provider),e=>e.type==='audio-provider').props.playbackObserver.playing,'function');
 assert.ok(!source('app/(app)/artist/layout.tsx').includes('playbackObserver'));
});
test('onboarding first interaction dedupes within mount; no render-only event',()=>{
 const runner=hookRunner();const events=[];
 const Component=load('components/analytics/onboarding-interaction.tsx',{react:runner.hooks,'./provider':{useAnalytics:()=> (...args)=>events.push(args)}}).OnboardingInteraction;
 const tree=runner.render(Component,{children:null});assert.equal(events.length,0);tree.props.onChangeCapture();tree.props.onSubmitCapture();assert.deepEqual(plain(events),[['onboarding_started',{}]]);
});

function checkoutHarness({persistFailure=false,prepareFailure=false,sessionFailure=false,sessionChange={},role='buyer',authenticated=true,trackAvailable=true}={}) {
 const events=[];const captures=[];let boundOrderId=orderId;
 const redirect=url=>{const e=Error('redirect');e.url=url;e.digest='NEXT_REDIRECT';throw e;};
 const db={auth:{getUser:async()=>({data:{user:authenticated?{id,email:'private@example.com'}:null}})},from(table){
  let op='read',selected='';const q={select(v){selected=v;return q;},eq(){return q;},order(){return q;},limit(){return q;},
   insert(v){op='insert';if(table==='orders')boundOrderId=v.id;return q;},update(){op='update';return q;},delete(){op='delete';return q;},
   maybeSingle:async()=>({data:selected==='id, buyer_user_id'?{id:orderId,buyer_user_id:id}:null}),
   single:async()=>{events.push(op);return {data:{id:boundOrderId}};},
   then(resolve){events.push(op);return Promise.resolve({error:persistFailure&&op==='update'?{message:'private database error'}:null}).then(resolve);}};return q;}};
 const captureForUser=async(...args)=>{events.push(args[1]);captures.push(args);};
 const serverEnv={assertStripeServerConfiguration(){},assertStripeRuntimeObject(_label,session){if(session.livemode!==false)throw Error('wrong mode');},getPaymentRuntimeConfiguration:()=>({paymentMode:'test'}),getPaymentActivityMetadata:()=>({paymentMode:'test'})};
 const analytics=load('services/analytics/checkout.ts',{'server-only':{},'@/lib/server-env':serverEnv,'@/lib/analytics/schema':schema,'./actor':{captureForUser}});
 const stubs={
  '@/services/analytics/checkout':analytics,'@/services/analytics/actor':{captureForUser},
  'next/cache':{revalidatePath(){}},'next/headers':{cookies:async()=>({})},'next/navigation':{redirect,unstable_rethrow(e){if(e.digest==='NEXT_REDIRECT')throw e;}},'next/server':{NextResponse:{json:Response.json}},
  '@/lib/env':{env:{demoMode:false},hasSupabaseEnv:true},'@/lib/server-env':serverEnv,
  '@/lib/payment-mode.mjs':{canReusePendingOrderForPaymentMode:()=>false,getStripeCheckoutSessionMode:()=> 'test'},'@/lib/license':{},
  '@/services/orders/activity':{appendOrderActivityLog:async()=>{}},
  '@/services/stripe/server':{createStripeCheckoutSession:async args=>{events.push('stripe');assert.equal(args.amountCents,100);if(sessionFailure)throw Error('private Stripe response');return {id:'cs_test_fixture',url:'https://checkout.stripe.com/c/pay/test',livemode:false,client_reference_id:args.orderId,...sessionChange};}},
  '@/services/purchase-completion/server':{preparePurchaseCompletionCheckout:async()=>{events.push('evidence-prepared');if(prepareFailure)throw Error('private preparation error');}},
  '@/services/auth/user-profiles':{selectUserProfileCompat:async()=>({data:{role}})},'@/services/auth/session':{resolveRoleRedirect:()=>'/login'},
  '@/services/supabase/privileged':{createPrivilegedSupabaseClient:async()=>db},'@/services/supabase/server':{createServerSupabaseClient:async()=>db},'@/services/supabase/schema-compat':{isMissingColumnError:()=>false},
  '@/services/buyer/queries':{getBuyerTrackBySlug:async()=>trackAvailable?{id:other,slug:'synthetic',license_options:[{id:orderId,slug:'broadcast',base_price:1,name:'Broadcast'}]}:null},
  '@/services/orders/checkout-pricing':{loadTrustedCheckoutDetails:async()=>({order:{id:orderId,buyer_user_id:id,status:'pending',track_id:other,license_type_id:orderId},licenseType:{slug:'broadcast'},amountCents:100,currency:'USD'}),getStoredOrderPricingMismatch:()=>({amountMismatch:false,currencyMismatch:false})},
  '@/services/security/rate-limit':{consumeRateLimit:async()=>({status:'allowed'}),rateLimitErrorResponse:()=>null}
 };
 const action=load('services/buyer/actions.ts',stubs).createOrderAction;
 const POST=load('app/api/checkout/route.ts',stubs).POST;
 return {events,captures,async action(method){const form=new FormData();for(const [k,v] of Object.entries({trackId:other,trackSlug:'synthetic',licenseSelection:orderId+'|0.01',...(method?{analyticsSelectionMethod:method}:{})}))form.set(k,v);try{await action(form);}catch(e){assert.equal(e.digest,'NEXT_REDIRECT');}},async api(){try{return await POST(new Request('https://app.invalid/api/checkout',{method:'POST',body:JSON.stringify({orderId})}));}catch(e){if(!sessionFailure)throw e;}}};
}
test('current marketplace action and API capture only after Stripe and successful session persistence',async()=>{
 for(const method of ['action','api']) {
  const h=checkoutHarness();await h[method]();const start=h.captures.find(e=>e[1]==='checkout_started');assert.ok(start);
  assert.equal(start[0],id);assert.equal(start[2].track_id,other);assert.equal(start[2].license_type,'broadcast');
  assert.ok(h.events.indexOf('evidence-prepared')<h.events.indexOf('stripe'));
  assert.ok(h.events.indexOf('checkout_started')>h.events.lastIndexOf('update'));
  assert.ok(!JSON.stringify(h.captures).includes('private'));assert.ok(!JSON.stringify(h.captures).includes('https://'));
  for(const opts of [{persistFailure:true},{prepareFailure:true},{sessionFailure:true},{authenticated:false},{role:'artist'},{sessionChange:{url:null}},{sessionChange:{url:'http://checkout.stripe.com'}},{sessionChange:{url:'https://evil.invalid'}},{sessionChange:{client_reference_id:other}},{sessionChange:{livemode:true}}]) {
   const bad=checkoutHarness(opts);await bad[method]();assert.equal(bad.captures.filter(e=>e[1]==='checkout_started').length,0,JSON.stringify(opts));
  }
 }
});
test('default license is accepted after server validation only; explicit UI selection is not counted again',async()=>{
 const h=checkoutHarness();await h.action();assert.equal(h.captures[0][1],'license_selected');assert.equal(h.captures[0][2].selection_method,'default_accepted');
 const explicit=checkoutHarness();await explicit.action('explicit');assert.equal(explicit.captures.filter(e=>e[1]==='license_selected').length,0);
 const invalid=checkoutHarness({trackAvailable:false});await invalid.action();assert.equal(invalid.captures.length,0);
 const failed=checkoutHarness({persistFailure:true});await failed.action();assert.ok(failed.captures.some(e=>e[1]==='funnel_step_failed'&&e[2].error_code==='checkout_failed'));
 assert.ok(!h.captures.some(e=>e[1]==='funnel_step_failed'),'Next redirect is control flow, not a failure');
});
test('purchase hook is absent from return-page services, Gate D and generic checkout',()=>{
 for(const file of ['services/stripe/server.ts','app/api/create-checkout-session/route.ts','app/api/gate-d/checkout/route.ts'])assert.doesNotMatch(source(file),/\brecordVerifiedPurchase\b/);
 assert.ok(source('services/analytics/purchase.ts').includes('import "server-only"'));
 assert.ok(!source('package.json').includes('posthog-js'));assert.ok(!source('package.json').includes('posthog-node'));
});

function authActionsHarness({role='buyer',profileFailure=false,identities=[{id}],session=true,loggedIn=true}={}) {
 const events=[];let row=null;const user={id,role,email:'private@example.com',fullName:'Private name',identities};
 const db={auth:{signUp:async()=>({data:{user,session:session?{user}:null}}),signInWithPassword:async()=>({data:{user:null}})},
  from(){return {insert:async value=>{events.push('persist');if(profileFailure)return {error:Error('private db failure')};row=value;return {error:null};}};}};
 const captureForUser=async(...args)=>events.push(['capture',...args]);
 const deps={reconcileAppUserProfile,captureForUser,capturePersistedSignup:async(...args)=>events.push(['signup',...args]),
  getMutationClient:async()=>db,getUserProfileMutationClient:async()=>db,
  selectUserProfileCompat:async()=>({data:row}),upsertUserProfileCompat:async(_db,value)=>{events.push('persist');if(profileFailure)return {error:Error('private db failure')};row={...row,...value};return {error:null};},
  normalizeAuthEmail:x=>x,parseSignupRole:x=>x,resolveSignupReturnPath:()=>'/signup',resolveAuthMode:()=> 'supabase',hasSupabaseEnv:true,env:{demoMode:false},createAdminSupabaseClient:()=>db,createServerSupabaseClient:async()=>db,
  buildConfirmationRedirectUrl:()=> 'https://app.invalid/auth/confirm',buildRelativePath:(path)=>path,TRUSTED_PROFILE_ROLE_ASSIGNMENT_ERROR:'fixed',
  requireAuthenticatedUser:async()=>{if(!loggedIn)throw Error('no session');return user;},getStoredAvatarFields:()=>({}),resolveOnboardingPath:()=> '/onboarding',
  redirect:url=>{const e=Error('redirect');e.digest='NEXT_REDIRECT';e.url=url;throw e;}};
 const src=source('services/auth/actions.ts');const between=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b));
 const code=[between('export async function signupAction','export async function selectOnboardingRoleAction'),
  between('export async function finishArtistOnboardingAction','export async function saveBuyerOnboardingStepAction'),
  between('export async function finishBuyerOnboardingAction','async function ensureAppUser'),
  between('async function ensureAppUser','async function hasCompletedOnboarding'),
  between('async function finalizeOnboarding','async function uploadArtistAvatarIfPresent')].join('\n');
 const actionModule={exports:{}};runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{...deps,exports:actionModule.exports,module:actionModule,FormData,URLSearchParams});
 const form=new FormData();for(const [k,v] of Object.entries({email:user.email,password:'private password',fullName:user.fullName,role}))form.set(k,v);
 return {actions:actionModule.exports,events,form};
}
test('current signup and onboarding actions emit only after their actual profile/finalization writes succeed',async()=>{
 for(const role of ['artist','buyer'])for(const profileFailure of [false,true]) {
  const h=authActionsHarness({role,profileFailure});await assert.rejects(()=>h.actions.signupAction(h.form));
  assert.equal(h.events.filter(Array.isArray).length,profileFailure?0:1);
  if(!profileFailure)assert.deepEqual(h.events,['persist',['signup',id,false]]);
  h.events.length=0;const finish=role==='artist'?h.actions.finishArtistOnboardingAction:h.actions.finishBuyerOnboardingAction;
  await assert.rejects(()=>finish(new FormData()));assert.equal(h.events.filter(Array.isArray).length,profileFailure?0:1);
  if(!profileFailure) {assert.equal(h.events[0],'persist');assert.equal(h.events[1][2],'onboarding_completed');assert.ok(!JSON.stringify(h.events).includes('private'));}
 }
 const duplicate=authActionsHarness({identities:[]});await assert.rejects(()=>duplicate.actions.signupAction(duplicate.form));assert.equal(duplicate.events.filter(Array.isArray).length,0);
 const confirmation=authActionsHarness({session:false});await assert.rejects(()=>confirmation.actions.signupAction(confirmation.form));assert.deepEqual(confirmation.events,['persist',['signup',id,true]]);
 const unauth=authActionsHarness({loggedIn:false});await assert.rejects(()=>unauth.actions.finishBuyerOnboardingAction(new FormData()));assert.equal(unauth.events.length,0);
});

test('TEST payments remain marked is_test even in a production deployment target',async()=>{
 const h=outboxHarness();const server=h.restart('production');
 await server.enqueueEvent({id,role:'buyer'},'purchase_verified',{order_id:orderId,track_id:other,license_type:'broadcast',payment_mode:'test'},'purchase');
 assert.equal(h.rows[0].environment,'production');assert.equal(h.rows[0].is_test,true);
 await server.enqueueEvent({id,role:'admin'},'onboarding_started',{},'admin');assert.equal(h.rows[1].is_internal,true);
});
