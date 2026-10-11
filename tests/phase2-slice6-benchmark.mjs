import { performance } from 'node:perf_hooks';
import { buildSECReadModels } from '../lib/analytics/intelligence/read-models.ts';
import { eventSchemas } from '../lib/analytics/schema.ts';
const start=Date.parse('2026-01-01T00:00:00Z');
const request={range:{startInclusive:new Date(start).toISOString(),endExclusive:new Date(start+89*86400000).toISOString()},environment:'preview',timezone:'UTC',granularity:'day',now:new Date('2026-06-01'),maxStepLagMs:86400000,comparePrevious:false};
const source=rows=>({state:'available',type:'fixture',observations:rows,instrumentedEvents:Object.keys(eventSchemas),queriedRange:{startInclusive:request.range.startInclusive,endExclusive:new Date(start+93*86400000).toISOString()},observedThrough:request.range.startInclusive,coverageVerified:false,lastUpdatedAt:null});
const rows=(count,tracks)=>Array.from({length:count},(_,i)=>({eventId:`fixture-${i}`,actorId:`actor-${i%200}`,actorRole:'buyer',event:'track_preview_started',trackId:`track-${i%tracks}`,occurredAt:new Date(start+(i%89)*86400000+3600000).toISOString(),environment:'preview',isTest:false,isInternal:false}));
const results=[];
for(const [label,count,tracks,granularity] of [['daily-1000-50tracks',1000,50,'day'],['daily-cap-10000-500tracks',10000,500,'day'],['hourly-cap-10000-500tracks',10000,500,'hour']]){
 const input=source(rows(count,tracks));const samples=[];let data;
 for(let run=0;run<3;run++){const before=performance.now();data=buildSECReadModels(input,{...request,granularity});samples.push(+(performance.now()-before).toFixed(2));}
 results.push({label,rows:count,tracks,intervals:data.series.length,samplesMs:samples,medianMs:[...samples].sort((a,b)=>a-b)[1],serializedBytes:Buffer.byteLength(JSON.stringify(data)),metricCards:data.series.reduce((n,b)=>n+b.metrics.length,0)});
}
console.log(JSON.stringify({node:process.version,method:'3 sequential runs; local fixture aggregation only, no DB/network/production timing',results},null,2));
