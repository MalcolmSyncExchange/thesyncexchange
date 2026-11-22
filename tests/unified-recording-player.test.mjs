import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setImmediate as settlePlayback} from 'node:timers/promises';
import ts from 'typescript';
import {masterRequest,renderRecordingPlayer,signedMaster} from './helpers/recording-player-harness.mjs';
import {previewSelection,recordingSelection,selectionFromDrag,matchesSelection,playbackBounds,seekPlayback} from '../lib/media/preview-selection.mjs';

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
 for(const text of ['Play Full Track','Play Public Preview','Listen to Public Preview','Preview region start','Waveform timeline','onKeyDown={timelineKey}','onKeyDown={regionKey}','Recording playback position','onPointerCancel','onLostPointerCapture','setPointerCapture','clearTimeout(endTimer.current)','prefers-reduced-motion','!dirty','onSelectionDirty','onRegionChange'])assert.ok(ui.includes(text),text);
 assert.doesNotMatch(ui,/>Accept Public Preview</);assert.match(ui,/Your selection saves automatically/);
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

function recordingPlayerAttributes(path){
 const file=ts.createSourceFile(path,readFileSync(new URL(path,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const players=[];
 function visit(node){
  if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))&&ts.isIdentifier(node.tagName)&&node.tagName.text==='RecordingPlayer'){
   players.push(node.attributes.properties);
  }
  ts.forEachChild(node,visit);
 }
 visit(file);
 assert.equal(players.length,1,path);
 assert.ok(players[0].every(ts.isJsxAttribute),'Playback configuration must be verifiable on the whole JSX element');
 return players[0];
}

test('Admin Track Detail opts out while the shared workbench inherits the default',()=>{
 const detail=recordingPlayerAttributes('../app/(app)/admin/tracks/[id]/page.tsx');
 const optOut=detail.find(attribute=>attribute.name.getText()==='preauthorize')?.initializer;
 assert.ok(optOut&&ts.isJsxExpression(optOut)&&optOut.expression?.kind===ts.SyntaxKind.FalseKeyword);
 const workbench=recordingPlayerAttributes('../components/artist/uploads/upload-workbench.tsx');
 assert.ok(workbench.every(attribute=>attribute.name.getText()!=='preauthorize'));
});

const playbackLabels=['Play Full Track','Play Public Preview'];

test('Admin player signs only after explicit playback, including when already visible',async()=>{
 for(const label of playbackLabels){
  const player=renderRecordingPlayer({preauthorize:false,readOnly:true,presentation:'admin-review'});
  try{
   assert.deepEqual(player.requests,[],'render');
   player.mount();
   assert.deepEqual(player.requests,[],'activation before intersection or input');
   player.intersect(true);
   assert.deepEqual(player.requests,[],'viewport entry');
   for(const play of playbackLabels){
    const button=player.button(play);
    button.onPointerEnter?.();
    assert.deepEqual(player.requests,[],play+' hover');
    button.onFocus?.();
    assert.deepEqual(player.requests,[],play+' focus');
   }

   player.button(label).onClick();
   await settlePlayback();
   assert.deepEqual(player.requests,[masterRequest],label);
   assert.equal(player.audio.src,signedMaster);
   assert.equal(player.audio.paused,false);
  }finally{
   player.unmount();
  }
 }
});

test('default player preauthorizes on viewport entry, hover or focus and reuses it on play',async()=>{
 const intents=[
  ['viewport entry',player=>player.intersect(true),'Play Full Track'],
  ...playbackLabels.flatMap(label=>['onPointerEnter','onFocus'].map(event=>[
   label+' '+event,player=>player.button(label)[event]?.(),label
  ]))
 ];
 for(const [name,interact,label] of intents){
  const player=renderRecordingPlayer();
  try{
   player.mount();
   player.intersect(false);
   assert.deepEqual(player.requests,[],'before '+name);
   interact(player);
   assert.deepEqual(player.requests,[masterRequest],name);

   player.button(label).onClick();
   await settlePlayback();
   assert.deepEqual(player.requests,[masterRequest],name+' followed by playback');
   assert.equal(player.audio.paused,false);
  }finally{
   player.unmount();
  }
 }
});

