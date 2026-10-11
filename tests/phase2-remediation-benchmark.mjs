import { performance } from 'node:perf_hooks';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { eventSchemas } from '../lib/analytics/schema.ts';
const caseFilter = process.argv.find(arg=>arg.startsWith('--case='))?.slice(7);
const baseline = process.argv.includes('--baseline');
const snapshot = new URL(`.baseline-${process.pid}/`, import.meta.url);
const moduleUrl = baseline ? new URL('lib/analytics/intelligence/read-models.ts', snapshot) : new URL('../lib/analytics/intelligence/read-models.ts', import.meta.url);
if (baseline) {mkdirSync(snapshot);execFileSync('tar',['-x','-C',fileURLToPath(snapshot)],{input:execFileSync('git',['archive','e671bd104abb4deed881a01856c90e0e7bb8fbdb','lib/analytics'])});}
try {
 const { buildSECReadModels, SERIES_METRIC_IDS } = await import(moduleUrl.href);
 const start=Date.parse('2026-01-01T00:00:00Z'), results=[];
 for(const [label,count,tracks,days,granularity,comparePrevious,dense] of [
  ['daily-small',1000,50,89,'day',false],['daily-cap',10000,500,89,'day',false],
  ['daily-comparison-cap',10000,500,44,'day',true],['hourly-cap',10000,500,7,'hour',false],
  ['hourly-comparison-cap',10000,500,7,'hour',true],['legacy-hourly-range',10000,500,89,'hour',false],['dense-unmatched-checkout',10000,2,7,'hour',false,true]]) {
  if(caseFilter && label!==caseFilter)continue;
  const request={range:{startInclusive:new Date(start).toISOString(),endExclusive:new Date(start+days*86400000).toISOString()},environment:'preview',timezone:'UTC',granularity,now:new Date('2026-06-01'),maxStepLagMs:86400000,comparePrevious,seriesMetric:"track_preview_started"};
  const observations=Array.from({length:count},(_,i)=>({eventId:`fixture-${i}`,actorId:`actor-${i%200}`,actorRole:'buyer',event:'track_preview_started',trackId:`track-${i%tracks}`,occurredAt:new Date(start+(i%days)*86400000+3600000-(comparePrevious&&i%2?days*86400000:0)).toISOString(),environment:'preview',isTest:false,isInternal:false}));
  if(dense)observations.forEach((row,i)=>{row.actorId='dense-actor';row.event=i<5000?'license_selected':'checkout_started';row.trackId=i<5000?'entry-track':'foreign-track';row.occurredAt=new Date(start+3600000+(i<5000?i:i+5000)*1000).toISOString();});
  const source={state:'available',type:'fixture',observations,instrumentedEvents:Object.keys(eventSchemas),queriedRange:{startInclusive:new Date(start-days*86400000).toISOString(),endExclusive:new Date(start+(days+4)*86400000).toISOString()},observedThrough:request.range.startInclusive,coverageVerified:false,lastUpdatedAt:null};
  const samples=[];let data;
  if (!baseline && label==='legacy-hourly-range') {assert.throws(()=>buildSECReadModels(source,request),/at most seven days/);results.push({label,result:'explicitly rejected; no shortened report'});continue;}
  for(let run=0;run<3;run++){const before=performance.now();data=buildSECReadModels(source,request);samples.push(+(performance.now()-before).toFixed(2));}
  const serializedBytes=Buffer.byteLength(JSON.stringify(data)), medianMs=[...samples].sort((a,b)=>a-b)[1];
  if(!baseline){assert.ok(samples.every(ms=>ms<=2000),`${label} aggregation budget: ${samples}`);assert.ok(serializedBytes<=2000000,`${label} DTO budget: ${serializedBytes}`);assert.equal(data.trackPage.total,tracks);}
  let allMetricMaxMs=0,allMetricMaxBytes=0;
  if(!baseline){for(const seriesMetric of SERIES_METRIC_IDS){const before=performance.now();const selected=buildSECReadModels(source,{...request,seriesMetric});const elapsed=performance.now()-before,bytes=Buffer.byteLength(JSON.stringify(selected));assert.ok(elapsed<=2000,`${label}/${seriesMetric} aggregation budget`);assert.ok(bytes<=2000000,`${label}/${seriesMetric} payload budget`);allMetricMaxMs=Math.max(allMetricMaxMs,elapsed);allMetricMaxBytes=Math.max(allMetricMaxBytes,bytes);}}
  results.push({label,rows:count,tracks,days,comparePrevious,samplesMs:samples,medianMs,serializedBytes,returnedTracks:data.tracks.length,...(!baseline?{allMetricMaxMs:+allMetricMaxMs.toFixed(2),allMetricMaxBytes}:{})});
 }
 console.log(JSON.stringify({baseline,node:process.version,method:'three sequential fixture runs; all samples <=2s and DTO <=2MB required for supported requests; no hosted timing',results},null,2));
} finally {if(baseline)rmSync(snapshot,{recursive:true,force:true});}
