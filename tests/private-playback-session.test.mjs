import test from 'node:test';
import assert from 'node:assert/strict';
import {privatePlaybackSession} from '../lib/media/private-playback-session.mjs';
const good=(time=0,overrides={})=>({ok:true,json:async()=>({assetId:'asset',url:'https://example.com/private',expiresAt:time+55000,...overrides})});
test('warm authorization coalesces with playback and reuses only a fresh asset-bound capability',async()=>{
 let calls=0,time=0,release;const wait=new Promise(r=>release=r);
 const s=privatePlaybackSession('draft','asset',{now:()=>time,fetcher:async(path,options)=>{calls++;assert.equal(path,'/api/media/draft/asset/original');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');await wait;return good(time);}});
 s.warm();const play=s.get();release();assert.equal(await play,'https://example.com/private');assert.equal(calls,1);
 assert.equal(await s.get(),'https://example.com/private');assert.equal(calls,1);
 time=51000;await s.get();assert.equal(calls,2);s.dispose();await assert.rejects(s.get());
});
test('denial, wrong identity, stale or overlong expiry, and unsafe URLs never enter the cache',async()=>{
 for(const response of [{ok:false},good(0,{assetId:'other'}),good(0,{expiresAt:0}),good(0,{expiresAt:60001}),good(0,{url:'http://example.com'}),good(0,{url:'https://user:pass@example.com'})]){
  let calls=0;const s=privatePlaybackSession('draft','asset',{now:()=>0,fetcher:async()=>{calls++;return response;}});
  await assert.rejects(s.get());await assert.rejects(s.get());assert.equal(calls,2);s.dispose();
 }
});
test('unmount aborts in-flight authorization and a late response cannot restore the capability',async()=>{
 let release,signal;const wait=new Promise(r=>release=r);
 const s=privatePlaybackSession('draft','asset',{now:()=>0,fetcher:async(_,options)=>{signal=options.signal;await wait;return good();}});
 const pending=s.get();s.dispose();assert.equal(signal.aborted,true);release();await assert.rejects(pending);await assert.rejects(s.get());
});
test('media errors clear the capability and force fresh server authorization',async()=>{
 let calls=0;const s=privatePlaybackSession('draft','asset',{now:()=>0,fetcher:async()=>{calls++;return good();}});
 await s.get();s.clear();await s.get();assert.equal(calls,2);s.dispose();
});
