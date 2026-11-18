// Millisecond selection matches the existing server revision contract. All
// long-recording selections are exactly 30s; short recordings use the full source.
export function previewSelection(durationUs,startMs=0){
 if(!Number.isSafeInteger(durationUs)||durationUs<1_000_000||durationUs>900_000_000)throw Error('Invalid recording duration');
 const total=Math.floor(durationUs/1000),length=Math.min(30000,total);
 const maximum=Math.floor((total-length)/100)*100;
 const start=Math.max(0,Math.min(maximum,Math.round((Number.isFinite(startMs)?startMs:0)/100)*100));
 return {startMs:start,endMs:start+length,maxStartMs:maximum};
}
export function selectionFromDrag(durationUs,initialStart,delta,width){
 if(!Number.isFinite(delta)||!Number.isFinite(width)||width<=0)throw Error('Invalid drag');
 return previewSelection(durationUs,initialStart+delta/width*(durationUs/1000));
}
// Keep previously saved/accepted legacy regions intact until an artist chooses
// a new fixed-length selection. Reset returns to that exact persisted region.
export function recordingSelection(durationUs,startMs,saved,retainSaved=true){
 const fallback=previewSelection(durationUs,startMs),from=saved?.start_ms,to=saved?.end_ms;
 if(retainSaved&&Number.isSafeInteger(from)&&Number.isSafeInteger(to)&&from>=0&&to>from&&to<=durationUs/1000&&to-from<=60000&&
   (to-from>=15000||durationUs<15000000&&from===0&&to===Math.floor(durationUs/1000)))return {startMs:from,endMs:to,maxStartMs:Math.floor((durationUs/1000-(to-from))/100)*100};
 return fallback;
}
export function matchesSelection(asset,sourceId,region){return !!asset&&asset.source_id===sourceId&&asset.start_ms===region.startMs&&asset.end_ms===region.endMs;}
export function playbackBounds(mode,durationUs,region,preview){
 const total=durationUs/1e6;
 if(mode==='generated')return {start:0,end:(preview?.duration_us||0)/1e6,offset:(preview?.start_ms||0)/1000};
 if(mode==='selection')return {start:region.startMs/1000,end:durationUs<30_000_000&&region.startMs===0&&region.endMs===Math.floor(durationUs/1000)?total:region.endMs/1000,offset:0};
 return {start:0,end:total,offset:0};
}
