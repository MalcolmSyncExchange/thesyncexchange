import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareTicketDownload,createDeliveryBroker} from '../services/delivery/broker.mjs';
const origin='https://app.example',ticket='a'.repeat(64),bytes=new TextEncoder().encode('SYNTHETIC broker bytes');
const asset={allowed:true,authorizationId:'fixture',buyerId:'buyer',sha256:createHash('sha256').update(bytes).digest('hex'),byteSize:bytes.length,mimeType:'audio/wav',kind:'master',assetVersionId:'synthetic'};
function fixture(overrides={}){const calls=[];return {calls,deps:{appOrigin:origin,redeem:async h=>{calls.push(h);return asset;},read:async()=>bytes,finish:async()=>true,...overrides}};}
const request=(method='POST',headers={},body=JSON.stringify({ticket}))=>new Request('https://broker.example/download',{method,headers:{origin,'content-type':'application/json',...headers},...(!['GET','HEAD'].includes(method)?{body}:{})});
test('large-file broker verifies ticket-derived identity, exact bytes and final revocation state before private response',async()=>{
 const h=fixture(),r=await prepareTicketDownload(request(),h.deps);assert.equal(r.status,200);assert.equal(await r.text(),'SYNTHETIC broker bytes');
 assert.equal(h.calls[0],createHash('sha256').update(ticket).digest('hex'));assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.equal(r.headers.get('access-control-allow-credentials'),null);assert.match(r.headers.get('cache-control'),/no-store/);
});
test('broker preflight is read-only; GET/HEAD, forged origins, malformed/oversized body and Range do not redeem',async()=>{
 const h=fixture();assert.equal((await prepareTicketDownload(request('OPTIONS'),h.deps)).status,204);
 for(const req of [request('GET'),request('HEAD'),request('POST',{origin:'https://evil.example'}),request('POST',{},'x'.repeat(129)),request('POST',{},'{}'),request('POST',{},'{invalid'),request('POST',{range:'bytes=0-1'})])assert.ok((await prepareTicketDownload(req,h.deps)).status>=400);
 assert.equal(h.calls.length,0);
});
test('redeemed/expired/revoked tickets, provider outage and integrity or audit failure release no bytes',async()=>{
 for(const overrides of [{redeem:async()=>({allowed:false})},{read:async()=>{throw Error('private diagnostic');}},{read:async()=>new Uint8Array(bytes.length).fill(1)},{finish:async()=>false},{finish:async()=>{throw Error('private diagnostic');}}]){
  const r=await prepareTicketDownload(request(),fixture(overrides).deps);assert.ok(r.status>=400);assert.doesNotMatch(await r.text(),/SYNTHETIC broker bytes|private diagnostic/);
 }
});
test('actual local HTTP broker delivers a file above the Netlify inline ceiling, without real provider or database calls',async()=>{
 const large=new Uint8Array(4_000_001).fill(67);let redeemed=false;let audit=0;
 const metadata={...asset,expiresAt:new Date(Date.now()+60000).toISOString(),byteSize:large.length,sha256:createHash('sha256').update(large).digest('hex'),bucket:'purchase-assets',path:'synthetic/master'};
 const server=createDeliveryBroker({appOrigin:origin,projectUrl:'https://synthetic.invalid',serviceKey:'synthetic-only',
  fetcher:async()=>new Response(large),rpcClient:{rpc:async(name)=>{
   if(name==='redeem_asset_delivery_ticket'){const value=redeemed?{allowed:false}:metadata;redeemed=true;return {data:value,error:null};}
   if(name==='finish_asset_download'){audit++;return {data:true,error:null};}if(['check_asset_transfer','record_asset_transfer'].includes(name))return {data:true,error:null};throw Error('Unexpected RPC');
  }}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url=`http://127.0.0.1:${server.address().port}/download`;
  const options={method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({ticket})};
  const response=await fetch(url,options);assert.equal(response.status,200);assert.equal(response.headers.get('content-length'),String(large.length));
  assert.equal(createHash('sha256').update(new Uint8Array(await response.arrayBuffer())).digest('hex'),metadata.sha256);assert.equal(audit,1);
  assert.equal((await fetch(url,options)).status,409);assert.equal(audit,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
