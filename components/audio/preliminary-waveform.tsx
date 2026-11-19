"use client";
import {previewSelection} from '@/lib/media/preview-selection.mjs';
import {LocalRecordingAudition} from './local-recording-audition';
import {audioTrace} from '@/lib/media/audio-performance.mjs';
import {useEffect,useRef,useState} from 'react';
import {waveformBars,type Envelope} from '@/lib/media/waveform.mjs';
import styles from './waveform-player.module.css';
export function PreliminaryWaveform({file,startMs=0,onSelection=()=>{},transferPercent=null,processingActive=false,onReady}:{file:File|null;onReady?:(file:File)=>void;startMs?:number;onSelection?:(start:number)=>void;transferPercent?:number|null;processingActive?:boolean}){
 const [result,setResult]=useState<{file:File;envelope:Envelope;elapsedMs:number;readBytes:number}|null>(null),[unavailable,setUnavailable]=useState<File|null>(null),generation=useRef(0);
 useEffect(()=>{
  if(!file)return;const trace=audioTrace(file);const id=++generation.current,started=performance.now();let worker:Worker|undefined,live=true;
  const fail=()=>{clearTimeout(timer);if(live)setUnavailable(file);worker?.terminate();};
  const timer=setTimeout(fail,5000);
  try{worker=new Worker('/media/local-waveform-worker.mjs',{type:'module'});worker.onmessage=e=>{if(!live||e.data.id!==id)return;clearTimeout(timer);if(e.data.result){try{waveformBars(e.data.result.envelope);previewSelection(e.data.result.envelope.duration_us);trace.mark('waveform_ready');onReady?.(file);setResult({file,envelope:e.data.result.envelope,elapsedMs:performance.now()-started,readBytes:e.data.result.readBytes});}catch{fail();}}else fail();worker?.terminate();};worker.onerror=fail;worker.postMessage({id,file});}catch{fail();}
  return()=>{live=false;clearTimeout(timer);worker?.terminate();};
 },[file,onReady]);
 if(!file)return null;const bars=result?.file===file?waveformBars(result.envelope,120):null;
 return <div className="space-y-2" aria-label="Local recording visualization"><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">{file.name}</span><span className="text-accent">Preliminary · on your device</span></div>{bars&&result?<div data-analysis-ms={result.elapsedMs.toFixed(1)} data-sampled-bytes={result.readBytes}><LocalRecordingAudition file={file} envelope={result.envelope} startMs={startMs} onSelection={onSelection} transferPercent={transferPercent} processingActive={processingActive}/></div>:<div className={styles.wave}><span role="status" className={styles.waveStatus}>{unavailable===file?'Local audition is unavailable for this recording or device. You can still upload for secure validation; final assets require a supported recording.':'Reading a small audio sample on your device…'}</span></div>}<p className="text-xs text-muted-foreground">{bars?'Sampled audio overview, not a validated waveform. The final waveform replaces it after secure processing.':'Your original stays private. Browser visualization does not validate the recording.'}</p></div>;
}
