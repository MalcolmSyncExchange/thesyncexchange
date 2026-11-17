import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import * as waveform from '../lib/media/waveform.mjs';
import {loadAuthModule} from './helpers/auth-system-harness.mjs';
import {fixture,published,ids,service} from './helpers/catalog-management-fixture.mjs';
import {configureSyntheticPreview} from './helpers/immutable-source-fixture.mjs';
const track='66666666-6666-4666-8666-666666666666',asset='11111111-1111-4111-8111-111111111111';
function binary(){const b=Buffer.alloc(512+3000*4);const h=Buffer.from(JSON.stringify({encoding:'waveform_minmax_i16_v1',profile:'waveform-minmax-v1',points_per_second:100,duration_us:30000000,points:3000,source_sha256:'a'.repeat(64)}));b.writeUInt32LE(h.length);h.copy(b,4);return b;}
function httpFixture(options={}){
  const bytes=binary(),calls=[];
  const wave={asset_id:randomUUID(),bucket:'submission-derived',path:'private/waveform',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),version:'v1',source_sha256:'a'.repeat(64),start_sample:0,end_sample:480000,sample_rate:16000,duration_us:30000000,preview_asset_id:options.wrongAsset?randomUUID():asset};
  const preview={asset_id:asset,bucket:'submission-derived',path:'private/preview',bytes:100,sha256:'a'.repeat(64),version:'v1',mime:'audio/mp4'};
  let reads=0;
  const loaded=loadAuthModule('services/buyer/preview.ts',{'server-only':{},'node:crypto':{createHash},'@/lib/media/waveform.mjs':waveform,'@/services/auth/authorization':{requireAccountScope:async()=>{if(options.denied)throw Error();return {supabase:'scoped',user:{id:'buyer'}};}},'@/services/supabase/admin':{createAdminSupabaseClient:()=> 'admin'},'@/services/delivery/server':{readPrivateArtifact:async()=>{reads++;return options.corrupt?Buffer.from('bad'):bytes;}},'./marketplace':{marketplaceRpc:async(client,name)=>{
    calls.push(name);if(name==='marketplace_preview_check'){if(options.revoked&&calls.length>2)throw Error();return 'session';}
    const value=name==='marketplace_waveform_locator'?wave:preview;return options.replaced&&calls.length>3?{...value,version:'v2'}:value;
  }}});
  return {loaded,calls,get reads(){return reads;}};
}
test('descriptor binds both URLs to one preview asset and never reads private bytes',async()=>{
  const f=httpFixture(),r=await f.loaded.buyerPreview(new Request(`https://tse.invalid/api/buyer/preview/${track}?kind=descriptor`),track),d=await r.json();
  assert.equal(d.previewUrl,`/api/buyer/preview/${track}?asset=${asset}`);assert.equal(d.waveformUrl,`/api/buyer/preview/${track}?kind=waveform&asset=${asset}`);
  assert.equal(f.reads,0);assert.doesNotMatch(JSON.stringify(d),/private|bucket|sha256|version/);
});
test('waveform returns only bounded preview envelope after integrity and authorization postflight',async()=>{
  const f=httpFixture(),r=await f.loaded.buyerPreview(new Request(`https://tse.invalid/api/buyer/preview/${track}?kind=waveform&asset=${asset}`),track),body=await r.json();
  assert.equal(body.encoding,'tse-preview-envelope-v1');assert.equal(body.points.length,600);assert.equal(body.duration_us,30000000);assert.equal(f.reads,1);
  assert.doesNotMatch(JSON.stringify(body),/private|bucket|source|sha256|asset_id|version/);assert.match(r.headers.get('cache-control'),/no-store/);
});
test('unbound, stale, corrupt, revoked and replaced waveform requests fail closed',async()=>{
  const url=`https://tse.invalid/api/buyer/preview/${track}?kind=waveform&asset=${asset}`;
  for(const options of [{denied:true},{wrongAsset:true},{corrupt:true},{revoked:true},{replaced:true}])await assert.rejects(httpFixture(options).loaded.buyerPreview(new Request(url),track));
  const f=httpFixture();await assert.rejects(f.loaded.buyerPreview(new Request(url.replace('&asset='+asset,'')),track));assert.equal(f.reads,0);
});
test('database locator requires live Buyer session, approved current preview, private unchanged waveform object',async()=>{
  const db=await fixture();try{
    configureSyntheticPreview(db,{waveformBytes:48512});await published(db);
    const session=randomUUID();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,ids.buyer]);
    const args=[ids.buyer,session,ids.live],locator=await service(db,'marketplace_waveform_locator',args);
    assert.equal(locator.bucket,'submission-derived');assert.equal(locator.bytes,48512);assert.equal(Number(locator.end_sample)-Number(locator.start_sample),30*48000);
    assert.ok(locator.preview_asset_id);assert.notEqual(locator.asset_id,locator.preview_asset_id);
    await assert.rejects(service(db,'marketplace_waveform_locator',[ids.a,session,ids.live]),e=>e.code==='42501');
    // Simulate provider-side version drift, not an authorized application mutation.
    await db.exec("alter table storage.objects disable trigger user");
    await db.query("update storage.objects set version='provider-drift' where id=(select storage_object_id from submission_media.assets where id=$1)",[locator.preview_asset_id]);
    await db.exec("alter table storage.objects enable trigger user");
    await assert.rejects(service(db,'marketplace_waveform_locator',args),e=>e.code==='42501');
    await db.query('delete from auth.sessions where id=$1',[session]);await assert.rejects(service(db,'marketplace_waveform_locator',args),e=>e.code==='42501');
  }finally{await db.close();}
});
