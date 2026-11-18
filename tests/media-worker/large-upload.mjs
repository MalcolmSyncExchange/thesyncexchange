import {mkdir,open,rm} from 'node:fs/promises';
import {MediaTools} from '/app/workers/media/process.mjs';
import {validateSource,waveform,preview} from '/app/workers/media/media.mjs';
const dir='/work/large';await mkdir(dir,{mode:0o700});const tools=new MediaTools('/opt/media/bin');
try{await tools.verify();for(const bytes of (process.argv.length>2?process.argv.slice(2).map(Number):[50_000_000,75_000_000,100_000_000,150_000_000])){
 if(![50_000_000,75_000_000,100_000_000,150_000_000].includes(bytes))throw Error('UNAPPROVED_FIXTURE_SIZE');
 const path=dir+'/input.wav',out=await open(path,'wx',0o600),h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(bytes-8,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(2,22);h.writeUInt32LE(192000,24);h.writeUInt32LE(768000,28);h.writeUInt16LE(4,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(bytes-44,40);await out.write(h);
 const chunk=Buffer.alloc(768000);for(let i=0;i<chunk.length;i+=4){const frame=i/4,value=Math.round(16000*(.1+.9*frame/192000)*Math.sin(2*Math.PI*440*frame/192000));chunk.writeInt16LE(value,i);chunk.writeInt16LE(value,i+2);}for(let n=44;n<bytes;n+=chunk.length)await out.write(chunk.subarray(0,Math.min(chunk.length,bytes-n)));await out.close();
 const start=Date.now(),signal=AbortSignal.timeout(480000),source=await validateSource(tools,path,signal);if(source.actual_bytes!==bytes||source.frames!==(bytes-44)/4)throw Error('FRAME_MISMATCH');
 const identity={asset_id:'11111111-1111-4111-8111-111111111111',object_id:'22222222-2222-4222-8222-222222222222',version:'synthetic',sha256:source.sha256};
 if(bytes===100_000_000){await waveform(tools,path,source,identity,dir+'/wave.bin',signal);await preview(tools,path,source,0,30000,dir+'/preview.m4a',signal);}
 if(tools.peakParserRss>=805306368||process.resourceUsage().maxRSS*1024>=1073741824)throw Error('RESOURCE_LIMIT');
 console.log(JSON.stringify({node_peak_rss_bytes:process.resourceUsage().maxRSS*1024,bytes,frames:source.frames,sha256:source.sha256,seconds:(Date.now()-start)/1000,peak_rss_bytes:tools.peakParserRss,parser_cpu_us:tools.parserCpuMicros,generated:bytes===100_000_000?'waveform+AAC':'validation'}));await rm(path);
 }}finally{await rm(dir,{recursive:true,force:true});}
