import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import ts from 'typescript';import {readFileSync} from 'node:fs';
import {authorizeFinancialWorker} from '../lib/finance/worker-auth.mjs';
import {notificationTick} from '../scripts/notifications/worker.mjs';
const key='SYNTHETIC-Notification-worker-key-'.repeat(2);
function harness(env={},worker=async()=>({attempted:2,accepted:1,collectionFailed:false})){
 let calls=0,limit;const m={exports:{}};
 const deps={'next/server':{NextResponse:{json:Response.json}},'@/lib/finance/worker-auth.mjs':{authorizeFinancialWorker},'@/services/notifications/worker':{runNotificationBatch:async n=>{calls++;limit=n;return worker();}}};
 const compiled=ts.transpileModule(readFileSync(new URL('../app/api/internal/notifications/worker/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(compiled,{module:m,exports:m.exports,process:{env:{TSE_NOTIFICATION_WORKER_SECRET:key,TSE_EMAIL_DELIVERY_ENABLED:'true',...env}},require:n=>{assert.ok(Object.hasOwn(deps,n));return deps[n];}});
 return {post:(headers={},body)=>m.exports.POST(new Request('https://alpha.fixture.invalid/api/internal/notifications/worker',{method:'POST',headers,body})),get calls(){return calls;},get limit(){return limit;}};
}
test('notification adapter rejects missing/forged/cookie-only authority and missing/reused dedicated keys before processing',async()=>{
 for(const [env,header]of [[{},{}],[{},{authorization:'Bearer forged'}],[{},{cookie:'role=admin'}],[{TSE_NOTIFICATION_WORKER_SECRET:''},{authorization:'Bearer '+key}],[{TSE_FINANCE_WORKER_SECRET:key},{authorization:'Bearer '+key}]]){const h=harness(env);const r=await h.post(header);assert.equal(r.status,401);assert.equal(h.calls,0);assert.match(r.headers.get('cache-control'),/no-store/);}
});
test('notification adapter stays disabled and rejects caller payload before any worker/provider effect',async()=>{
 const disabled=harness({TSE_EMAIL_DELIVERY_ENABLED:'false'});assert.equal((await disabled.post({authorization:'Bearer '+key})).status,503);assert.equal(disabled.calls,0);
 const h=harness();assert.equal((await h.post({authorization:'Bearer '+key},'recipient=forged')).status,400);assert.equal(h.calls,0);
});
test('notification adapter invokes one bounded batch and projects only safe counters',async()=>{
 const h=harness({},async()=>({attempted:2,accepted:1,collectionFailed:true,recipient:'PRIVATE',token:'PRIVATE'}));const r=await h.post({authorization:'Bearer '+key});assert.equal(r.status,200);assert.deepEqual(await r.json(),{attempted:2,accepted:1,collectionFailed:true});assert.equal(h.calls,1);assert.equal(h.limit,10);
});
test('notification adapter sanitizes provider and database failures without claiming delivery',async()=>{
 const h=harness({},async()=>{throw Error('PRIVATE credential or provider failure');});const r=await h.post({authorization:'Bearer '+key});assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/PRIVATE/);
});
test('one-shot notification runner requires explicit enablement, dedicated key and HTTPS/loopback exact endpoint before fetch',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('Unexpected');};
 const env={TSE_EMAIL_DELIVERY_ENABLED:'true',TSE_NOTIFICATION_WORKER_SECRET:key};
 for(const extra of [{TSE_EMAIL_DELIVERY_ENABLED:'false'},{TSE_NOTIFICATION_WORKER_SECRET:''},{TSE_FINANCE_WORKER_SECRET:key},...['http://untrusted.invalid/api/internal/notifications/worker','https://user:pass@alpha.fixture.invalid/api/internal/notifications/worker','https://alpha.fixture.invalid/api/internal/notifications/worker?secret=PRIVATE','https://alpha.fixture.invalid/wrong'].map(TSE_NOTIFICATION_WORKER_URL=>({TSE_NOTIFICATION_WORKER_URL}))])await assert.rejects(notificationTick({...env,...extra},fetcher));assert.equal(calls,0);
});
test('one-shot notification runner does not follow redirects, leak response fields or accept invalid counters',async()=>{
 const env={TSE_EMAIL_DELIVERY_ENABLED:'true',TSE_NOTIFICATION_WORKER_SECRET:key,TSE_NOTIFICATION_WORKER_URL:'https://alpha.fixture.invalid/api/internal/notifications/worker'};
 const value=await notificationTick(env,async(url,init)=>{assert.equal(url.origin,'https://alpha.fixture.invalid');assert.equal(init.method,'POST');assert.equal(init.redirect,'error');assert.equal(init.body,undefined);return Response.json({attempted:3,accepted:1,collectionFailed:false,recipient:'PRIVATE'});});assert.deepEqual(value,{attempted:3,accepted:1,collectionFailed:false});
 await assert.rejects(notificationTick(env,async()=>new Response('PRIVATE',{status:503})),/Notification worker unavailable/);
 await assert.rejects(notificationTick(env,async()=>Response.json({attempted:999,accepted:1,collectionFailed:false})),/result unavailable/);
});
