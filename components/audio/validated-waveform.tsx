"use client";

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { masterEnvelope, parseWaveform, readWaveformResponse, waveformBarGeometry, waveformBars, type Envelope } from '@/lib/media/waveform.mjs';
import styles from './waveform-player.module.css';

type Region = {startSample:number;endSample:number;sampleRate:number;durationUs:number};
export function ValidatedWaveform({ url, format = 'preview', label = 'Preview waveform', progress = 0, region, showPlayhead = true, fallbackEnvelope }: {
  url:string;format?:'preview'|'master';label?:string;progress?:number;region?:Region;showPlayhead?:boolean;fallbackEnvelope?:Envelope;
}) {
  const [envelope,setEnvelope] = useState<Envelope|null>(null);
  const [failed,setFailed] = useState(false);
  const [columns,setColumns] = useState(100);
  const holder = useRef<HTMLDivElement>(null);
  const clip = useId().replace(/:/g,'');
  const start=region?.startSample,end=region?.endSample,rate=region?.sampleRate,us=region?.durationUs;
  useEffect(()=>{
    const element=holder.current;if(!element)return;
    const resize=new ResizeObserver(entries=>setColumns(Math.max(12,Math.min(240,Math.floor(entries[0].contentRect.width/6)))));
    resize.observe(element);return()=>resize.disconnect();
  },[]);
  useEffect(()=>{
    const controller=new AbortController();setEnvelope(null);setFailed(false);
    const deadline=setTimeout(()=>{setFailed(true);controller.abort();},15000);
    (async()=>{
      const endpoint=new URL(url,window.location.origin);
      if(endpoint.origin!==window.location.origin||endpoint.username||endpoint.password||endpoint.hash||
        !(format==='master'?/^\/api\/media\/[a-f0-9-]+\/[a-f0-9-]+$/.test(endpoint.pathname):/^\/api\/buyer\/preview\/[a-f0-9-]+$/.test(endpoint.pathname)))throw Error();
      const response=await fetch(endpoint,{signal:controller.signal,cache:'no-store',credentials:'same-origin',redirect:'error'});
      const bytes=await readWaveformResponse(response,format==='master'?360512:40000);
      const value:Envelope=format==='master'?masterEnvelope(parseWaveform(bytes),start!==undefined&&end!==undefined&&rate!==undefined&&us!==undefined?{startSample:start,endSample:end,sampleRate:rate,durationUs:us}:undefined):JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      waveformBars(value);if(!controller.signal.aborted)setEnvelope(value);
    })().catch(()=>{if(!controller.signal.aborted)setFailed(true);}).finally(()=>clearTimeout(deadline));
    return()=>{controller.abort();clearTimeout(deadline);};
  },[url,format,start,end,rate,us]);
  const bars=useMemo(()=>envelope||fallbackEnvelope?waveformBars(envelope||fallbackEnvelope!,columns):null,[envelope,fallbackEnvelope,columns]);
  const fraction=Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):0;
  return <div ref={holder} className={styles.wave}>
    {failed&&!bars?<span role="status">Waveform unavailable. Audio controls remain available.</span>:!bars?<span role="status" className={styles.waveStatus}>Loading waveform…</span>:<svg role="img" aria-label={!envelope&&fallbackEnvelope?'Preliminary waveform · final waveform loading':label} viewBox="0 0 1000 160" preserveAspectRatio="none" data-visual-gain={bars.gain.toFixed(3)}>
      <defs><clipPath id={clip}><rect width={fraction*1000} height="160"/></clipPath></defs>
      <g className={styles.unplayed}>{bars.heights.map((height,i)=><rect key={i} x={(i+.18)*1000/bars.heights.length} y={waveformBarGeometry(height).y} width={.64*1000/bars.heights.length} height={waveformBarGeometry(height).height} rx={Math.min(4,320/bars.heights.length)}/>)}</g>
      <g className={styles.played} clipPath={`url(#${clip})`}>{bars.heights.map((height,i)=><rect key={i} x={(i+.18)*1000/bars.heights.length} y={waveformBarGeometry(height).y} width={.64*1000/bars.heights.length} height={waveformBarGeometry(height).height} rx={Math.min(4,320/bars.heights.length)}/>)}</g>
      {showPlayhead?<line x1={fraction*1000} x2={fraction*1000} y1="6" y2="154" className={styles.playhead}/>:null}
    </svg>}
  </div>;
}
