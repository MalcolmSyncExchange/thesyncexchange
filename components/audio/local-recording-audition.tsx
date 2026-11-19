'use client';
import {useCallback,useEffect,useId,useMemo,useRef,useState,type PointerEvent,type KeyboardEvent} from 'react';
import {previewSelection,selectionFromDrag} from '@/lib/media/preview-selection.mjs';
import {waveformBarGeometry, waveformBars,type Envelope} from '@/lib/media/waveform.mjs';
import styles from './waveform-player.module.css';
const stamp=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
// Unvalidated local audition only. A Blob URL never leaves this browser; none
// of this evidence authorizes processing, publication or preview acceptance.
export function LocalRecordingAudition({file,envelope,startMs,onSelection,transferPercent=null,processingActive=false,onPosition}:{file:File;envelope:Envelope;startMs:number;onSelection:(start:number)=>void;transferPercent?:number|null;processingActive?:boolean;onPosition?:(seconds:number)=>void}){
 const clip=useId().replace(/:/g,'');
 const [columns,setColumns]=useState(120);
 const duration=envelope.duration_us/1e6,region=previewSelection(envelope.duration_us,startMs),bars=useMemo(()=>waveformBars(envelope,columns),[envelope,columns]);
 const audio=useRef<HTMLAudioElement>(null),wave=useRef<HTMLDivElement>(null),drag=useRef<{pointer:number;x:number;start:number;width:number}|null>(null),seekPointer=useRef<number|null>(null);
 const [position,setPosition]=useState(0),[playing,setPlaying]=useState(false),[error,setError]=useState(''),[volume,setVolume]=useState(.72),[mode,setMode]=useState<'full'|'selection'>('full');
 useEffect(()=>{const element=wave.current;if(!element)return;const resize=new ResizeObserver(entries=>setColumns(Math.max(12,Math.min(240,Math.floor(entries[0].contentRect.width/6)))));resize.observe(element);return()=>resize.disconnect();},[]);
 const request=useRef(0);
 const bounds=useRef({start:0,end:duration}),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const stop=useCallback(()=>{++request.current;audio.current?.pause();if(timer.current)clearTimeout(timer.current);},[]);
 const update=useCallback(()=>{const a=audio.current;if(!a)return;if(a.currentTime>=bounds.current.end){a.pause();if(a.currentTime>bounds.current.end)a.currentTime=bounds.current.end;}setPosition(a.currentTime);},[]);
 function schedule(){if(timer.current)clearTimeout(timer.current);const a=audio.current;if(a&&!a.paused)timer.current=setTimeout(()=>{a.pause();a.currentTime=bounds.current.end;update();},Math.max(0,(bounds.current.end-a.currentTime)*1000));}
 useEffect(()=>{const a=audio.current;if(!a||file.size>150000000)return;const url=URL.createObjectURL(file);a.src=url;a.load();return()=>{onPosition?.(a.currentTime);stop();a.removeAttribute('src');a.load();URL.revokeObjectURL(url);};},[file,stop,onPosition]);
 useEffect(()=>{if(audio.current)audio.current.volume=volume;},[volume]);
 useEffect(()=>{if(!playing||matchMedia('(prefers-reduced-motion: reduce)').matches)return;let id=0;const tick=()=>{update();id=requestAnimationFrame(tick);};id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);},[playing,update]);
 useEffect(()=>{const hide=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide);},[stop]);
 async function play(next:'full'|'selection'){
  const a=audio.current;if(!a)return;if(playing&&mode===next){stop();return;}stop();const token=++request.current;setError('');setMode(next);
  bounds.current=next==='selection'?{start:region.startMs/1000,end:duration<30?duration:region.endMs/1000}:{start:0,end:duration};
  a.currentTime=next==='selection'?bounds.current.start:a.currentTime>=duration?0:a.currentTime;
  try{await a.play();if(token===request.current)schedule();}catch{if(token===request.current)setError('Local playback is unavailable for this format or device. Upload remains available; the server-generated AAC is separate.');}
 }
 function seek(at:number){const a=audio.current;if(!a)return;at=Math.max(0,Math.min(duration,at));if(at<bounds.current.start||at>=bounds.current.end){bounds.current={start:0,end:duration};setMode('full');}a.currentTime=at;update();schedule();}
 function seekAt(e:PointerEvent<HTMLDivElement>){const r=e.currentTarget.getBoundingClientRect();if(r.width)seek((e.clientX-r.left)/r.width*duration);}
 function timelineKey(e:KeyboardEvent<HTMLDivElement>){if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();seek(e.key==='Home'?0:e.key==='End'?duration:position+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?10:1));}
 function change(start:number){stop();onSelection(previewSelection(envelope.duration_us,start).startMs);}
 function regionKey(e:KeyboardEvent<HTMLDivElement>){if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();change(e.key==='Home'?0:e.key==='End'?region.maxStartMs:region.startMs+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1000:100));}
 function end(e:PointerEvent<HTMLDivElement>){if(drag.current?.pointer===e.pointerId)drag.current=null;if(seekPointer.current===e.pointerId)seekPointer.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
 return <div aria-label="Local recording audition">
  <audio ref={audio} preload="metadata" aria-label="Local recording playback" onPlaying={()=>{setPlaying(true);schedule();}} onPause={()=>{setPlaying(false);onPosition?.(audio.current?.currentTime||0);if(timer.current)clearTimeout(timer.current);}} onTimeUpdate={update} onSeeking={()=>{update();schedule();}} onEnded={()=>{setPlaying(false);update();}} onError={()=>{stop();setError('This browser cannot audition this local format. You can still upload it for secure processing.');}}/>
  <div ref={wave} className={styles.recordingTimeline} role="group" aria-label="Local waveform timeline" onPointerDown={e=>{if((e.target as Element).closest('[data-preview-handle]'))return;seekPointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);seekAt(e);}} onPointerMove={e=>{if(seekPointer.current===e.pointerId)seekAt(e);}} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={()=>{seekPointer.current=null;}}>
   <div className={styles.waveformSeek} role="slider" tabIndex={0} aria-label="Local recording playback position" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={position} onKeyDown={timelineKey}/>
   <div className={styles.wave+(processingActive?" "+styles.processingWave:"")}><svg viewBox="0 0 1000 160" preserveAspectRatio="none" role="img" aria-label="Preliminary waveform sampled from your recording"><defs><clipPath id={clip}><rect x="0" y="0" width={transferPercent===null?1000:Math.max(0,Math.min(100,transferPercent))*10} height="160"/></clipPath><g id={clip+"-bars"}>{bars.heights.map((h,i)=><rect key={i} x={(i+.18)*1000/bars.heights.length} y={waveformBarGeometry(h).y} width={.64*1000/bars.heights.length} height={waveformBarGeometry(h).height} rx="3"/>)}</g></defs><use href={"#"+clip+"-bars"} className={styles.unplayed}/><use href={"#"+clip+"-bars"} className={styles.played} clipPath={"url(#"+clip+")"}/></svg></div>
   <div data-preview-region className={styles.selectionOverlay} role="slider" tabIndex={0} aria-label="Local preview region start" aria-valuemin={0} aria-valuemax={region.maxStartMs/1000} aria-valuenow={region.startMs/1000} onKeyDown={regionKey} style={{left:`${region.startMs/1000/duration*100}%`,width:`${Math.min(30,duration)/duration*100}%`}} onPointerDown={e=>{e.stopPropagation();stop();const r=wave.current?.getBoundingClientRect();if(!r?.width)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={pointer:e.pointerId,x:e.clientX,start:region.startMs,width:r.width};}} onPointerMove={e=>{const d=drag.current;if(d?.pointer===e.pointerId)change(selectionFromDrag(envelope.duration_us,d.start,e.clientX-d.x,d.width).startMs);}} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={()=>{drag.current=null;}}><div data-preview-handle className={styles.selectionHandle} title="Drag to move Public Preview"/><div data-preview-handle className={styles.selectionHandle} title="Drag to move Public Preview"/></div>
   <small className={styles.selectionTimes}>{stamp(region.startMs/1000)} – {stamp(duration<30?duration:region.endMs/1000)}</small><div className={styles.recordingPlayhead} style={{left:`${position/duration*100}%`}} aria-hidden="true"/>
  </div>
  {transferPercent!==null?<div className="sr-only" role="progressbar" aria-label="File transfer progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={transferPercent}/>:null}
  <div className={styles.controls}><button type="button" className={styles.modeButton} onClick={()=>void play('full')}>{playing&&mode==='full'?'Pause Full Track':'Play Full Track'}</button><button type="button" className={styles.modeButton} onClick={()=>void play('selection')}>{playing&&mode==='selection'?'Pause Public Preview':'Play Public Preview'}</button><p className={styles.time}>{stamp(position)} / {stamp(duration)}</p><label className={styles.sound}>Volume<input className={styles.volume} aria-label="Local recording volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label></div>
  <p className={styles.status}>On-device audition · final Public Preview follows secure processing.</p>{error?<p role="status" className={styles.status}>{error}</p>:null}
 </div>;
}
