export type Selection={startMs:number;endMs:number;maxStartMs:number};
export function previewSelection(durationUs:number,startMs?:number):Selection;
export function selectionFromDrag(durationUs:number,initialStart:number,delta:number,width:number):Selection;
export function recordingSelection(durationUs:number,startMs:number,saved:{start_ms:number|null;end_ms:number|null},retainSaved?:boolean):Selection;
export function matchesSelection(asset:{source_id?:string;start_ms?:number;end_ms?:number}|null|undefined,sourceId:string,region:Selection):boolean;
export function playbackBounds(mode:string,durationUs:number,region:Selection,preview?:{duration_us?:number;start_ms?:number}|null):{start:number;end:number;offset:number};

export function seekPlayback(mode:'full'|'selection'|'generated',durationUs:number,region:Selection,seconds:number,preview?:{duration_us?:number;start_ms?:number}|null):{mode:'full'|'selection'|'generated';time:number};
