import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile, writeFile, symlink, link, unlink, rename, open, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { inspectAudio, MAX_CONTAINER_HEADERS, hashFile, validateSource } from '../workers/media/media.mjs';
import { openRegular, readBounded, verifyOutput, withVerifiedOutput } from '../workers/media/files.mjs';
import { LocalObjects } from '../workers/media/broker.mjs';
import { MediaTools } from '../workers/media/process.mjs';
import { tone } from './media-worker/fixtures.mjs';

async function fixture(body) {
  const d=await realpath(await mkdtemp(join(tmpdir(),'remediation-')));
  try {await body(d);}finally{await rm(d,{recursive:true,force:true});}
}
async function chunks(d,count,payload=0) {
  const base=join(d,'tone');await tone(base,{seconds:1});const wav=await readFile(base);
  const extra=Buffer.alloc(count*(8+payload));
  for(let i=0;i<count;i++){extra.write('JUNK',i*(8+payload));extra.writeUInt32LE(payload,i*(8+payload)+4);}
  const b=Buffer.concat([wav.subarray(0,12),extra,wav.subarray(12)]);b.writeUInt32LE(b.length-8,4);
  const path=join(d,'chunks');await writeFile(path,b);return path;
}
test('header traversal: already aborted never probes; mid-traversal cancellation is authoritative',()=>fixture(async d=>{
  const path=await chunks(d,100),c=new AbortController();c.abort();let probes=0;
  await assert.rejects(validateSource({probe(){probes++;}},path,c.signal),/worker_lease_expired/);assert.equal(probes,0);
  const during=new AbortController();let count=0;
  await assert.rejects(inspectAudio(path,during.signal,n=>{count=n;if(n===8)during.abort();}),/worker_lease_expired/);
  assert.equal(count,8);
}));
test('header traversal: 200,000 zero chunks and metadata independently bounded; legal near-bound WAV decodes',()=>fixture(async d=>{
  let count=0;await assert.rejects(inspectAudio(await chunks(d,200000),undefined,n=>{count=n;}),/unsupported_audio_configuration/);
  assert.equal(count,MAX_CONTAINER_HEADERS);
  await unlink(join(d,'tone'));await assert.rejects(inspectAudio(await chunks(d,1,1048578)),/unsupported_audio_configuration/);
  await unlink(join(d,'tone'));const valid=await chunks(d,MAX_CONTAINER_HEADERS-2);let validCount=0;
  await inspectAudio(valid,undefined,n=>{validCount=n;});assert.equal(validCount,MAX_CONTAINER_HEADERS);
  const tools=new MediaTools(process.env.MEDIA_TOOL_DIR||'/private/tmp/slice3-media-tools/bin');
  assert.equal((await validateSource(tools,valid)).frames,44100);
}));
test('header traversal: payload-exempt WAV data, AIFF and FLAC empty blocks obey the same structural limit',()=>fixture(async d=>{
  for(const type of ['wav','aiff','flac']) {
    const width=type==='flac'?4:8, prefix=type==='flac'?4:12,b=Buffer.alloc(prefix+200000*width);
    if(type==='flac')b.write('fLaC');else {b.write(type==='wav'?'RIFF':'FORM');b.write(type==='wav'?'WAVE':'AIFF',8);if(type==='wav')b.writeUInt32LE(b.length-8,4);else b.writeUInt32BE(b.length-8,4);}
    for(let i=prefix;i<b.length;i+=width){if(type==='flac')b[i]=1;else b.write(type==='wav'?'data':'ANNO',i);}
    const path=join(d,type);await writeFile(path,b);let count=0;
    await assert.rejects(inspectAudio(path,undefined,n=>{count=n;}),/unsupported_audio_configuration/);assert.equal(count,MAX_CONTAINER_HEADERS);
  }
}));
test('output identity: symlink, hardlink, directory, FIFO, traversal and outside root rejected before reading',()=>fixture(async d=>{
  const scratch=join(d,'scratch');await mkdir(scratch);const outside=join(d,'outside');await writeFile(outside,'dummy-marker');
  const path=join(scratch,'output');await symlink(outside,path);await assert.rejects(hashFile(path,4e6),/validation_failed/);
  await unlink(path);await link(outside,path);await assert.rejects(hashFile(path,4e6),/validation_failed/);await unlink(path);
  await mkdir(path);await assert.rejects(hashFile(path,4e6),/validation_failed/);await rm(path,{recursive:true});
  execFileSync('/usr/bin/python3',['-c','import os,sys;os.mkfifo(sys.argv[1])',path]);await assert.rejects(hashFile(path,4e6),/validation_failed/);await unlink(path);
  await assert.rejects(openRegular(outside,scratch,4e6),/validation_failed/);
  await assert.rejects(openRegular(scratch+'/../outside',scratch,4e6),/validation_failed/);
  assert.equal(await readFile(outside,'utf8'),'dummy-marker');
}));
test('output identity: validated output replacement, symlink swap and same-inode writes fail closed',()=>fixture(async d=>{
  const path=join(d,'output');await writeFile(path,'original');
  const proof=await verifyOutput(path,4e6,undefined,async()=>({}));
  await rename(path,join(d,'old'));await writeFile(path,'original');
  await assert.rejects(withVerifiedOutput(proof,4e6,undefined,()=>assert.fail()),/validation_failed/);
  await unlink(path);await symlink(join(d,'old'),path);
  await assert.rejects(withVerifiedOutput(proof,4e6,undefined,()=>assert.fail()),/validation_failed/);
  await unlink(path);await writeFile(path,'original');
  await assert.rejects(verifyOutput(path,4e6,undefined,async()=>{await writeFile(path,'mutated');return {};}),/validation_failed/);
}));
test('output identity: bounded FD hash/copy, no raw path accepted, identity swap during copy detected',()=>fixture(async d=>{
  const path=join(d,'output');await writeFile(path,'validated synthetic bytes');let observed=0;
  const store=new LocalObjects(join(d,'objects'),async()=>{observed++;});const job={bucket:'submission-derived',path:'one',max_bytes:4e6};
  const proof=await verifyOutput(path,4e6,undefined,async()=>({}));
  const o=await withVerifiedOutput(proof,4e6,undefined,(file,facts)=>store.createExact(job,file,facts));
  assert.equal(o.sha256,proof.sha256);assert.equal(o.bytes,proof.actual_bytes);assert.equal(observed,1);
  await assert.rejects(withVerifiedOutput(path,4e6,undefined,()=>assert.fail()),/validation_failed/);
  await assert.rejects(withVerifiedOutput(proof,4e6,undefined,async file=>{await rename(path,join(d,'old'));await writeFile(path,'replacement');await readBounded(file,4e6);}),/validation_failed/);
  const large=join(d,'large'),f=await open(large,'w');await f.truncate(4000001);await f.close();
  await assert.rejects(verifyOutput(large,4e6,undefined,async()=>assert.fail()),/file_too_large/);
}));
test('parser process groups: descendants cannot keep writing after success, failure, timeout or cancellation',async t=>{
  const toolDir=process.env.MEDIA_DESCENDANT_TOOL_DIR;
  if(!toolDir){t.skip('native descendant fixture is exercised in the Linux container');return;}
  await fixture(async d=>{
    const tools=new MediaTools(toolDir);
    await tools.run('ffmpeg',['isolation',join(d,'unused1'),join(d,'unused2')],{readOnly:true,maxBytes:0});
    const readonly=join(d,'readonly');await writeFile(readonly,'unchanged');
    await tools.run('ffmpeg',['readonly',readonly,join(d,'unused')],{readOnly:true,maxBytes:0});
    assert.equal(await readFile(readonly,'utf8'),'unchanged');
    for(const mode of ['success','closed','failure','timeout','cancel']) {
      const output=join(d,mode),pid=join(d,mode+'-pid'),c=new AbortController();
      const p=tools.run('ffmpeg',[mode,output,pid],{signal:c.signal,maxBytes:0,timeout:mode==='timeout'?500:5000});
      if(mode==='cancel'){for(let i=0;i<100;i++){try{await stat(pid);break;}catch{await new Promise(r=>setTimeout(r,10));}}c.abort();}
      if(mode==='success'||mode==='closed')await p;else await assert.rejects(p);
      const first=(await stat(output)).size;await new Promise(r=>setTimeout(r,250));assert.equal((await stat(output)).size,first);
      const marker=await readFile(output,'utf8');assert.doesNotMatch(marker,/ESCAPED/);
    }
  });
});