test('full waveform seeks leave preview mode without changing selection',()=>{
 const region=previewSelection(180e6,30000),saved={...region};
 for(const time of [0,29.9,60,150,180])assert.deepEqual(seekPlayback('selection',180e6,region,time),{mode:'full',time});
 assert.deepEqual(seekPlayback('selection',180e6,region,45),{mode:'selection',time:45});
 assert.deepEqual(seekPlayback('generated',180e6,region,45,{start_ms:30000,duration_us:30e6}),{mode:'generated',time:15});
 for(const time of [0,60,150])assert.deepEqual(seekPlayback('generated',180e6,region,time,{start_ms:30000,duration_us:30e6}),{mode:'full',time});
 assert.deepEqual(region,saved);
 assert.deepEqual(seekPlayback('full',180e6,region,-10),{mode:'full',time:0});
 assert.deepEqual(seekPlayback('full',180e6,region,999),{mode:'full',time:180});
 assert.throws(()=>seekPlayback('selection',180e6,region,NaN));
});

test('normal preview workflow autosaves and hides manual save/generate controls',()=>{const ui=readFileSync(new URL('../components/audio/recording-player.tsx',import.meta.url),'utf8');assert.doesNotMatch(ui,/Save preview selection|Generate AAC preview|onSave|onGenerate/);assert.match(ui,/pendingLocal.current/);assert.match(ui,/onRegionChange\?\.\(source.id,nextRegion.startMs,nextRegion.endMs\)/);assert.match(ui,/onRegionChange\?\.\(source.id,region.startMs,region.endMs\)/);});

test('local and final waveforms separate region-body/handle gestures from the raised playhead',()=>{
 for(const file of ['recording-player.tsx','local-recording-audition.tsx']){
  const ui=readFileSync(new URL('../components/audio/'+file,import.meta.url),'utf8');
  assert.equal((ui.match(/data-preview-handle className/g)||[]).length,2);
  assert.match(ui,/closest\('\[data-preview-handle\]'\)/);
  assert.doesNotMatch(ui,/closest\('\[data-preview-region\]'\)/);
  for(const token of ['e.stopPropagation()','setPointerCapture','onLostPointerCapture','onPointerCancel','onKeyDown={regionKey}','onKeyDown={timelineKey}'])assert.ok(ui.includes(token),token);
 }
 const css=readFileSync(new URL('../components/audio/waveform-player.module.css',import.meta.url),'utf8');
 assert.ok(css.lastIndexOf('.selectionOverlay {pointer-events:auto;touch-action:none;cursor:grab;}')>css.lastIndexOf('.selectionOverlay {pointer-events:none'));
 assert.match(readFileSync(new URL('../components/audio/recording-player.tsx',import.meta.url),'utf8'),/Math.abs\(e.clientX-d.x\)<5/);
 assert.match(readFileSync(new URL('../components/audio/recording-player.tsx',import.meta.url),'utf8'),/e.type==='pointerup'&&!d.moved&&!d.handle/);
 assert.match(css,/\.selectionHandle \{[^}]*pointer-events:auto;touch-action:none/);
 assert.match(css,/\.recordingPlayhead \{[^}]*pointer-events:auto;touch-action:none/);
 assert.match(css,/\.recordingPlayhead \{z-index:4/);
});

test('mouse and touch seeking inside and outside a selection never changes its fixed duration',()=>{
 for(const width of [320,390,1024]){
  const region=selectionFromDrag(180e6,0,width/3,width),saved={...region};
  for(const x of [0,width*.4,width*.45,width*.9,width]){
   const plan=seekPlayback('selection',180e6,region,x/width*180);
   assert.equal(plan.time,x/width*180);assert.deepEqual(region,saved);assert.equal(region.endMs-region.startMs,30000);
  }
 }
});
