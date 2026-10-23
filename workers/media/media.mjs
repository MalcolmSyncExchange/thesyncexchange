import { open, stat, writeFile } from 'node:fs/promises';
import { MEDIA_PROFILES as P } from '../../contracts/submission-media/profiles.ts';
import { MediaError } from './errors.mjs';
import { dirname } from 'node:path';
import { checkAbort, openRegular, readBounded, verifyOutput } from './files.mjs';
export const MAX_CONTAINER_HEADERS=4096;
const fail = code => { throw new MediaError(code); };
export async function hashFile(path, maxBytes, signal) {
  const file=await openRegular(path,dirname(path),maxBytes,signal);
  try {return await readBounded(file,maxBytes,signal);}finally{await file.fd.close();}
}
async function header(path, count = 32) { const f = await open(path, 'r'); try { const b = Buffer.alloc(count); const r = await f.read(b,0,count,0); return b.subarray(0,r.bytesRead); } finally { await f.close(); } }
// Container walking bounds metadata and rejects truncated chunks/trailing polyglots before decoding.
export async function inspectAudio(path,signal,onHeader=()=>{}) {
  checkAbort(signal);
  const bytes = (await stat(path)).size; if (bytes > P.source.maxBytes) fail('file_too_large');
  const h = await header(path); let format, container;
  if (h.toString('ascii',0,4)==='RIFF' && h.toString('ascii',8,12)==='WAVE') { format='wav'; container='wav'; }
  else if (h.toString('ascii',0,4)==='FORM' && ['AIFF','AIFC'].includes(h.toString('ascii',8,12))) { format='aiff'; container=h.toString('ascii',8,12)==='AIFF'?'aiff':'aifc'; }
  else if (h.toString('ascii',0,4)==='fLaC') { format='flac'; container='flac'; }
  else fail('unsupported_format');
  const f = await open(path,'r');
  try {
    let offset = format==='flac'?4:12, metadataBytes=0, headers=0, expectedFrames=null, dataBytes=0;
    if (format!=='flac' && (format==='wav'?h.readUInt32LE(4):h.readUInt32BE(4))+8 !== bytes) fail('audio_unreadable');
    while (offset < bytes) {
      checkAbort(signal);if(++headers>MAX_CONTAINER_HEADERS)fail('unsupported_audio_configuration');onHeader(headers);checkAbort(signal);
      const b=Buffer.alloc(8); const n=await f.read(b,0,format==='flac'?4:8,offset);
      checkAbort(signal);
      if (n.bytesRead < (format==='flac'?4:8)) fail('audio_unreadable');
      const length=format==='flac'?b.readUIntBE(1,3):format==='wav'?b.readUInt32LE(4):b.readUInt32BE(4);
      const id=b.toString('ascii',0,4), base=offset+(format==='flac'?4:8);
      if (base+length>bytes) fail('audio_unreadable');
      if (format==='flac' || !['data','SSND'].includes(id)) metadataBytes+=length;
      if (metadataBytes>1_048_576) fail('unsupported_audio_configuration');
      if (id==='data'||id==='SSND') dataBytes+=length;
      if (id==='COMM' && length>=18) { const c=Buffer.alloc(18); await f.read(c,0,18,base); expectedFrames=c.readUInt32BE(2); }
      if (format==='flac' && (b[0]&127)===0) {
        if(length!==34) fail('audio_unreadable'); const s=Buffer.alloc(34); await f.read(s,0,34,base);
        expectedFrames=Number(s.readBigUInt64BE(10)&0xfffffffffn);
      }
      offset=base+length+(format==='flac'?0:length%2);
      if(format==='flac' && (b[0]&128)) break;
    }
    return { format,container,expectedFrames,dataBytes };
  } finally { await f.close(); }
}
const codecs = new Set(['pcm_s8','pcm_u8','pcm_s16le','pcm_s16be','pcm_s24le','pcm_s24be','pcm_s32le','pcm_s32be','pcm_f32le','pcm_f32be','pcm_f64le','pcm_f64be','flac']);
export async function validateSource(tools,path,signal) {
  const c=await inspectAudio(path,signal), probe=await tools.probe(path,c.format,signal), streams=probe.streams;
  const audio=Array.isArray(streams)?streams.filter(s=>s.codec_type==='audio'):[];
  if (audio.length!==1||streams.some(s=>s.codec_type!=='audio'&&(s.codec_type!=='video'||s.disposition?.attached_pic!==1))) fail('unsupported_audio_configuration');
  const s=audio[0], rate=Number(s.sample_rate), channels=s.channels, depth=Number(s.bits_per_raw_sample||s.bits_per_sample);
  if(!codecs.has(s.codec_name)||channels<1||channels>2||rate<8000||rate>192000||![4,8,12,16,20,24,32,64].includes(depth)) fail('unsupported_audio_configuration');
  if (c.format!=='flac' && !c.dataBytes) fail('no_audio_frames');
  const frames=await tools.decode(path,c.format,channels,signal);
  if(!frames) fail('no_audio_frames');
  if(c.expectedFrames!==null&&c.expectedFrames!==frames) fail('audio_unreadable');
  const duration=Math.round(frames*1e6/rate);
  if(duration<1e6||duration>900e6) fail('unsupported_audio_configuration');
  return { ...await hashFile(path,P.source.maxBytes,signal),container:c.container,codec:s.codec_name,frames,duration_us:duration,sample_rate:rate,channels,bit_depth:depth };
}
export function region(source,startMs,endMs) {
  if(!Number.isSafeInteger(startMs)||!Number.isSafeInteger(endMs)||startMs<0||endMs<=startMs||endMs*1000>source.duration_us) fail('preview_generation_failed');
  if(source.duration_us<15e6) {
    if(startMs!==0||endMs!==Math.floor(source.duration_us/1000)) fail('preview_generation_failed');
    return [0,source.frames];
  }
  if(startMs%100||endMs%100||endMs-startMs<15000||endMs-startMs>60000) fail('preview_generation_failed');
  return [Math.floor(startMs*source.sample_rate/1000),Math.floor(endMs*source.sample_rate/1000)];
}
export async function waveform(tools,path,source,identity,output,signal) {
  if(identity.sha256!==source.sha256 || (await hashFile(path,P.source.maxBytes,signal)).sha256!==source.sha256) fail('checksum_mismatch');
  const count=Math.ceil(source.duration_us/10000); if(count<1||count>P.waveform.maxPoints) fail('waveform_generation_failed');
  const minima=new Float32Array(count).fill(Infinity), maxima=new Float32Array(count).fill(-Infinity);
  const format=source.container==='aifc'?'aiff':source.container;
  const frames=await tools.decode(path,format,source.channels,signal,(value,frame)=>{
    const i=Math.floor(frame*100/source.sample_rate); if(i>=count) fail('waveform_generation_failed'); minima[i]=Math.min(minima[i],value);maxima[i]=Math.max(maxima[i],value);
  });
  if(frames!==source.frames) fail('waveform_generation_failed');
  // 512-byte bounded JSON header then little-endian int16 min/max. No URLs or paths.
  const meta={encoding:P.waveform.encoding,profile:P.waveform.version,source_asset_id:identity.asset_id,source_object_id:identity.object_id,source_version:identity.version,source_sha256:source.sha256,duration_us:source.duration_us,points:count,points_per_second:100};
  const json=Buffer.from(JSON.stringify(meta)); if(json.length>508) fail('waveform_generation_failed');
  const data=Buffer.alloc(512+count*4); data.writeUInt32LE(json.length);json.copy(data,4);
  for(let i=0;i<count;i++) { if(!Number.isFinite(minima[i])||!Number.isFinite(maxima[i])) fail('waveform_generation_failed'); data.writeInt16LE(Math.round(Math.max(-1,Math.min(1,minima[i]))*32767),512+i*4);data.writeInt16LE(Math.round(Math.max(-1,Math.min(1,maxima[i]))*32767),514+i*4); }
  if(data.length>P.waveform.maxBytes) fail('file_too_large');
  await writeFile(output,data,{flag:'wx',mode:0o600});
  return verifyOutput(output,P.waveform.maxBytes,signal,async()=>({container:P.waveform.encoding,waveform_points:count,source_sha256:source.sha256}));
}
export async function preview(tools,path,source,startMs,endMs,output,signal) {
  if((await hashFile(path,P.source.maxBytes,signal)).sha256!==source.sha256) fail('checksum_mismatch');
  const [start,end]=region(source,startMs,endMs);
  await tools.run('ffmpeg',['-nostdin','-v','error','-xerror','-threads','1','-filter_threads','1','-protocol_whitelist','file,pipe','-max_alloc','67108864',
    '-f',source.container==='aifc'?'aiff':source.container,'-i',path,'-map','0:a:0','-vn','-sn','-dn','-af',`atrim=start_sample=${start}:end_sample=${end},asetpts=PTS-STARTPTS`,
    '-map_metadata','-1','-map_chapters','-1','-c:a','aac','-profile:a','aac_low','-b:a','256k','-ar','44100','-ac',String(source.channels),'-threads','1','-fflags','+bitexact','-flags:a','+bitexact','-movflags','+faststart','-f','ipod',output],{signal,maxBytes:0,fileLimit:P.preview.maxBytes});
  return verifyOutput(output,P.preview.maxBytes,signal,async()=>{
  const p=await tools.probe(output,'mov',signal,67108864,true),s=p.streams?.[0];
  if(p.streams?.length!==1||s.codec_name!=='aac'||s.profile!=='LC'||Number(s.sample_rate)!==44100||s.channels!==source.channels) fail('preview_generation_failed');
  const frames=await tools.decode(output,'mov',s.channels,signal,undefined,44100*61,true);
  const duration=Math.round(frames*1e6/44100),expected=Math.round((end-start)*1e6/source.sample_rate);
  if(!frames||Math.abs(duration-expected)>100000) fail('preview_generation_failed');
  return {source_sha256:source.sha256,container:'m4a',codec:'aac_lc',frames,duration_us:duration,sample_rate:44100,channels:s.channels};
  });
}
async function imageSignature(path) {
  const h=await header(path);if(h[0]===255&&h[1]===216&&h[2]===255)return 'jpeg';
  if(h.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
  if(h.toString('ascii',0,4)==='RIFF'&&h.toString('ascii',8,12)==='WEBP')return 'webp';
  fail('artwork_invalid');
}
export async function validateArtwork(tools,path,signal) {
  const facts=await hashFile(path,P.artwork.maxBytes,signal),container=await imageSignature(path);
  const f=await open(path,'r');
  try {
    let offset=container==='webp'?12:8,headers=0;
    if(container==='webp' && (await header(path)).readUInt32LE(4)+8!==facts.actual_bytes) fail('artwork_invalid');
    if(container!=='jpeg') while(offset<facts.actual_bytes) {
      checkAbort(signal);if(++headers>MAX_CONTAINER_HEADERS)fail('artwork_invalid');
      const h=Buffer.alloc(8);if((await f.read(h,0,8,offset)).bytesRead!==8)fail('artwork_invalid');
      const id=h.toString('ascii',container==='png'?4:0,container==='png'?8:4),len=container==='png'?h.readUInt32BE(0):h.readUInt32LE(4);
      if(['acTL','ANIM','ANMF'].includes(id))fail('artwork_invalid');
      offset+=8+len+(container==='png'?4:len%2);if(offset>facts.actual_bytes)fail('artwork_invalid');
    }
  } finally {await f.close();}
  const format=container+'_pipe',p=await tools.probe(path,format,signal,134217728),s=p.streams?.[0],width=s?.width,height=s?.height;
  if(!s||p.streams.length!==1||!Number.isInteger(width)||!Number.isInteger(height)||width<256||height<256||width>8192||height>8192||width*height>32e6||width/height>4||height/width>4||!['mjpeg','png','webp'].includes(s.codec_name))fail('artwork_invalid');
  await tools.run('ffmpeg',['-nostdin','-v','error','-xerror','-err_detect','explode','-threads','1','-protocol_whitelist','file,pipe','-max_alloc','134217728','-f',format,'-i',path,'-map','0:v:0','-f','null','-'],{signal,maxBytes:0,readOnly:true});
  return {...facts,container,width,height,animated:false};
}
