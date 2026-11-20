import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadDisplay,currentProcessing} from '../lib/media/upload-progress.mjs';
import {estimatePulse} from '../public/media/local-tempo.mjs';
import {uploadsFixture,artist,asActor,ids,invoke} from './helpers/music-uploads-fixture.mjs';
const source={id:'master',state:'ready'},wave={id:'wave',source_id:'master',kind:'waveform',state:'ready'},preview={id:'aac',source_id:'master',kind:'buyer_preview',state:'ready',start_ms:0,end_ms:30000};
const stored={files:[{role:'master',retired:false,asset:source}],source,waveform:wave,derivatives:[wave,preview],jobs:[],selection:{start_ms:0,end_ms:30000}};
test('stored state reconciles abandoned unbound local transfer presentation without authorizing a new upload',()=>{
 const d=uploadDisplay(stored,{hasLocal:true});assert.equal(d.stored,true);assert.equal(d.unboundLocal,true);assert.equal(d.preliminary,false);assert.equal(d.selectionOnly,false);assert.equal(currentProcessing(stored).stage,'Ready for review');
 const incomplete={...stored,derivatives:[wave]};assert.notEqual(currentProcessing(incomplete).stage,'Ready for review');
 assert.equal(uploadDisplay(stored,{hasLocal:true,busy:true}).localPending,true);
 assert.equal(uploadDisplay(stored,{hasLocal:true,selectedAsset:'replacement'}).localPending,true);
 assert.equal(uploadDisplay(stored,{hasLocal:true,selectedAsset:'master',paused:true,transferring:true}).transferVisible,false);
 assert.equal(uploadDisplay(null,{hasLocal:true}).localPending,true);
});
test('onset estimator rejects unstructured noise and sustained audio, retains compressed rhythmic evidence and half/double candidates',()=>{
 let seed=33;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 assert.equal(estimatePulse(Array.from({length:2000},()=>random())).bpm,undefined);
 assert.equal(estimatePulse(Array(2000).fill(.8)).bpm,undefined);
 const r=estimatePulse(Array.from({length:2000},(_,i)=>.65+(i%50<3?.06:0)));assert.ok(Math.abs(r.bpm-120)<=2,JSON.stringify(r));assert.ok(r.alternatives.includes(60));
});
test('personal library persists across submissions, deduplicates, stays private and rejects abuse/cross-role mutation',async()=>{
 const db=await uploadsFixture();try{
 assert.deepEqual(await artist(db,'media_personal_moods',['save','  starlit   glow  ']),['Starlit Glow']);
 assert.deepEqual(await artist(db,'media_personal_moods',['save','STARLIT GLOW']),['Starlit Glow']);
 assert.deepEqual(await artist(db,'media_personal_moods',['list']),['Starlit Glow']);
 assert.deepEqual(await asActor(db,ids.b,()=>invoke(db,'media_personal_moods',['list'])),[]);
 await assert.rejects(()=>asActor(db,ids.b,()=>db.query('select * from submission_media.personal_moods')));
 for(const label of ['','https://evil.invalid','<script>','Calm, Sad','Ｆｏｏ／Ｂａｒ','fuck'])await assert.rejects(()=>artist(db,'media_personal_moods',['save',label]));
 assert.deepEqual(await artist(db,'media_personal_moods',['remove','starlit glow']),[]);
 }finally{await db.close();}
});
test('personal mood count and mutation rate limits fail closed without affecting selected track metadata',async()=>{
 const db=await uploadsFixture();try{
 await db.exec(`insert into submission_media.personal_moods(owner_id,label,normalized) select '${ids.a}','Mood '||i,'mood '||i from generate_series(1,100) i`);
 await assert.rejects(()=>artist(db,'media_personal_moods',['save','Another Mood']),e=>e.code==='54000');
 assert.equal((await artist(db,'media_personal_moods',['save','Mood 1'])).length,100);
 await db.query('update submission_media.personal_mood_limits set operations=30 where owner_id=$1',[ids.a]);
 await assert.rejects(()=>artist(db,'media_personal_moods',['remove','Mood 1']),e=>e.code==='54000');
 assert.equal((await artist(db,'media_personal_moods',['list'])).length,100);
 await assert.rejects(()=>asActor(db,ids.buyer,()=>invoke(db,'media_personal_moods',['save','Nope'])));
 await assert.rejects(()=>asActor(db,null,()=>invoke(db,'media_personal_moods',['list']),'anon'));
 }finally{await db.close();}
});
