import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaTools } from '../workers/media/process.mjs';
import { validateSource,validateArtwork,waveform,preview,region,hashFile } from '../workers/media/media.mjs';
import { tone,png } from './media-worker/fixtures.mjs';
const tools=new MediaTools(process.env.MEDIA_TOOL_DIR||'/private/tmp/slice3-media-tools/bin');
async function run(body){const dir=await mkdtemp(join(tmpdir(),'media-test-'));try{await tools.verify();await body(dir);}finally{await rm(dir,{recursive:true,force:true});}}
const identity=s=>({asset_id:'11111111-1111-4111-8111-111111111111',object_id:'22222222-2222-4222-8222-222222222222',version:'version-1',sha256:s.sha256});
test('source: WAV AIFF FLAC complete decoding, hashes, mono/stereo, rate/duration bounds and corrupt inputs',()=>run(async d=>{
 const wav=join(d,'source.wav');await tone(wav);const original=await validateSource(tools,wav);assert.equal(original.frames,30*44100);assert.equal(original.bit_depth,16);assert.equal(original.sha256,(await hashFile(wav,250e6)).sha256);
 for(const [format,codec] of [['aiff','pcm_s16be'],['flac','flac']]){const path=join(d,format);await tools.run('ffmpeg',['-v','error','-i',wav,'-c:a',codec,'-f',format,path],{maxBytes:0,fileLimit:250e6});const s=await validateSource(tools,path);assert.equal(s.container,format);assert.equal(s.frames,original.frames);}
 for(const [rate,seconds,ok] of [[8000,1,true],[192000,1,true],[44100,0.9,false],[44100,900.1,false]]){const p=join(d,`${rate}-${seconds}`);await tone(p,{seconds,rate,channels:2});if(ok)assert.equal((await validateSource(tools,p)).sample_rate,rate);else await assert.rejects(validateSource(tools,p));}
 const b=await readFile(wav);for(const [name,data] of [['mp3',Buffer.from('ID3'+ 'x'.repeat(100))],['truncated',b.subarray(0,-100)],['polyglot',Buffer.concat([b,Buffer.from('extra')])],['corrupt',Buffer.from('RIFF'+ 'x'.repeat(60))]]){const p=join(d,name);await writeFile(p,data);await assert.rejects(validateSource(tools,p));}
 const z=join(d,'zero');await tone(z,{seconds:0});await assert.rejects(validateSource(tools,z),/no_audio_frames|audio_unreadable/);
 const mp3=JSON.parse(await readFile(new URL('media-worker/mp3-fixture.json',import.meta.url)));const compressed=join(d,'real-mp3');await writeFile(compressed,Buffer.from(mp3.base64,'base64'));await assert.rejects(validateSource(tools,compressed),/unsupported_format/);
 const multi=join(d,'multichannel');await tone(multi,{seconds:1,channels:3});await assert.rejects(validateSource(tools,multi),/unsupported_audio_configuration/);
}));
test('waveform: deterministic versioned envelope, anti-cancellation, source binding, 900-second bounded streaming',()=>run(async d=>{
 const path=join(d,'anti.wav');await tone(path,{seconds:2,channels:2,antiphase:true});const source=await validateSource(tools,path);
 for(const out of ['one','two'])await waveform(tools,path,source,identity(source),join(d,out));
 const a=await readFile(join(d,'one'));assert.deepEqual(a,await readFile(join(d,'two')));assert.equal(a.length,512+200*4);assert.ok(a.readInt16LE(512)<-10000);assert.ok(a.readInt16LE(514)>10000);
 assert.equal(JSON.parse(a.subarray(4,4+a.readUInt32LE()).toString()).source_sha256,source.sha256);
 await assert.rejects(waveform(tools,path,source,{...identity(source),sha256:'0'.repeat(64)},join(d,'wrong')),/checksum_mismatch/);
 const large=join(d,'900.wav');await tone(large,{seconds:900,rate:48000,channels:2});const s=await validateSource(tools,large);const r=await waveform(tools,large,s,identity(s),join(d,'long'));assert.equal(r.waveform_points,90000);assert.ok(r.actual_bytes<2e6);
 console.log(JSON.stringify({fixture_bytes:s.actual_bytes,parser_peak_rss_bytes:tools.peakParserRss,node_peak_rss_bytes:process.resourceUsage().maxRSS*1024,waveform_bytes:r.actual_bytes}));
}));
test('preview: 15/30/60 seconds, short whole cue, sample boundaries, decode, source unchanged',()=>run(async d=>{
 const path=join(d,'source');await tone(path,{seconds:65,channels:2});const source=await validateSource(tools,path);
 for(const [start,end] of [[0,15000],[10000,40000],[0,60000],[5000,65000]]){const r=await preview(tools,path,source,start,end,join(d,String(start)+'-'+end));assert.equal(r.codec,'aac_lc');assert.equal(r.channels,2);assert.ok(Math.abs(r.duration_us-(end-start)*1000)<100000);assert.ok(r.actual_bytes<4e6);}
 for(const [start,end] of [[0,14900],[0,60100],[-100,30000],[10000,9000],[0,66000],[1,30000]])assert.throws(()=>region(source,start,end));
 assert.equal((await hashFile(path,250e6)).sha256,source.sha256);
 const short=join(d,'short');await tone(short,{seconds:2});const s=await validateSource(tools,short);assert.deepEqual(region(s,0,2000),[0,s.frames]);assert.throws(()=>region(s,0,1900));await preview(tools,short,s,0,2000,join(d,'short-preview'));
 await assert.rejects(preview(tools,path,{...source,sha256:'0'.repeat(64)},0,30000,join(d,'bad')),/checksum_mismatch/);
}));
test('artwork: still PNG/JPEG decode, size/dimension/animation/malformed rejection',()=>run(async d=>{
 const path=join(d,'png');await png(path);assert.equal((await validateArtwork(tools,path)).width,256);
 const jpg=join(d,'jpg');await tools.run('ffmpeg',['-v','error','-f','png_pipe','-i',path,'-c:v','mjpeg','-frames:v','1','-f','image2',jpg],{maxBytes:0});assert.equal((await validateArtwork(tools,jpg)).container,'jpeg');
 for(const [name,w,h,animated] of [['small',255,256,false],['ratio',256,1280,false],['animated',256,256,true]]){const p=join(d,name);await png(p,w,h,{animated});await assert.rejects(validateArtwork(tools,p));}
 const malformed=join(d,'malformed');await writeFile(malformed,(await readFile(path)).subarray(0,-5));await assert.rejects(validateArtwork(tools,malformed));
}));
test('artwork: synthetic still and animated WebP, oversized dimensions, image byte ceiling',()=>run(async d=>{
 const fixtures=JSON.parse(await readFile(new URL('media-worker/webp-fixtures.json',import.meta.url)));
 for(const type of ['still','animated']){const p=join(d,type);await writeFile(p,Buffer.from(fixtures[type],'base64'));if(type==='still')assert.equal((await validateArtwork(tools,p)).container,'webp');else await assert.rejects(validateArtwork(tools,p),/artwork_invalid/);}
 const big=join(d,'big.png');await png(big,8193,256);await assert.rejects(validateArtwork(tools,big));
 const pixels=join(d,'pixels.png');await png(pixels,6000,6000);await assert.rejects(validateArtwork(tools,pixels));
 const largeValid=join(d,'large-valid.png');await png(largeValid,6000,5000);assert.equal((await validateArtwork(tools,largeValid)).height,5000);
 const oversized=join(d,'oversized');const f=await open(oversized,'w');await f.truncate(10000001);await f.close();await assert.rejects(validateArtwork(tools,oversized),/file_too_large/);
}));
test('source: oversized request, bounded metadata, non-finite float samples and shell-like filename',()=>run(async d=>{
 const huge=join(d,'huge');const f=await open(huge,'w');await f.truncate(250000001);await f.close();await assert.rejects(validateSource(tools,huge),/file_too_large/);
 const path=join(d,'$(ignored);source.wav');await tone(path,{seconds:2});const b=await readFile(path),metadata=Buffer.alloc(1048584);metadata.write('LIST');metadata.writeUInt32LE(metadata.length-8,4);const m=Buffer.concat([b,metadata]);m.writeUInt32LE(m.length-8,4);const p=join(d,'metadata');await writeFile(p,m);await assert.rejects(validateSource(tools,p),/unsupported_audio_configuration/);
 const floats=Buffer.alloc(44+44100*4);b.copy(floats,0,0,44);floats.writeUInt32LE(floats.length-8,4);floats.writeUInt16LE(3,20);floats.writeUInt32LE(44100*4,28);floats.writeUInt16LE(4,32);floats.writeUInt16LE(32,34);floats.writeUInt32LE(44100*4,40);floats.writeFloatLE(NaN,44);const n=join(d,'nan');await writeFile(n,floats);await assert.rejects(validateSource(tools,n));
 assert.equal((await validateSource(tools,path)).duration_us,2000000);
}));
