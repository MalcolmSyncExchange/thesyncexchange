import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {deliverAsset,fetchPrivateArtifact,verifyArtifact} from '../services/delivery/transfer.mjs';
const order=randomUUID(),entitlement=randomUUID(),body=new TextEncoder().encode('SYNTHETIC licensed bytes');
const asset={allowed:true,authorizationId:randomUUID(),expiresAt:'2099-01-01',bucket:'purchase-assets',path:`${randomUUID()}/master`,sha256:createHash('sha256').update(body).digest('hex'),byteSize:body.byteLength,mimeType:'audio/wav',kind:'master',assetVersionId:randomUUID()};
function harness(overrides={}) {
 const calls=[];
 const wrap=(name,fn)=>async(...args)=>{calls.push(name);return fn(...args);};
 const d={appOrigin:'https://app.example',randomUUID,authenticate:wrap('auth',()=>({id:'buyer',role:'buyer'})),ownsOrder:wrap('scope',()=>true),deny:wrap('denial',()=>{}),
  begin:wrap('authorize',()=>asset),read:wrap('storage',()=>body),finish:wrap('audit',()=>true),...overrides};
 const request=(method='POST',headers={},signal)=>deliverAsset(new Request(`https://app.example/api/orders/${order}/assets/${entitlement}/download`,{method,headers:{origin:'https://app.example','sec-fetch-site':'same-origin',...headers},signal}),order,entitlement,d);
 return {calls,request,d};
}
test('only explicit same-origin POST starts authorization; probes and forged origins perform zero I/O',async()=>{
 const h=harness();
 for(const method of ['GET','HEAD','OPTIONS'])assert.equal((await h.request(method)).status,405);
 for(const headers of [{origin:'https://evil.example'},{origin:''},{'sec-fetch-site':'cross-site'}])assert.equal((await h.request('POST',headers)).status,403);
 assert.deepEqual(h.calls,[]);
 assert.equal((await harness({appOrigin:undefined}).request()).status,403);
 assert.equal((await h.request('POST',{range:'bytes=0-2'})).status,416);assert.deepEqual(h.calls,[]);
});
test('identity and RLS scope precede privileged authorization and Storage; failed scope uses only authenticated denial audit',async()=>{
 for(const [actor,scope,status] of [[null,true,401],[{id:'artist',role:'artist'},true,403],[{id:'buyer',role:'buyer'},false,404]]) {
  let begins=0,reads=0,denials=0;
  const h=harness({authenticate:async()=>actor,ownsOrder:async()=>scope,deny:async()=>{denials++;},begin:async()=>{begins++;return asset;},read:async()=>{reads++;return body;}});
  assert.equal((await h.request()).status,status);assert.equal(begins,0);assert.equal(reads,0);assert.equal(denials,actor?1:0);
 }
});
test('successful response contains exact verified bytes with private attachment headers and no provider URL',async()=>{
 const h=harness(),r=await h.request();assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),body);
 assert.deepEqual(h.calls,['auth','scope','authorize','storage','audit']);
 assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('content-disposition'),/^attachment/);
 assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('location'),null);
});
test('missing/revoked/refunded/disputed/expired entitlement decisions return no bytes and never touch Storage',async()=>{
 for(const reason of ['unavailable','duplicate_request','rate_limited']) {
  const h=harness({begin:async()=>({allowed:false,reason})});const r=await h.request();assert.equal(r.status,reason==='rate_limited'?429:409);assert.ok(!h.calls.includes('storage'));
 }
});
test('refunded or revoked access during I/O, expiry and duplicate finalization release no bytes',async()=>{
 const h=harness({finish:async()=>false});const r=await h.request();assert.equal(r.status,409);assert.doesNotMatch(await r.text(),/SYNTHETIC licensed bytes/);
});
test('large assets use a broker ticket without proxying bytes through Netlify; missing transport fails closed',async()=>{
 let reads=0;
 const large={...asset,byteSize:5_000_000};
 const h=harness({begin:async()=>large,read:async()=>{reads++;return body;},ticket:async()=>({brokerUrl:'https://broker.example/download',ticket:'a'.repeat(64)})});
 const r=await h.request();assert.equal(r.status,200);assert.equal((await r.json()).brokerUrl,'https://broker.example/download');assert.equal(reads,0);assert.ok(!h.calls.includes('audit'));
 assert.equal((await harness({begin:async()=>large}).request()).status,503);
});
test('Storage failures, interrupted requests, byte substitution and audit outages fail closed with sanitized responses',async()=>{
 for(const overrides of [{read:async()=>{throw Error('secret service key');}},{read:async()=>new Uint8Array(body.length).fill(1)},{finish:async()=>{throw Error('secret audit diagnostic');}}]) {
  const h=harness(overrides),r=await h.request();assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret|SYNTHETIC licensed bytes/);
 }
 const controller=new AbortController();controller.abort();assert.equal((await harness().request('POST',{},controller.signal)).status,503);
});
test('integrity verification rejects wrong size, SHA and over-limit evidence',()=>{
 for(const expected of [{...asset,byteSize:1},{...asset,sha256:'b'.repeat(64)},{...asset,byteSize:250_000_001}])assert.throws(()=>verifyArtifact(body,expected),/prepared/);
});
test('bounded private fetch uses only configured project/authenticated path and rejects redirects',async()=>{
 let called;
 const bytes=await fetchPrivateArtifact({projectUrl:'https://project.supabase.co',serviceKey:'synthetic-not-secret',bucket:asset.bucket,path:asset.path,byteSize:body.length,fetcher:async(url,options)=>{called={url,options};return new Response(body);}});
 assert.deepEqual(bytes,body);assert.equal(called.url.origin,'https://project.supabase.co');assert.equal(called.options.redirect,'error');assert.equal(called.options.cache,'no-store');
 assert.match(called.url.pathname,/^\/storage\/v1\/object\/authenticated\/purchase-assets\//);
});
test('encoded traversal, absolute paths and invalid buckets fail before fetch',async()=>{
 let called=0;
 for(const patch of [{path:'../x'},{path:'/x'},{path:'a/%2e%2e/x'},{path:'a\\x'},{path:'a//x'},{path:'a?x'},{bucket:'https://evil.example'}]) {
  await assert.rejects(fetchPrivateArtifact({projectUrl:'https://project.supabase.co',serviceKey:'fixture',bucket:asset.bucket,path:asset.path,byteSize:body.length,fetcher:async()=>{called++;return new Response(body);},...patch}));
 }assert.equal(called,0);
});
test('provider outage, oversized chunk, truncated body, wrong content length and read error are safely cancelled',async()=>{
 for(const fetcher of [async()=>new Response('private provider diagnostic',{status:500}),async()=>new Response(new Uint8Array(body.length+1)),async()=>new Response('short'),async()=>new Response(body,{headers:{'content-length':'999'}}),async()=>new Response(new ReadableStream({start(c){c.error(Error('private provider diagnostic'));}}))]) {
  await assert.rejects(fetchPrivateArtifact({projectUrl:'https://project.supabase.co',serviceKey:'fixture',bucket:asset.bucket,path:asset.path,byteSize:body.length,fetcher}),/prepared/);
 }
});
