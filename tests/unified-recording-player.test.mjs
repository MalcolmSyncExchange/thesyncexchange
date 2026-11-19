import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewSelection,recordingSelection,selectionFromDrag,matchesSelection,playbackBounds} from '../lib/media/preview-selection.mjs';

test('long recordings retain exactly thirty seconds with precise worker-compatible boundaries',()=>{
 for(const duration of [30_000_000,30_000_001,172_137_937,900_000_000])for(const start of [-1000,0,1234,60_999,Infinity,1e9]){
  const r=previewSelection(duration,start);assert.equal(r.endMs-r.startMs,30000);assert.ok(r.startMs>=0);assert.ok(r.endMs<=duration/1000);assert.equal(r.startMs%100,0);
 }
 assert.equal(previewSelection(172_137_937,1234).startMs,1200);
});
test('short recordings select the full measured recording and clamp both ends',()=>{
 for(const duration of [1_000_000,2_000_063,15_123_456,29_999_999]){
  const r=previewSelection(duration,100000);assert.equal(r.startMs,0);assert.equal(r.endMs,Math.floor(duration/1000));assert.equal(r.maxStartMs,0);
  assert.equal(playbackBounds('selection',duration,r).end,duration/1e6);
 }
 for(const value of [NaN,0,999999,900000001,Infinity])assert.throws(()=>previewSelection(value));
});
test('pointer and touch movement preserves region duration, clamps, and rejects invalid geometry',()=>{
 const r=selectionFromDrag(180_000_000,30000,100,600);assert.equal(r.startMs,60000);assert.equal(r.endMs,90000);
 assert.equal(selectionFromDrag(180_000_000,30000,-1000,600).startMs,0);
 assert.equal(selectionFromDrag(180_000_000,30000,1000,600).endMs,180000);
 for(const width of [0,-1,Infinity,NaN])assert.throws(()=>selectionFromDrag(180e6,0,10,width));
});
test('generated AAC acceptance is bound to the exact master and selected interval',()=>{
 const r=previewSelection(180e6,30000),asset={source_id:'master',start_ms:30000,end_ms:60000};
 assert.equal(matchesSelection(asset,'master',r),true);
 for(const a of [null,{...asset,source_id:'old'},{...asset,start_ms:0},{...asset,end_ms:59900}])assert.equal(matchesSelection(a,'master',r),false);
 const b=playbackBounds('generated',180e6,r,{duration_us:30000000,start_ms:30000});assert.deepEqual(b,{start:0,end:30,offset:30});
 assert.deepEqual(playbackBounds('selection',180e6,r),{start:30,end:60,offset:0});
 assert.deepEqual(playbackBounds('full',180e6,r),{start:0,end:180,offset:0});
});
test('existing accepted regions survive load/reset; a deliberate edit switches to thirty seconds',()=>{
 const saved={start_ms:45000,end_ms:90000};
 assert.equal(recordingSelection(180e6,50000,saved).endMs,90000);
 assert.equal(recordingSelection(180e6,50000,saved).startMs,45000);
 const changed=recordingSelection(180e6,50000,saved,false);assert.equal(changed.endMs-changed.startMs,30000);
 assert.deepEqual(recordingSelection(180e6,changed.startMs,saved,true),{startMs:45000,endMs:90000,maxStartMs:135000});
 const short={start_ms:0,end_ms:19900};assert.equal(playbackBounds('selection',20_003_451,recordingSelection(20_003_451,0,short)).end,19.9);
 const full=recordingSelection(20_003_451,0,short,false);assert.equal(playbackBounds('selection',20_003_451,full).end,20.003451);
 for(const saved of [{start_ms:-1,end_ms:50000},{start_ms:0,end_ms:999999},{start_ms:0,end_ms:1}])assert.equal(recordingSelection(180e6,0,saved).endMs,30000);
});
test('one full waveform and native audio engine preserve security, cancellation and keyboard controls',()=>{
 const ui=readFileSync(new URL('../components/audio/recording-player.tsx',import.meta.url),'utf8');
 assert.equal((ui.match(/<ValidatedWaveform /g)||[]).length,1);assert.equal((ui.match(/<audio /g)||[]).length,1);
 for(const text of ['Play Full Track','Play Preview','Play Generated AAC','Accept Generated Preview','Preview region start','Waveform timeline','onKeyDown={timelineKey}','onKeyDown={regionKey}','Recording playback position','onPointerCancel','onLostPointerCapture','setPointerCapture','clearTimeout(endTimer.current)','prefers-reduced-motion','heard!==currentPreview.id','!dirty','onSelectionDirty','Reset selection'])assert.ok(ui.includes(text),text);
 assert.match(ui,/onPointerEnter=\{session.warm\}/);assert.match(ui,/url=await session.get\(\)/);
 // Signed Storage ranges may use application/octet-stream; CORS media loading
 // avoids opaque-response blocking without sending cross-origin cookies.
 assert.match(ui,/<audio[^>]*crossOrigin="anonymous"/);
 assert.doesNotMatch(ui,/crossOrigin="use-credentials"/);
 assert.doesNotMatch(ui,/scrubLabel|Move preview region|Preview start seconds|type="number"/);
 assert.equal((ui.match(/type="range"/g)||[]).length,1,'volume is the only native range input');
 assert.match(ui,/styles.recordingPlayhead/);
 assert.match(ui,/showPlayhead=\{false\}/);
 assert.doesNotMatch(ui,/decodeAudioData|createObjectURL|Math.random|service_role/);
 const bars=readFileSync(new URL('../components/audio/validated-waveform.tsx',import.meta.url),'utf8');assert.doesNotMatch(bars,/styles.peakCaps|styles.centerline/);assert.match(bars,/useMemo/);
});
