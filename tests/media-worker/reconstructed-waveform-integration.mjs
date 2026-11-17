// Local synthetic integration only. Run in the previously verified AMD64 image
// with network none, read-only root, no capabilities and a bounded /work tmpfs.
import assert from 'node:assert/strict';
import {writeFile,readFile,rm} from 'node:fs/promises';
import {MediaTools} from '/app/workers/media/process.mjs';
import {validateSource,waveform,preview} from '/app/workers/media/media.mjs';
import {parseWaveform,previewEnvelope} from '/qualification/waveform.mjs';
const source='/work/source.wav',wave='/work/wave.bin',audio='/work/preview.m4a';
const bytes=Buffer.alloc(64044);bytes.write('RIFF');bytes.writeUInt32LE(64036,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(64000,40);
for(let i=0;i<32000;i++)bytes.writeInt16LE(Math.round(Math.sin(2*Math.PI*440*i/16000)*10000),44+2*i);
const tools=new MediaTools('/opt/media/bin','/usr/bin/python3');
let stage='fixture';
const checkpoint=name=>{stage=name;console.log(JSON.stringify({stage:name}));};
try{
  await writeFile(source,bytes,{mode:0o600,flag:'wx'});checkpoint('tool_verification');await tools.verify();
  checkpoint('source_validation');const facts=await validateSource(tools,source);assert.equal(facts.frames,32000);assert.equal(facts.sample_rate,16000);assert.equal(facts.channels,1);
  checkpoint('waveform');await waveform(tools,source,facts,{...facts,asset_id:'11111111-1111-4111-8111-111111111111',object_id:'22222222-2222-4222-8222-222222222222',version:'synthetic-v1'},wave);
  checkpoint('aac_preview');const result=await preview(tools,source,facts,0,2000,audio);
  checkpoint('display_envelope');const parsed=parseWaveform(await readFile(wave),facts.sha256),envelope=previewEnvelope(parsed,{startSample:0,endSample:32000,sampleRate:16000,durationUs:result.duration_us});
  assert.equal(parsed.minima.length,200);assert.equal(envelope.points.length,600);assert.equal(result.codec,'aac_lc');assert.equal(result.sample_rate,44100);
  console.log(JSON.stringify({synthetic_only:true,source_sha256:facts.sha256,source_frames:facts.frames,waveform_points:parsed.minima.length,preview_codec:result.codec,preview_duration_us:result.duration_us,preview_bytes:result.actual_bytes,display_bins:envelope.points.length,network:'none',production_interactions:false}));
}catch(error){console.log(JSON.stringify({failed_stage:stage,error_category:error.code||'integration_assertion'}));process.exitCode=1;}finally{for(const file of [source,wave,audio])await rm(file,{force:true});console.log(JSON.stringify({cleanup:'complete'}));}
