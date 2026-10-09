// Synthetic near-250MB source. Offline/local only; no broker or hosted jobs.
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,stat,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {tone} from './fixtures.mjs';
import {MediaTools} from '../../workers/media/process.mjs';
import {validateSource,waveform,preview} from '../../workers/media/media.mjs';
const start=performance.now(),dir=await realpath(await mkdtemp('/work/resource-'));
try {
 const tools=new MediaTools('/opt/media/bin');await tools.verify();
 const sourcePath=join(dir,'tone.wav');await tone(sourcePath,{seconds:325.5,rate:192000,channels:2});
 const source=await validateSource(tools,sourcePath);
 assert.ok(source.actual_bytes>249000000&&source.actual_bytes<=250000000);
 const identity={asset_id:'11111111-1111-4111-8111-111111111111',object_id:'22222222-2222-4222-8222-222222222222',version:'synthetic-resource-v1',sha256:source.sha256};
 const peaks=await waveform(tools,sourcePath,source,identity,join(dir,'peaks'));
 const excerpt=await preview(tools,sourcePath,source,0,60000,join(dir,'preview'));
 let scratch=0;for(const name of await readdir(dir))scratch+=(await stat(join(dir,name))).size;
 const nodeRss=process.resourceUsage().maxRSS*1024;
 const result={fixture_bytes:source.actual_bytes,node_peak_rss_bytes:nodeRss,parser_peak_rss_bytes:tools.peakParserRss,parser_cpu_microseconds:tools.parserCpuMicros,scratch_bytes:scratch,wall_ms:Math.round(performance.now()-start),waveform_bytes:peaks.actual_bytes,preview_bytes:excerpt.actual_bytes};
 assert.ok(scratch<536870912&&nodeRss<1073741824&&tools.peakParserRss<805306368&&result.wall_ms<560000);
 process.stdout.write(JSON.stringify(result)+'\n');
}finally{await rm(dir,{recursive:true,force:true});}
