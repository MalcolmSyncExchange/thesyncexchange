import test from 'node:test';
import assert from 'node:assert/strict';
import {localWaveform} from '../public/media/local-waveform.mjs';
import {waveformBars} from '../lib/media/waveform.mjs';
function wav(size,{bits=16,channels=2,silence=false}={}){
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(size-8,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(channels,22);header.writeUInt32LE(192000,24);const block=bits/8*channels;header.writeUInt32LE(192000*block,28);header.writeUInt16LE(block,32);header.writeUInt16LE(bits,34);header.write('data',36);header.writeUInt32LE(size-44,40);
 let largest=0,total=0;
 const file={size,slice(from,to){largest=Math.max(largest,to-from);total+=to-from;assert.ok(to-from<=8192,'never reads the whole file');const out=Buffer.alloc(to-from);for(let i=from;i<Math.min(to,44);i++)out[i-from]=header[i];if(!silence&&from>=44){const segment=Math.floor((from-44)/(size-44)*4),amplitude=[.1,.8,.2,.5][segment];for(let i=0;i+bits/8<=out.length;i+=bits/8){const n=Math.round(amplitude*32767);if(bits===16)out.writeInt16LE(i%(2*block)?n:-n,i);}}return new Blob([out]);}};
 return {file,metrics:()=>({largest,total})};
}
for(const size of [45_000_000,100_000_000,150_000_000])test(`${size}B waveform samples real PCM with bounded I/O`,async()=>{
 const fixture=wav(size),result=await localWaveform(fixture.file);assert.equal(result.envelope.points.length,256);assert.equal(result.sampled,true);assert.ok(result.readBytes<1_100_000);assert.ok(fixture.metrics().largest<=8192);assert.ok(result.elapsedMs<2000);const bars=waveformBars(result.envelope,256);assert.ok(bars.peakHeights[70]>bars.peakHeights[5]*5);assert.ok(bars.peakHeights[150]<bars.peakHeights[70]/2);
});
test('silence remains silence without invented bars',async()=>{const {file}=wav(1000000,{silence:true});const {envelope}=await localWaveform(file);assert.ok(waveformBars(envelope).heights.every(x=>x===0));});
function aiff(codec){
 const frames=8000,extra=codec?4:0,bytes=frames*2,buffer=Buffer.alloc(54+extra+bytes);buffer.write('FORM');buffer.writeUInt32BE(buffer.length-8,4);buffer.write(codec?'AIFC':'AIFF',8);buffer.write('COMM',12);buffer.writeUInt32BE(18+extra,16);buffer.writeUInt16BE(1,20);buffer.writeUInt32BE(frames,22);buffer.writeUInt16BE(16,26);buffer.writeUInt16BE(16395,28);buffer.writeUInt32BE(0xfa000000,30);if(codec)buffer.write(codec,38);const ssnd=38+extra;buffer.write('SSND',ssnd);buffer.writeUInt32BE(bytes+8,ssnd+4);for(let i=ssnd+16;i<buffer.length;i+=2){if(codec==='sowt')buffer.writeInt16LE(10000,i);else buffer.writeInt16BE(10000,i);}return new Blob([buffer]);
}
for(const codec of [null,'NONE','twos','sowt'])test(`AIFF/AIFC ${codec||'PCM'} real samples and duration`,async()=>{const {envelope}=await localWaveform(aiff(codec));assert.equal(envelope.duration_us,1000000);assert.ok(envelope.points.every(p=>p[1]===10000));});
test('unsupported compressed codecs and malformed/oversized headers fail gracefully',async()=>{
 for(const file of [new Blob(['fLaC'+''.padEnd(100,'0')]),{size:150000001,slice(){throw Error('must not read');}},new Blob([Buffer.alloc(100)])])await assert.rejects(localWaveform(file),/LOCAL_FORMAT_UNAVAILABLE/);
 const f=wav(1000000);await assert.rejects(localWaveform(f.file,{now:(()=>{let n=0;return()=>n+=1000;})(),timeoutMs:1500}),/LOCAL_FORMAT_UNAVAILABLE/);
});
