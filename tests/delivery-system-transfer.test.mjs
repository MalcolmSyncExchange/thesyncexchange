import test from 'node:test';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';import {readdir,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {guardedArtifactStream,spoolArtifact} from '../services/delivery/stream.mjs';import {deliverAsset,fetchPrivateArtifact} from '../services/delivery/transfer.mjs';import {readTicketRequest,prepareTicketDownload} from '../services/delivery/broker.mjs';
const expires=()=>new Date(Date.now()+60_000).toISOString();
const prepared=(size=150000)=>{let closed=0,reads=0;return{size,read:async(_offset,n)=>{reads++;return new Uint8Array(n).fill(65);},close:async()=>{closed++;},get closed(){return closed;},get reads(){return reads;}};};
test('configured public origin accepts an internal proxy URL and rejects forged request URL plus Origin before auth',async()=>{
 let auth=0;const d={appOrigin:'https://app.example',authenticate:async()=>{auth++;return null;},randomUUID};
 const go=(url,origin)=>deliverAsset(new Request(url,{method:'POST',headers:{origin}}),randomUUID(),randomUUID(),d);
 assert.equal((await go('https://evil.example/x','https://evil.example')).status,403);assert.equal(auth,0);
 assert.equal((await go('http://internal-proxy/x','https://app.example')).status,401);assert.equal(auth,1);
});
test('private credentials are never sent to a non-TLS remote project; loopback synthetic provider remains supported',async()=>{
 let calls=0;await assert.rejects(fetchPrivateArtifact({projectUrl:'http://remote.example',serviceKey:'SYNTHETIC',bucket:'purchase-assets',path:'fixture/master',byteSize:1,fetcher:async()=>{calls++;return new Response('A');}}));assert.equal(calls,0);
 assert.equal((await fetchPrivateArtifact({projectUrl:'http://127.0.0.1:1234',serviceKey:'SYNTHETIC',bucket:'purchase-assets',path:'fixture/master',byteSize:1,fetcher:async()=>new Response('A')})).length,1);
});
test('audited stream uses <=64KiB chunks, rechecks at bounded checkpoints after disk reads, and records exact terminal evidence without client receipt',async()=>{
 const p=prepared(),events=[];let checks=0;const stream=await guardedArtifactStream(p,{expiresAt:expires()},{check:async()=>{checks++;return true;},record:async(...e)=>{events.push(e);return true;}});
 const reader=stream.getReader();let n=0;for(;;){const r=await reader.read();if(r.done)break;assert.ok(r.value.length<=65536);n+=r.value.length;}
 assert.equal(n,p.size);assert.ok(checks>=4);assert.deepEqual(events,[['started',0],['stream_exhausted',150000]]);assert.equal(p.closed,1);
});
test('revocation between chunks stops further bytes and retains the already observed count',async()=>{
 const p=prepared(),events=[];let valid=true;const r=(await guardedArtifactStream(p,{expiresAt:expires()},{check:async()=>valid,record:async(...e)=>{events.push(e);return true;}})).getReader();
 assert.equal((await r.read()).value.length,65536);valid=false;assert.equal((await r.read()).value.length,65536);await assert.rejects(r.read());assert.equal(p.reads,2);assert.deepEqual(events,[['started',0],['revoked',131072]]);assert.equal(p.closed,1);
});
test('revocation during disk read and failure to persist start or final evidence releases no corresponding bytes',async()=>{
 let valid=true;const p=prepared();p.read=async(_o,n)=>{valid=false;return new Uint8Array(n);};const r=(await guardedArtifactStream(p,{expiresAt:expires()},{check:async()=>valid,record:async()=>true})).getReader();await assert.rejects(r.read());assert.equal(p.closed,1);
 const denied=prepared();await assert.rejects(guardedArtifactStream(denied,{expiresAt:expires()},{check:async()=>true,record:async()=>false}));assert.equal(denied.reads,0);assert.equal(denied.closed,1);
 const final=prepared(100),f=(await guardedArtifactStream(final,{expiresAt:expires()},{check:async()=>true,record:async outcome=>outcome==='started'})).getReader();await assert.rejects(f.read());assert.equal(final.closed,1);
});
test('client cancellation, abort and expiration clean private preparation and emit terminal evidence',async()=>{
 for(const action of ['cancel','abort','expire']){const p=prepared(),events=[],a=new AbortController();const stream=await guardedArtifactStream(p,{expiresAt:action==='expire'?new Date(Date.now()+40).toISOString():expires()},{signal:a.signal,check:async()=>true,record:async(...e)=>{events.push(e);return true;}});const reader=stream.getReader();await reader.read();
 if(action==='cancel')await reader.cancel();else if(action==='abort'){a.abort();await assert.rejects(reader.read());}else {await new Promise(r=>setTimeout(r,60));await assert.rejects(reader.read());}
 assert.equal(p.closed,1);assert.equal(events[1][0],action==='cancel'||action==='abort'?'interrupted':'expired');assert.equal(events[1][1],65536);}
});
test('full 250MB synthetic asset is incrementally hashed/spooled with restrictive permissions and removed after stream',async()=>{
 const before=new Set(await readdir(tmpdir())),size=250_000_000,chunk=new Uint8Array(262144).fill(67),h=createHash('sha256');for(let n=0;n<size;n+=chunk.length)h.update(chunk.subarray(0,Math.min(chunk.length,size-n)));
 const expectedHash=h.digest('hex');let offset=0;const response=new Response(new ReadableStream({pull(c){if(offset===size){c.close();return;}const b=chunk.subarray(0,Math.min(chunk.length,size-offset));offset+=b.length;c.enqueue(b);}}),{headers:{'content-length':String(size)}});
 const p=await spoolArtifact(response,{byteSize:size,sha256:expectedHash});const fresh=(await readdir(tmpdir())).filter(x=>x.startsWith('tse-delivery-')&&!before.has(x));assert.equal(fresh.length,1);assert.equal((await stat(join(tmpdir(),fresh[0]))).mode&0o777,0o700);assert.equal((await stat(join(tmpdir(),fresh[0],'asset'))).mode&0o777,0o600);
 const stream=await guardedArtifactStream(p,{expiresAt:expires()},{check:async()=>true,record:async()=>true}),reader=stream.getReader();let total=0;const actual=createHash('sha256');for(;;){const x=await reader.read();if(x.done)break;actual.update(x.value);total+=x.value.length;}assert.equal(total,size);assert.equal(actual.digest('hex'),expectedHash);assert.ok(!(await readdir(tmpdir())).includes(fresh[0]));
});
test('missing/truncated/corrupt/oversized Storage response and interrupted source never publish a prepared file',async()=>{
 const expected={byteSize:100,sha256:createHash('sha256').update(new Uint8Array(100).fill(65)).digest('hex')};
 for(const r of [new Response('missing',{status:404}),new Response('short'),new Response(new Uint8Array(100).fill(66)),new Response(new Uint8Array(101).fill(65)),new Response(new ReadableStream({start(c){c.error(Error('SYNTHETIC outage'));}}))])await assert.rejects(spoolArtifact(r,expected));
 const a=new AbortController();a.abort();await assert.rejects(spoolArtifact(new Response(new Uint8Array(100).fill(65)),expected,{signal:a.signal}));
});
test('broker accepts only one bounded exact ticket field and missing/invalid/fatal UTF8 cannot redeem',async()=>{
 for(const body of ['null','[]','{}',JSON.stringify({ticket:'a'.repeat(64),path:'x'}),JSON.stringify({ticket:3}),new Uint8Array([255])]){const req=new Request('https://broker.example/download',{method:'POST',headers:{origin:'https://app.example','content-type':'application/json'},body});await assert.rejects(readTicketRequest(req.clone()));let redeemed=0;const r=await prepareTicketDownload(req.clone(),{appOrigin:'https://app.example',redeem:async()=>{redeemed++;}});assert.ok(r.status>=400);assert.equal(redeemed,0);}
});
test('maximum-size stream survives representative 10ms authority latency within the unchanged 60s lifetime',async()=>{
 const original=Date.now,base=original();let elapsed=0,checks=0,total=0;Date.now=()=>base+elapsed;
 try{const p=prepared(250_000_000),r=(await guardedArtifactStream(p,{expiresAt:new Date(base+60_000).toISOString()},{check:async()=>{checks++;elapsed+=10;return true;},record:async()=>true})).getReader();for(;;){const x=await r.read();if(x.done)break;total+=x.value.length;}assert.equal(total,250_000_000);assert.ok(checks<600);assert.ok(elapsed<6000);assert.equal(p.closed,1);}finally{Date.now=original;}
});
