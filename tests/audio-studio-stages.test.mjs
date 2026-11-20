import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {studioStages,recordingProcessing} from '../lib/media/audio-workflow.mjs';
const make=()=>({files:[{role:'master',retired:false,asset:{id:'m',state:'uploaded'}}],source:{id:'m',state:'ready'},waveform:{id:'w',source_id:'m',state:'ready'},derivatives:[{id:'p',kind:'buyer_preview',source_id:'m',start_ms:0,end_ms:30000,state:'ready'}],selection:{start_ms:0,end_ms:30000},jobs:[],processing:{paused_reason:null}});
const states=(s,o)=>studioStages(s,o).map(v=>v.state);
test('four recording stages finish without fabricated percentages',()=>{
 const s=make();assert.deepEqual(states(s),Array(4).fill('completed'));
 assert.deepEqual(studioStages(s).map(v=>v.label),['Uploading','Verifying audio','Generating waveform','Ready']);
 s.derivatives=[];assert.deepEqual(states(s),['completed','completed','completed','completed']);
 s.jobs=[{asset_id:'p',state:'running'}];assert.equal(states(s)[3],'completed','AAC does not gate recording readiness');
 s.derivatives=[{id:'p',kind:'buyer_preview',source_id:'m',start_ms:0,end_ms:30000,state:'queued'}];assert.equal(states(s)[3],'completed');
});
test('upload, validation, waveform and preview transitions use exact current assets',()=>{
 const s=make();s.files[0].asset.state='reserved';assert.equal(states(s,{transferring:true})[0],'active');
 assert.equal(states(s,{paused:true})[0],'paused');
 s.files[0].asset.state='uploaded';s.source.state='queued';s.jobs=[{asset_id:'m',state:'running'}];assert.deepEqual(states(s),['completed','active','waiting','waiting']);
 s.source.state='ready';s.waveform.state='queued';s.jobs=[{asset_id:'w',state:'running'}];assert.deepEqual(states(s),['completed','completed','active','waiting']);
 s.waveform.source_id='old';assert.equal(states(s)[2],'waiting');
 s.waveform=make().waveform;s.selection.start_ms=100;assert.equal(states(s)[3],'completed');
});
test('failure, retry waits, unavailable status and financial pauses are explicit and never animated as active',()=>{
 const s=make();s.source.state='failed';s.jobs=[{asset_id:'m',state:'failed'}];assert.equal(states(s)[1],'failed');
 s.source.state='queued';s.jobs=[{asset_id:'m',state:'retry_wait'}];assert.equal(states(s)[1],'waiting');
 for(const reason of ['operator_disabled','budget_reserved','accounting_closed','accounting_stale','window_expired']){s.processing.paused_reason=reason;assert.equal(states(s)[1],'paused');}
 assert.equal(states(s,{unavailable:true})[1],'paused');
 s.processing.paused_reason=null;s.jobs=[{asset_id:'m',state:'running'}];assert.equal(states(s)[1],'active');
});
test('new local file never inherits completed stages from previous master; restored drafts retain actual progress',()=>{
 const s=make();assert.deepEqual(states(s,{localPending:true,transferring:true}),['active','waiting','waiting','waiting']);
 assert.deepEqual(states(s,{localPending:true}),Array(4).fill('waiting'));
 assert.deepEqual(states(JSON.parse(JSON.stringify(s))),Array(4).fill('completed'));
 s.files[0].retired=true;assert.deepEqual(states(s),Array(4).fill('waiting'));
});
test('empty upload UI hides the studio until a current master or local file exists; selection starts upload',()=>{
 const ui=readFileSync(new URL('../components/artist/uploads/upload-workbench.tsx',import.meta.url),'utf8');
 assert.match(ui,/const studioVisible=!!selectedFile\|\|!!data\?\.files.some\(f=>!f.retired&&f.role==='master'\)/);
 assert.ok(ui.indexOf('{studioVisible?<>')<ui.indexOf('aria-label="Waveform and preview"'));
 assert.match(ui,/Choose Audio File/);assert.match(ui,/onDrop=/);assert.match(ui,/setError\(''\);void upload\(file\)/);
 assert.match(ui,/open=\{!studioVisible\}/);assert.match(ui,/initialFile&&data&&startedFile.current!==initialFile/);
 assert.match(ui,/aria-label="Recording stages"/);assert.match(ui,/aria-current=\{stage.state==='active'\?'step':undefined\}/);
 assert.ok(ui.indexOf('aria-label="Recording stages"')<ui.indexOf('aria-label="Waveform and preview"'));
 assert.match(ui,/selectionWriter.restore\(\)/);assert.match(ui,/previewGenerationNeeded/);
});

test('ready recording stays ready during queued, failed or capacity-paused AAC without hiding AAC diagnostics',async()=>{
 const {publicPreviewMessage}=await import('../lib/media/upload-progress.mjs');
 for(const state of ['queued','failed','verifying']){const s=make();s.derivatives[0].state=state;s.jobs=[{asset_id:'p',state:state==='verifying'?'running':state}];s.processing.paused_reason='budget_reserved';
 assert.deepEqual(states(s),Array(4).fill('completed'));assert.equal(recordingProcessing(s).state,'succeeded');
 assert.match(publicPreviewMessage(s),state==='failed'?/could not be prepared/:/paused/);}
 const s=make();s.derivatives=[];assert.match(publicPreviewMessage(s),/still being prepared/);s.waveform.state='failed';s.jobs=[{asset_id:'w',state:'failed'}];assert.equal(recordingProcessing(s).state,'failed');
 const ui=readFileSync(new URL('../components/audio/recording-player.tsx',import.meta.url),'utf8');assert.doesNotMatch(ui,/>Accept Public Preview</);assert.match(ui,/Choose the 30 seconds you want people to hear. Your selection saves automatically./);
});

test('four-stage layout uses one compact desktop row and two mobile columns',()=>{const css=readFileSync(new URL('../components/audio/waveform-player.module.css',import.meta.url),'utf8');assert.match(css,/stageTimeline \{display:grid;grid-template-columns:repeat\(4,/);assert.match(css,/@media\(max-width:540px\)\{.stageTimeline\{grid-template-columns:repeat\(2,/);});
