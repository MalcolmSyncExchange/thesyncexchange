import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { agreementHarness } from './helpers/agreement-access-harness.mjs';

const origin = { origin: 'https://app.example', 'sec-fetch-site': 'same-origin' };
const prefetchHeaders = [ {}, {'next-router-prefetch':'1'}, {purpose:'prefetch'}, {'sec-purpose':'prefetch'}, {RSC:'1','next-url':'/buyer/orders'}, {'next-router-prefetch':'1',purpose:'prefetch',RSC:'1'} ];

test('GET/HEAD and repeated prefetch only inspect; no signing, audit or license mutation', async () => {
  const h = agreementHarness();
  for (const method of ['GET','HEAD']) for (const headers of prefetchHeaders) for(let i=0;i<3;i++) {
    const response = await h.request(method,headers);
    assert.equal(response.status,200);
    assert.match(response.headers.get('cache-control'),/no-store/);
    assert.equal((await response.json()).method,'POST');
  }
  assert.equal(h.state.audits.length,0);assert.equal(h.state.licenseWrites,0);assert.equal(h.state.signedUrls,0);assert.equal(h.state.storageReads,0);
});
for(const [label,options,status] of [
  ['anonymous',{user:null},401],['cross-Buyer',{user:{id:'other'}},403],['Artist',{role:'artist'},403],['invalid canonical role',{roleError:true},403],['unknown order',{missingOrder:true},403]
]) test(`${label} denied without privileged access or telemetry`,async()=>{
  const h=agreementHarness(options);
  for(const method of ['GET','POST']) assert.equal((await h.request(method,origin)).status,status);
  assert.equal(h.state.privilegedClients,0);assert.equal(h.state.audits.length,0);assert.equal(h.state.licenseWrites,0);
});
test('explicit owner POST issues a 303 with one authorization event and no license update',async()=>{
  const h=agreementHarness();
  for(let i=1;i<=2;i++) {
    const r=await h.request('POST',origin);assert.equal(r.status,303);assert.equal(r.headers.get('location'),'https://storage.example/fixture.pdf');assert.equal(h.state.audits.length,i);
  }
  for(const event of h.state.audits){assert.equal(event.actorId,'owner');assert.equal(event.eventType,'agreement_download_authorized');assert.equal(event.metadata.transferCompletionObserved,false);assert.equal(event.source,'buyer');}
  assert.equal(h.state.licenseWrites,0);
});
test('Admin retains explicit delivery authorization',async()=>{
  const h=agreementHarness({role:'admin',user:{id:'admin'}});assert.equal((await h.request('POST',origin)).status,303);assert.equal(h.state.audits[0].source,'admin');
});
test('missing, cross-site and forged origin rejected before auth/data operations',async()=>{
  const h=agreementHarness();
  for(const headers of [{},{origin:'https://evil.example'},{...origin,'sec-fetch-site':'cross-site'}]) assert.equal((await h.request('POST',headers)).status,403);
  assert.equal(h.state.privilegedClients,0);assert.equal(h.state.audits.length,0);
});
test('pending/missing/failed artifact cannot issue delivery or an authorization event',async()=>{
  for(const options of [{status:'pending'},{missingLicense:true},{license:{status:'failed'}},{license:{pdf_storage_path:null}}]) {
    const h=agreementHarness(options);for(const method of ['GET','POST'])assert.equal((await h.request(method,origin)).status,409);
    assert.equal(h.state.signedUrls,0);assert.equal(h.state.audits.length,0);assert.equal(h.state.licenseWrites,0);
  }
});
test('stream fallback is authorized, private, and never marks transfer completion',async()=>{
  const h=agreementHarness({signingFails:true});const r=await h.request('POST',origin);assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/^attachment/);assert.equal(h.state.audits.length,1);assert.equal(h.state.licenseWrites,0);
});
test('storage/audit failures fail closed without leaking diagnostics',async()=>{
  for(const options of [{signingFails:true,storageFails:true},{auditFails:true}]) {
    const h=agreementHarness(options);const r=await h.request('POST',origin);assert.equal(r.status,503);assert.equal(r.headers.get('location'),null);assert.doesNotMatch(await r.text(),/private diagnostic|audit unavailable/);assert.equal(h.state.licenseWrites,0);
  }
});
test('all agreement entry points use explicit forms, including settings and Admin',()=>{
  for(const path of ['app/(app)/buyer/orders/page.tsx','app/(app)/admin/orders/page.tsx','components/orders/license-confirmation-client.tsx','components/buyer/buyer-settings-form.tsx']) {
    const s=readFileSync(new URL('../'+path,import.meta.url),'utf8');assert.match(s,/AgreementDownloadForm/);assert.doesNotMatch(s,/<Link href=\{order\.agreement/);
  }
  const form=readFileSync(new URL('../components/orders/agreement-download-form.tsx',import.meta.url),'utf8');assert.match(form,/method="post"/);assert.match(form,/type="submit"/);
});
