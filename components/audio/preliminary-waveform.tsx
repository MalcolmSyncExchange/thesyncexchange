"use client";
import {useEffect,useRef,useState} from 'react';
import {waveformBars,type Envelope} from '@/lib/media/waveform.mjs';
import styles from './waveform-player.module.css';
export function PreliminaryWaveform({file}:{file:File|null}){
 const [result,setResult]=useState<{file:File;envelope:Envelope;elapsedMs:number;readBytes:number}|null>(null),[unavailable,setUnavailable]=useState<File|null>(null),generation=useRef(0);
 useEffect(()=>{
  if(!file)return;const id=++generation.current,started=performance.now();let worker:Worker|undefined,live=true;
  const fail=()=>{clearTimeout(timer);if(live)setUnavailable(file);worker?.terminate();};
  const timer=setTimeout(fail,5000);
  try{worker=new Worker('/media/local-waveform-worker.mjs',{type:'module'});worker.onmessage=e=>{if(!live||e.data.id!==id)return;clearTimeout(timer);if(e.data.result){try{waveformBars(e.data.result.envelope);setResult({file,envelope:e.data.result.envelope,elapsedMs:performance.now()-started,readBytes:e.data.result.readBytes});}catch{fail();}}else fail();worker?.terminate();};worker.onerror=fail;worker.postMessage({id,file});}catch{fail();}
  return()=>{live=false;clearTimeout(timer);worker?.terminate();};
 },[file]);
 if(!file)return null;const bars=result?.file===file?waveformBars(result.envelope,120):null;
 return <div className="space-y-2" aria-label="Local recording visualization"><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">{file.name}</span><span className="text-accent">Preliminary · on your device</span></div><div className={styles.wave}>
 {bars?<svg viewBox="0 0 1000 160" preserveAspectRatio="none" role="img" aria-label="Preliminary waveform sampled from your recording" data-analysis-ms={result?.elapsedMs.toFixed(1)} data-sampled-bytes={result?.readBytes}><g className={styles.played}>{bars.heights.map((height,i)=><rect key={i} x={(i+.18)*1000/bars.heights.length} y={80-height*70} width={.64*1000/bars.heights.length} height={height*140} rx="3"/>)}</g></svg>:<span role="status" className={styles.waveStatus}>{unavailable===file?'Local visualization is unavailable for this format or device. You can still upload; the secure server will generate the final waveform.':'Reading a small audio sample on your device…'}</span>}
 </div><p className="text-xs text-muted-foreground">{bars?'Sampled audio overview, not a validated waveform. The final waveform replaces it after secure processing.':'Your original stays private. Browser visualization does not validate the recording.'}</p></div>;
}
