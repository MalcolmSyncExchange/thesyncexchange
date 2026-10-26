// Explicit Linux packaging suite; not included in portable unit tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {packagedRuntime} from '../workers/media/packaged-runtime.mjs';
import {MediaTools} from '../workers/media/process.mjs';
import {validateSource,waveform,preview} from '../workers/media/media.mjs';
import {tone} from './media-worker/fixtures.mjs';
const root=process.env.TSE_PORTABLE_RUNTIME,expected=process.env.TSE_PORTABLE_MANIFEST_SHA256;
test('pinned portable runtime rejects altered manifest before any execution',async()=>{
 await assert.rejects(packagedRuntime(root,'0'.repeat(64)));assert.equal(process.platform,'linux');assert.ok(['x64','arm64'].includes(process.arch));
});
test('packaged launcher denies network, other files and group escape; kills late writers after success/failure/timeout',async()=>{
 const packaged=await packagedRuntime(root,expected),tools=new MediaTools('/opt/media-test/bin',packaged.python,packaged.runtime),d=await mkdtemp(join(tmpdir(),'portable-security-'));
 try{
  await tools.run('ffmpeg',['isolation',join(d,'unused1'),join(d,'unused2')],{readOnly:true,maxBytes:0});
  const readonly=join(d,'readonly');await writeFile(readonly,'unchanged');await tools.run('ffmpeg',['readonly',readonly,join(d,'unused')],{readOnly:true,maxBytes:0});assert.equal(await readFile(readonly,'utf8'),'unchanged');
  for(const mode of ['success','closed','failure','timeout']){
   const output=join(d,mode),pid=join(d,mode+'-pid');const p=tools.run('ffmpeg',[mode,output,pid],{maxBytes:0,timeout:mode==='timeout'?300:5000});
   if(mode==='success'||mode==='closed')await p;else await assert.rejects(p);
   const size=(await stat(output)).size;await new Promise(r=>setTimeout(r,250));assert.equal((await stat(output)).size,size);assert.doesNotMatch(await readFile(output,'utf8'),/ESCAPED/);
  }
 }finally{await rm(d,{recursive:true,force:true});}
});
test('self-contained Python/FFmpeg: WAV AIFF FLAC, exact 50 MB, waveform, preview, scratch and resource evidence',async()=>{
 const start=performance.now(),tools=await packagedRuntime(root,expected),loaded=performance.now();await tools.verify();const ready=performance.now();
 const d=await mkdtemp(join(tmpdir(),'portable-codec-'));const measurements=[];
 try{
  const p=join(d,'source');await tone(p,{seconds:35,rate:96000});
  for(const [format,codec] of [['wav','pcm_s16le'],['aiff','pcm_s16be'],['flac','flac']]){
   const path=join(d,format);if(format==='wav')await writeFile(path,await readFile(p));else await tools.run('ffmpeg',['-v','error','-i',p,'-c:a',codec,'-f',format,path],{maxBytes:0,fileLimit:50e6});
   const at=performance.now(),s=await validateSource(tools,path);assert.equal(s.duration_us,35000000);measurements.push({format,bytes:s.actual_bytes,processingMs:performance.now()-at});
  }
  const s=await validateSource(tools,p),identity={asset_id:'11111111-1111-4111-8111-111111111111',object_id:'22222222-2222-4222-8222-222222222222',version:'synthetic-v1',sha256:s.sha256};
  const at=performance.now();const w=await waveform(tools,p,s,identity,join(d,'wave')),v=await preview(tools,p,s,0,30000,join(d,'preview'));assert.equal(w.waveform_points,3500);assert.equal(v.codec,'aac_lc');assert.ok(v.actual_bytes<=4e6);
  const big=join(d,'50MB.wav');await tone(big,{seconds:(50_000_000-44)/4/48000,rate:48000,channels:2});assert.equal((await stat(big)).size,50_000_000);const t=performance.now(),large=await validateSource(tools,big);assert.equal(large.actual_bytes,50_000_000);measurements.push({format:'wav-50MB',bytes:large.actual_bytes,processingMs:performance.now()-t});
  const invalid=join(d,'invalid');await writeFile(invalid,'synthetic malformed recording');await assert.rejects(validateSource(tools,invalid));
  const original=await readFile(p);await assert.rejects(tools.run('ffmpeg',['-v','error','-i',p,'-c:a','pcm_s16le','-f','wav',join(d,'forbidden-output')],{readOnly:true,maxBytes:0}));assert.deepEqual(await readFile(p),original);await assert.rejects(stat(join(d,'forbidden-output')),{code:'ENOENT'});
  // No protocol/network support is present even before kernel policy.
  const protocols=(await tools.run('ffmpeg',['-protocols'])).toString();assert.doesNotMatch(protocols,/https?|tcp|udp/);
  const result={scope:'Local Docker Linux; AMD64 is emulated on this ARM64 Mac; not hosted acceptance',arch:process.arch,node:process.version,packageHash:expected,loadMs:loaded-start,verifyMs:ready-loaded,derivativesAndLargeMs:performance.now()-at,parserPeakRss:tools.peakParserRss,nodePeakRss:process.resourceUsage().maxRSS*1024,measurements,previewBytes:v.actual_bytes,waveformBytes:w.actual_bytes};
  console.log(JSON.stringify(result));if(process.env.TSE_RUNTIME_EVIDENCE==='/evidence')await writeFile('/evidence/packaged-runtime-results.json',JSON.stringify(result,null,2));
 }finally{await rm(d,{recursive:true,force:true});}
});
