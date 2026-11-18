import test from 'node:test';
import assert from 'node:assert/strict';
import * as zod from 'zod';
import {readFile} from 'node:fs/promises';
import {loadAuthModule,authHarness,userId} from './helpers/auth-system-harness.mjs';
import {uploadsFixture,create,reserve,observed,completeNext,artist,asActor,ids,invoke} from './helpers/music-uploads-fixture.mjs';
const submission='22222222-2222-4222-8222-222222222222',asset='33333333-3333-4333-8333-333333333333';
class UploadError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
function fixture(options={}){
 const h=authHarness({role:'artist',...options});if(options.stall)h.client.auth.getUser=async()=>new Promise(()=>{});let guards=0,privileges=0,signs=0,rate=0;const scoped={};
 const locator={asset_id:asset,bucket:'submission-source',path:`${userId}/${submission}/${asset}/original`,sha256:'a'.repeat(64),bytes:150000000,version:'v1',format:'wav',duration_us:180000000,...options.locator};
 const url=`https://example.supabase.co/storage/v1/object/sign/${locator.bucket}/${locator.path}?token=SYNTHETIC`;
 const admin={storage:{from:bucket=>({createSignedUrl:async(path,ttl)=>{signs++;assert.equal(bucket,'submission-source');assert.equal(path,locator.path);assert.equal(ttl,60);return options.signError?{error:{},data:null}:{data:{signedUrl:options.url||url},error:null};}})}};
 const modules={...h.modules,zod,'@/lib/env':{env:{appUrl:'http://127.0.0.1:3333',supabaseUrl:'https://example.supabase.co'}},'@/services/security/rate-limit':{consumeRateLimit:async()=>{rate++;return {status:options.rateDenied?'unavailable':'allowed'};}},'./uploads':{UploadError,mediaActor:async isAdmin=>{if(options.role==='buyer'||options.role==='admin'&&options.aal!=='aal2')throw new UploadError(403,'ACCESS_DENIED');assert.equal(isAdmin,options.role==='admin');return {client:scoped,user:{id:options.actorMismatch?'different':userId}};},mediaRpc:async(client,name)=>{if(name==='media_master_can_play'){guards++;if(options.deny||options.revoke&&guards>1)throw new UploadError(403,'ACCESS_DENIED');return true;}return {...locator,...options.changed&&guards>1?{version:'v2'}:{}};}},'@/services/supabase/admin':{createAdminSupabaseClient:()=>{privileges++;return admin;}}};
 const service=loadAuthModule('services/media/master-playback.ts',modules);const route=loadAuthModule('app/api/media/[submission]/[asset]/original/route.ts',{...modules,'@/services/media/master-playback':service,'@/services/media/uploads':{UploadError}});
 return {run:(signal=new AbortController().signal)=>service.authorizeMasterPlayback(submission,asset,signal),route,counts:()=>({guards,privileges,signs,rate})};
}
test('only authorized, unchanged, validated private masters receive sixty-second playback access',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.assetId,asset);assert.ok(r.expiresAt>Date.now()+50000&&r.expiresAt<=Date.now()+55000);assert.match(r.url,/object\/sign\/submission-source\//);assert.deepEqual(f.counts(),{guards:2,privileges:1,signs:1,rate:1});
 await fixture({role:'admin',aal:'aal2'}).run();
});
test('denied identities never reach signing; revoked, drifted and invalid locators never release URLs',async()=>{
 for(const options of [{deny:true},{user:null},{role:'buyer'},{role:'admin',aal:'aal1'},{actorMismatch:true}]){const f=fixture(options);await assert.rejects(f.run());assert.equal(f.counts().signs,0);assert.equal(f.counts().privileges,0);}
 for(const options of [{rateDenied:true},{revoke:true},{changed:true},{signError:true},{locator:{bucket:'public'}},{locator:{bytes:150000001}},{locator:{sha256:'bad'}},{locator:{path:`${userId}/${submission}/../original`}},{url:'https://evil.invalid/token'},{url:'http://example.supabase.co/token'}])await assert.rejects(fixture(options).run());
});
test('playback route rejects foreign origins and bodies, returns private no-store and redacted errors',async()=>{
 for(const request of [new Request('http://127.0.0.1:3333/api/test',{method:'POST',headers:{origin:'https://foreign.invalid'}}),new Request('http://127.0.0.1:3333/api/test',{method:'POST',headers:{origin:'http://127.0.0.1:3333'},body:'unauthorized'})]){
  const f=fixture();const r=await f.route.POST(request,{params:Promise.resolve({submission,asset})});assert.ok(r.status>=400);assert.equal(f.counts().signs,0);assert.match(r.headers.get('cache-control'),/no-store/);
 }
 const f=fixture({deny:true}),r=await f.route.POST(new Request('http://127.0.0.1:3333/api/test',{method:'POST',headers:{origin:'http://127.0.0.1:3333'}}),{params:Promise.resolve({submission,asset})});assert.equal(r.status,403);assert.doesNotMatch(await r.text(),/token|bucket|path|SYNTHETIC/);
 const empty=fixture(),response=await empty.route.POST(new Request('http://127.0.0.1:3333/api/test',{method:'POST',headers:{origin:'http://127.0.0.1:3333'},body:new ReadableStream({start(controller){controller.close();}}),duplex:'half'}),{params:Promise.resolve({submission,asset})});assert.equal(response.status,200);assert.equal(empty.counts().signs,1);
});
test('aborted and stalled authorization fails boundedly without signing or releasing credentials',async()=>{
 const aborted=new AbortController();aborted.abort();const f=fixture();await assert.rejects(f.run(aborted.signal),e=>e.status===408);assert.equal(f.counts().signs,0);
 const hung=fixture({stall:true}),controller=new AbortController();const pending=hung.run(controller.signal);setTimeout(()=>controller.abort(),10);await assert.rejects(pending,e=>e.status===408);assert.equal(hung.counts().signs,0);
});
test('SQL ownership, live session, MFA, retirement, Storage drift and grants are enforced; rollback preserves all records',async()=>{
 const db=await uploadsFixture();try{
  const s=await create(db),m=await reserve(db,s);await observed(db,s,m.asset_id);await assert.rejects(artist(db,'media_master_can_play',[s,m.asset_id]));await completeNext(db);
  assert.equal(await artist(db,'media_master_can_play',[s,m.asset_id]),true);
  assert.equal(await asActor(db,ids.admin,()=>invoke(db,'media_master_can_play',[s,m.asset_id])),true);
  for(const actor of [ids.b,ids.buyer,null])await assert.rejects(asActor(db,actor,()=>invoke(db,'media_master_can_play',[s,m.asset_id])));
  await assert.rejects(asActor(db,ids.admin,()=>invoke(db,'media_master_can_play',[s,m.asset_id]),'authenticated',undefined,'aal1'));
  const loc=await asActor(db,null,()=>invoke(db,'media_master_playback_authorized',[ids.a,s,m.asset_id]),'service_role');assert.equal(loc.asset_id,m.asset_id);assert.equal(loc.bucket,'submission-source');
  await assert.rejects(asActor(db,null,()=>invoke(db,'media_master_playback_authorized',[ids.buyer,s,m.asset_id]),'service_role'));
  await assert.rejects(asActor(db,ids.a,async()=>{await db.query('delete from auth.sessions where user_id=$1',[ids.a]);return invoke(db,'media_master_can_play',[s,m.asset_id]);}));
  await db.exec('alter table auth.sessions add column if not exists not_after timestamptz');
  await assert.rejects(asActor(db,ids.a,async()=>{await db.exec('reset role');await db.query("update auth.sessions set not_after=now()-interval '1 minute' where user_id=$1",[ids.a]);await db.exec('set role authenticated');return invoke(db,'media_master_can_play',[s,m.asset_id]);}));
  await assert.rejects(asActor(db,ids.a,async()=>{await db.exec('reset role');await db.query("insert into sec_private.revoked_sessions(session_id,user_id,reason) values((auth.jwt()->>'session_id')::uuid,$1,'local-fixture')",[ids.a]);await db.exec('set role authenticated');return invoke(db,'media_master_can_play',[s,m.asset_id]);}));
  await db.exec("update storage.buckets set public=true where id='submission-source'");await assert.rejects(artist(db,'media_master_can_play',[s,m.asset_id]));await db.exec("update storage.buckets set public=false where id='submission-source'");
  const object=(await db.query('select storage_object_id,storage_version from submission_media.assets where id=$1',[m.asset_id])).rows[0];
  await db.exec('alter table storage.objects disable trigger user');await db.query("update storage.objects set version='drift' where id=$1",[object.storage_object_id]);await db.exec('alter table storage.objects enable trigger user');await assert.rejects(artist(db,'media_master_can_play',[s,m.asset_id]));
  await db.exec('alter table storage.objects disable trigger user');await db.query('update storage.objects set version=$2 where id=$1',[object.storage_object_id,object.storage_version]);await db.exec('alter table storage.objects enable trigger user');assert.equal(await artist(db,'media_master_can_play',[s,m.asset_id]),true);
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.media_master_playback_authorized(uuid,uuid,uuid)','execute') ok",[role])).rows[0].ok,false);
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'submission_media.master_playback_locator(uuid,uuid,uuid)','execute') ok",[role])).rows[0].ok,false);
  await reserve(db,s);await assert.rejects(artist(db,'media_master_can_play',[s,m.asset_id]));
  const before=(await db.query('select id,technical_state from submission_media.assets order by id')).rows;
  await db.exec(await readFile(new URL('../docs/audio-reconstruction/unified-player-rollback.sql',import.meta.url),'utf8'));
  assert.deepEqual((await db.query('select id,technical_state from submission_media.assets order by id')).rows,before);
 }finally{await db.close();}
});
