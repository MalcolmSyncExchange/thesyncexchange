import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchDelay,dispatchLoop} from '../services/media-broker/dispatch-loop.mjs';
import {waveformTransfer,processingCopy} from '../lib/media/audio-workflow.mjs';

test('only confirmed success removes delay; idle and all ambiguous results back off',()=>{
 assert.equal(dispatchDelay({state:'completed'}),0);
 for(const state of ['failed','idle','busy','issued','budget_limit','operator_disabled','uncertain_launch','budget_or_accounting_paused'])assert.equal(dispatchDelay({state}),5000);
 assert.equal(dispatchDelay(null),5000);
});
test('productive loop rechecks authority before each pass and preserves idle/failure delays',async()=>{
 const controller=new AbortController(),states=['completed','completed','failed','idle'],waits=[],calls=[];
 await dispatchLoop({signal:controller.signal,verify:async()=>calls.push('verify'),dispatcher:{once:async()=>{calls.push('dispatch');const state=states.shift();if(!states.length)controller.abort();return{state};}},sleep:async(ms)=>waits.push(ms)});
 assert.deepEqual(calls,['verify','dispatch','verify','dispatch','verify','dispatch','verify','dispatch']);assert.deepEqual(waits,[5000]);
});
test('cancellation interrupts idle wait and an authority failure cannot dispatch',async()=>{
 const c=new AbortController();let calls=0;
 await dispatchLoop({signal:c.signal,verify:async()=>{},dispatcher:{once:async()=>{calls++;return{state:'idle'};}},sleep:async()=>{c.abort();throw Error('cancelled');}});assert.equal(calls,1);
 await assert.rejects(dispatchLoop({signal:new AbortController().signal,verify:async()=>{throw Error('expired');},dispatcher:{once:async()=>assert.fail('must not run')}}),/expired/);
});
test('waveform percentages reflect acknowledged bytes only and reject malformed counters',()=>{
 for(const total of [45_500_000,100_000_000,150_000_000])for(const fraction of [0,.5,1])assert.equal(waveformTransfer(total*fraction,total),fraction*100);
 for(const args of [[-1,5],[6,5],[1,0],[NaN,5],[1,Infinity]])assert.equal(waveformTransfer(...args),null);
});
test('pauses have real reasons and processing never invents completion percentages or ETAs',()=>{
 assert.match(processingCopy('Validating audio','running').detail,/integrity/);
 assert.match(processingCopy('Ready for review','succeeded').title,/business/);
 for(const reason of ['operator_disabled','window_expired','accounting_closed','accounting_stale','budget_reserved','unknown']){
  const copy=processingCopy('Waiting for processing','paused',reason);assert.ok(copy.title&&copy.detail);assert.doesNotMatch(copy.detail,/%|\$|620470021/);
 }
 assert.match(processingCopy('Validating audio','paused','budget_reserved').detail,/capacity/);
});

test('unified presentation transitions from preparation through final completion without fake progress',async()=>{
 const {recordingPresentation:p}=await import('../lib/media/audio-workflow.mjs');
 assert.deepEqual(p({local:true}),{label:'Preparing waveform',animate:false});
 assert.equal(p({local:true,analyzed:true}).label,'Ready to upload');
 assert.equal(p({local:true,transfer:true}).label,'Uploading recording');
 assert.equal(p({transfer:true,paused:true}).label,'Upload paused');
 for(const [stage,label] of [['Waiting for processing','Waiting for processing'],['Validating audio','Validating audio'],['Generating waveform','Generating final waveform'],['Generating preview','Creating AAC preview'],['Ready for review','Ready for review']]){
  const state=stage==='Ready for review'?'succeeded':stage==='Waiting for processing'?'queued':'running';
  assert.deepEqual(p({stage,state}),{label,animate:state==='running'});
  for(const guard of ['local','transfer','paused','unavailable'])assert.equal(p({stage,state,[guard]:true}).animate,false);
 }
 for(const state of ['queued','paused','failed','retry_wait','succeeded'])assert.equal(p({stage:'Generating waveform',state}).animate,false);
 assert.equal(p({state:'running',unavailable:true}).label,'Checking saved status');
});
