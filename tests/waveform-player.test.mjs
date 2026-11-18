import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {waveformBars,masterEnvelope,seekTime,artistPreviewRegion} from '../lib/media/waveform.mjs';
const env=points=>({encoding:'tse-preview-envelope-v1',duration_us:2000000,points});
test('one linear gain preserves measured relative peaks; no invented variation or silence',()=>{
 assert.deepEqual(waveformBars(env([[0,0],[0,0]])).heights,[0,0]);
 assert.deepEqual(waveformBars(env([[-100,100],[-200,200],[-400,400]])).heights,[.25,.5,1]);
 assert.deepEqual(waveformBars(env(Array.from({length:200},()=>[-8000,8000]))).heights,Array(120).fill(1));
 assert.throws(()=>waveformBars(env([[1,-1]])));assert.throws(()=>waveformBars(env([[0,1]]),0));
});
test('reduction preserves a one-point transient and symmetrical peak magnitude',()=>{
 const points=Array.from({length:600},()=>[-10,20]);points[302]=[-24000,100];
 assert.equal(waveformBars(env(points),60).heights[30],1);
 assert.equal(waveformBars(env([[-200,100],[0,100]]),2).heights[1],.5);
});
test('three-minute dynamic arrangement retains quiet, loud, silence and transient sections',()=>{
 const count=18000,minima=new Int16Array(count),maxima=new Int16Array(count);
 for(let i=0;i<count;i++){let amp=i<3000?2000:i<6000?10000:i<12000?24000:i<15000?0:12000;minima[i]=-amp;maxima[i]=amp;}
 maxima[3050]=32000;
 const full=masterEnvelope({durationUs:180000000,minima,maxima});const bars=waveformBars(full,120).heights;
 assert.ok(Math.max(...bars)<=1);assert.ok(bars.slice(0,20).every(v=>v<.1));assert.ok(bars.slice(80,100).every(v=>v===0));
 const crop=masterEnvelope({durationUs:180000000,minima,maxima},{startSample:60*16000,endSample:90*16000,sampleRate:16000,durationUs:30000000});
 assert.ok(crop.points.every(([lo,hi])=>lo===-24000&&hi===24000));
});
test('seek clamps finite values and rejects invalid timing without unsafe audio offsets',()=>{
 assert.equal(seekTime(.5,120),60);assert.equal(seekTime(-2,120),0);assert.equal(seekTime(2,120),120);
 for(const v of [NaN,Infinity,-Infinity])assert.equal(seekTime(v,120),0);
 assert.equal(seekTime(.5,NaN),0);assert.equal(seekTime(.5,-1),0);
});
test('exact two-second uploaded PCM fixture has near-constant genuine peaks',()=>{
 const data=fs.readFileSync(new URL('./fixtures/audio/synthetic-production.wav',import.meta.url));assert.equal(data.length,64044);
 const lows=[],highs=[];
 for(let start=44;start<data.length;start+=320){let low=32767,high=-32768;for(let i=start;i<Math.min(start+320,data.length);i+=2){const v=data.readInt16LE(i);low=Math.min(low,v);high=Math.max(high,v);}lows.push(low);highs.push(high);}
 const peaks=highs.map((v,i)=>Math.max(v,Math.abs(lows[i])));
 assert.equal(peaks.length,200);assert.ok(Math.max(...peaks)-Math.min(...peaks)<20);
});
test('custom player preserves native audio engine, bounded loading and reduced-motion behavior',()=>{
 const player=fs.readFileSync(new URL('../components/audio/waveform-player.tsx',import.meta.url),'utf8');
 assert.match(player,/<audio ref=/);assert.doesNotMatch(player,/<audio[^>]*\bcontrols\b/);
 for(const label of ['Preview position','Preview volume','Pause preview','Mute preview'])assert.ok(player.includes(label));
 assert.match(player,/requestAnimationFrame/);assert.match(player,/cancelAnimationFrame/);assert.match(player,/prefers-reduced-motion/);
 const waveform=fs.readFileSync(new URL('../components/audio/validated-waveform.tsx',import.meta.url),'utf8');
 assert.match(waveform,/credentials:'same-origin'/);assert.match(waveform,/redirect:'error'/);assert.match(waveform,/15000/);
 assert.match(waveform,/clipPath/);assert.match(waveform,/rx=/);assert.doesNotMatch(waveform,/Math.random/);
});
test('average envelope bodies expose real dynamics while maximum caps retain every transient',()=>{
 const e={...env([[-100,100],[-1000,1000],[-100,100],[-100,100]]),levels:[100,1000,100,100]};
 const b=waveformBars(e,2);assert.deepEqual(b.peakHeights,[1,.1]);assert.deepEqual(b.heights,[.55,.1]);
 for(const levels of [[-1,1,1,1],[101,1,1,1],[1],[NaN,1,1,1]])assert.throws(()=>waveformBars({...e,levels}));
});

test('artist crop binds generated revision and exactly matches worker frame rounding',()=>{
 const source={id:'source',sampleRate:11025,durationUs:90000000};
 const asset={sourceId:'source',startMs:30100,endMs:60100,durationUs:30000000};
 assert.equal(artistPreviewRegion(asset,source).startSample,331852);
 assert.equal(artistPreviewRegion(asset,source).endSample,662602);
 assert.equal(artistPreviewRegion({...asset,sourceId:'stale'},source),undefined);
 assert.equal(artistPreviewRegion({...asset,startMs:null},source),undefined);
 const short=artistPreviewRegion({sourceId:'source',startMs:0,endMs:2000,durationUs:2000063},{id:'source',sampleRate:16000,durationUs:2000063});
 assert.equal(short.endSample,32001);
});
