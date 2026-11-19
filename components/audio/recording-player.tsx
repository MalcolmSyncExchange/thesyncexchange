'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import type { ArtistMediaAsset } from '@/contracts/submission-media/profiles';
import { matchesSelection, playbackBounds, previewSelection, recordingSelection, selectionFromDrag, seekPlayback } from '@/lib/media/preview-selection.mjs';
import { privatePlaybackSession } from '@/lib/media/private-playback-session.mjs';
import { ValidatedWaveform } from './validated-waveform';
import styles from './waveform-player.module.css';

type Mode='full'|'selection'|'generated';
type Props={submission:string;source:ArtistMediaAsset;waveformUrl:string;selection:{start_ms:number|null;end_ms:number|null};preview?:ArtistMediaAsset;readOnly?:boolean;disabled?:boolean;processingPaused?:boolean;initialStartMs?:number;onSelectionDirty?:(dirty:boolean)=>void;onSave:(start:number,end:number)=>void;onGenerate:()=>void;onAccept:(asset:string)=>void};
const stamp=(seconds:number,precise=false)=>{const n=Number.isFinite(seconds)?Math.max(0,seconds):0;return `${Math.floor(n/60)}:${(precise?(n%60).toFixed(3):String(Math.floor(n%60))).padStart(precise?6:2,'0')}`;};

export function RecordingPlayer({submission,source,waveformUrl,selection,preview,readOnly=false,disabled=false,processingPaused=false,initialStartMs,onSelectionDirty,onSave,onGenerate,onAccept}:Props){
 const durationUs=source.duration_us!,duration=durationUs/1e6;
 const [start,setStart]=useState(()=>previewSelection(durationUs,initialStartMs??selection.start_ms??0).startMs);
 const [retainSaved,setRetainSaved]=useState(initialStartMs===undefined);
 const region=useMemo(()=>recordingSelection(durationUs,start,selection,retainSaved),[durationUs,start,retainSaved,selection]);
 const fullShort=durationUs<30_000_000&&region.startMs===0&&region.endMs===Math.floor(durationUs/1000);
 const legacyRegion=!fullShort&&region.endMs-region.startMs!==30000;
 const dirty=selection.start_ms!==region.startMs||selection.end_ms!==region.endMs;
 // Preserve the installed worker's 100ms contract. A fractional 15–30s full
 // recording can be auditioned completely, but must not queue a doomed job.
 const serverCompatible=durationUs<15_000_000||region.endMs%100===0;
 const currentPreview=preview?.state==='ready'&&matchesSelection(preview,source.id,region)&&!dirty?preview:null;
 const audio=useRef<HTMLAudioElement>(null),modeRef=useRef<Mode>('full'),boundsRef=useRef(playbackBounds('full',durationUs,region));
 const [mode,setMode]=useState<Mode>('full'),[playing,setPlaying]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[position,setPosition]=useState(0),[volume,setVolume]=useState(.72),[muted,setMuted]=useState(false),[heard,setHeard]=useState<string|null>(null);
 const session=useMemo(()=>privatePlaybackSession(submission,source.id),[submission,source.id]);
 const request=useRef(0),endTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const drag=useRef<{pointer:number;x:number;start:number;width:number}|null>(null),wave=useRef<HTMLDivElement>(null);
 const localOverride=useRef(initialStartMs===undefined?null:{start:selection.start_ms,end:selection.end_ms});
 const playbackKey=useRef(''),seekPointer=useRef<number|null>(null),positionRef=useRef(0);
 useEffect(()=>{onSelectionDirty?.(dirty&&!readOnly);return()=>onSelectionDirty?.(false);},[dirty,readOnly,onSelectionDirty]);
 function stop(){++request.current;audio.current?.pause();setLoading(false);if(endTimer.current)clearTimeout(endTimer.current);}
 const update=useCallback(()=>{const a=audio.current;if(!a)return;const b=boundsRef.current;if(a.currentTime>=b.end){a.pause();if(a.currentTime>b.end)a.currentTime=b.end;}positionRef.current=Math.max(0,Math.min(duration,a.currentTime+b.offset));setPosition(positionRef.current);},[duration]);
 function scheduleEnd(){if(endTimer.current)clearTimeout(endTimer.current);const a=audio.current;if(a&&!a.paused)endTimer.current=setTimeout(()=>{if(audio.current){audio.current.pause();audio.current.currentTime=boundsRef.current.end;update();}},Math.max(0,(boundsRef.current.end-a.currentTime)*1000));}
 useEffect(()=>{if(localOverride.current&&localOverride.current.start===selection.start_ms&&localOverride.current.end===selection.end_ms)return;localOverride.current=null;stop();playbackKey.current='';setRetainSaved(true);setStart(previewSelection(durationUs,selection.start_ms??0).startMs);},[durationUs,selection.start_ms,selection.end_ms]);
 useEffect(()=>{stop();playbackKey.current='';setHeard(null);},[preview?.id]);
 useEffect(()=>{session.activate();const element=audio.current,generation=request,deadline=endTimer,capability=session;return()=>{++generation.current;element?.pause();element?.removeAttribute('src');element?.load();capability.dispose();if(deadline.current)clearTimeout(deadline.current);};},[session]);
 useEffect(()=>{const target=wave.current;if(!target||typeof IntersectionObserver==='undefined')return;const observer=new IntersectionObserver(entries=>{if(document.visibilityState==='visible'&&entries.some(entry=>entry.isIntersecting)){session.warm();observer.disconnect();}},{threshold:.1});observer.observe(target);return()=>observer.disconnect();},[session]);
 useEffect(()=>{const hidden=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hidden);return()=>document.removeEventListener('visibilitychange',hidden);},[]);
 useEffect(()=>{if(!playing||matchMedia('(prefers-reduced-motion: reduce)').matches)return;let frame=0;const tick=()=>{update();frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[playing,update]);
 useEffect(()=>{if(audio.current){audio.current.volume=volume;audio.current.muted=muted;}},[volume,muted]);
 useEffect(()=>{if(!loading)return;const timer=setTimeout(()=>{stop();setError('Playback timed out. Try again.');},15000);return()=>clearTimeout(timer);},[loading]);
 function select(next:number){stop();playbackKey.current='';setRetainSaved(false);setStart(previewSelection(durationUs,next).startMs);setError('');}
 async function play(nextMode:Mode, seekTo?:number, continuePlaying=true){
  const a=audio.current;if(!a)return;
  if(seekTo===undefined&&modeRef.current===nextMode&&(!a.paused||loading)){stop();return;}
  const previousMode=modeRef.current;stop();const token=++request.current;modeRef.current=nextMode;setMode(nextMode);setError('');setLoading(true);
  try{
   let url:string;
   if(nextMode==='generated'){if(!currentPreview)throw Error();url=`/api/media/${submission}/${currentPreview.id}`;}
   else{
    url=await session.get();
   }
   if(token!==request.current)return;
   const b=playbackBounds(nextMode,durationUs,region,currentPreview);
   const key=nextMode==='full'?'full':nextMode==='generated'?`generated:${currentPreview?.id}`:`selection:${region.startMs}:${region.endMs}`;
   const resume=playbackKey.current===key&&previousMode===nextMode&&a.currentTime>=b.start&&a.currentTime<b.end;
   const at=seekTo!==undefined?seekTo:resume?a.currentTime:nextMode==='full'?Math.min(positionRef.current,duration):b.start;
   modeRef.current=nextMode;playbackKey.current=key;setMode(nextMode);boundsRef.current=b;
   if(a.getAttribute('src')!==url){a.src=url;a.load();}
   a.currentTime=seekTo===undefined&&at>=b.end?b.start:at;positionRef.current=a.currentTime+b.offset;setPosition(positionRef.current);
   if(!continuePlaying){setPlaying(false);setLoading(false);return;}
   await a.play();if(token!==request.current)return;if(nextMode==='generated'&&currentPreview)setHeard(currentPreview.id);
   scheduleEnd();
  }catch{if(token===request.current){a.pause();setPlaying(false);setLoading(false);session.clear();setError('Playback unavailable. Your browser may not support this original format, or access expired. Try again; generated AAC remains separate.');}}
 }
 function seek(seconds:number){
  const a=audio.current;if(!a)return;
  const plan=seekPlayback(modeRef.current,durationUs,region,seconds,currentPreview);
  if(plan.mode==='full'&&(modeRef.current==='generated'||loading&&playbackKey.current.startsWith('generated:'))){void play('full',plan.time,!a.paused||loading);return;}
  if(plan.mode!==modeRef.current){
   // Selection audition already uses the master URL; switch bounds before
   // seeking so timeupdate/seeking cannot clamp back into the preview.
   ++request.current;setLoading(false);modeRef.current='full';setMode('full');playbackKey.current='full';
   boundsRef.current=playbackBounds('full',durationUs,region);
  }
  a.currentTime=plan.time;update();scheduleEnd();
 }
 function pointerDown(e:PointerEvent<HTMLDivElement>){if(readOnly||disabled)return;const rect=wave.current?.getBoundingClientRect();if(!rect?.width)return;stop();playbackKey.current='';e.currentTarget.setPointerCapture(e.pointerId);drag.current={pointer:e.pointerId,x:e.clientX,start:region.startMs,width:rect.width};}
 function pointerMove(e:PointerEvent<HTMLDivElement>){const d=drag.current;if(!d||d.pointer!==e.pointerId)return;setRetainSaved(false);setStart(selectionFromDrag(durationUs,d.start,e.clientX-d.x,d.width).startMs);}
 function pointerEnd(e:PointerEvent<HTMLDivElement>){if(drag.current?.pointer===e.pointerId){drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
 function seekAt(e:PointerEvent<HTMLDivElement>){const r=e.currentTarget.getBoundingClientRect();if(r.width)seek(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*duration);}
 function seekDown(e:PointerEvent<HTMLDivElement>){if((e.target as Element).closest('[data-preview-region]'))return;seekPointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);seekAt(e);}
 function seekEnd(e:PointerEvent<HTMLDivElement>){if(seekPointer.current===e.pointerId){seekPointer.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
 function timelineKey(e:React.KeyboardEvent<HTMLDivElement>){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
  seek(e.key==='Home'?0:e.key==='End'?duration:positionRef.current+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?10:1));
 }
 function regionKey(e:React.KeyboardEvent<HTMLDivElement>){
  if(readOnly||disabled||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();
  select(e.key==='Home'?0:e.key==='End'?region.maxStartMs:region.startMs+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1000:100));
 }
 const active=(m:Mode)=>mode===m&&(playing||loading);
 return <section className={styles.player} aria-label="Full recording and preview selection">
  <div className={styles.heading}><div><p className={styles.eyebrow}>The Sync Exchange · Listening room</p><h3 className={styles.title}>Your recording</h3></div><span className={styles.badge}>Private master</span></div>
  <audio ref={audio} crossOrigin="anonymous" preload="none" aria-label="Private recording playback" onPlaying={()=>{setPlaying(true);setLoading(false);scheduleEnd();}} onPause={()=>{setPlaying(false);if(endTimer.current)clearTimeout(endTimer.current);}} onEnded={()=>{setPlaying(false);update();}} onTimeUpdate={update} onSeeking={()=>{update();scheduleEnd();}} onWaiting={()=>{if(!audio.current?.paused)setLoading(true);}} onCanPlay={()=>setLoading(false)} onError={()=>{stop();setPlaying(false);session.clear();setError('Audio unavailable. Retry playback or use the generated AAC preview when ready.');}}/>
  <div ref={wave} className={styles.recordingTimeline} role="group" aria-label="Waveform timeline" onPointerDown={seekDown} onPointerMove={e=>{if(seekPointer.current===e.pointerId)seekAt(e);}} onPointerUp={seekEnd} onPointerCancel={seekEnd} onLostPointerCapture={()=>{seekPointer.current=null;}}>
   <div className={styles.waveformSeek} role="slider" tabIndex={0} aria-label="Recording playback position" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={position} aria-valuetext={`${stamp(position)} of ${stamp(duration)}`} onKeyDown={timelineKey}/>
   <ValidatedWaveform url={waveformUrl} format="master" label="Full recording waveform" progress={position/duration} showPlayhead={false}/>
   <div data-preview-region className={styles.selectionOverlay} role="slider" tabIndex={readOnly||disabled?-1:0} aria-label="Preview region start" aria-disabled={readOnly||disabled} aria-valuemin={0} aria-valuemax={region.maxStartMs/1000} aria-valuenow={region.startMs/1000} aria-valuetext={`${stamp(region.startMs/1000,true)} to ${stamp(fullShort?duration:region.endMs/1000,true)}`} onKeyDown={regionKey} style={{left:`${region.startMs/1000/duration*100}%`,width:`${(fullShort?duration:(region.endMs-region.startMs)/1000)/duration*100}%`,cursor:readOnly||disabled?'default':undefined}} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={()=>{drag.current=null;}}><span/><span/></div>
   <small className={styles.selectionTimes} style={{left:`clamp(0px, ${region.startMs/1000/duration*100}%, calc(100% - 145px))`}}>{stamp(region.startMs/1000,true)} – {stamp(fullShort?duration:region.endMs/1000,true)}</small>
   <div className={styles.recordingPlayhead} style={{left:`${position/duration*100}%`}} aria-hidden="true"/>
  </div>
  <div className={styles.controls}>
   <button type="button" className={styles.modeButton} disabled={loading&&!active('full')} aria-pressed={active('full')} onPointerEnter={session.warm} onFocus={session.warm} onClick={()=>void play('full')}>{active('full')?<Pause aria-hidden/>:<Play aria-hidden/>}{active('full')?'Pause Full Track':'Play Full Track'}</button>
   <button type="button" className={styles.modeButton} disabled={loading&&!active('selection')} aria-pressed={active('selection')} onPointerEnter={session.warm} onFocus={session.warm} onClick={()=>void play('selection')}>{active('selection')?<Pause aria-hidden/>:<Play aria-hidden/>}{active('selection')?'Pause Preview':'Play Preview'}</button>
   <p className={styles.time}>{stamp(position)} <span>/ {stamp(duration)}</span></p>
   <div className={styles.sound}><button type="button" className={styles.mute} aria-label={muted?'Unmute recording':'Mute recording'} onClick={()=>setMuted(!muted)}>{muted?<VolumeX aria-hidden/>:<Volume2 aria-hidden/>}</button><input className={styles.volume} aria-label="Recording volume" type="range" min="0" max="1" step="0.01" value={muted?0:volume} onChange={e=>{setMuted(false);setVolume(Number(e.target.value));}}/></div>
  </div>
  <p role="status" className={styles.status}>{loading?'Loading private audio…':mode==='generated'?'Generated AAC mode · positioned on the full recording':mode==='selection'?'Selection audition · original audio, not the generated AAC':'Full-track playback · private to you and authorized reviewers'}</p>
  {error?<p role="alert" className={styles.status}>{error}</p>:null}
  <div className={styles.regionControls}>
   <div className={styles.regionHeading}><strong>{readOnly||legacyRegion?'Saved preview region':fullShort?'Full short recording':'30-second preview region'}</strong></div>
   {!readOnly?<>{legacyRegion?<button type="button" className={styles.modeButton} disabled={disabled} onClick={()=>select(region.startMs)}>{duration<30?'Use the full short recording':'Use a 30-second preview'}</button>:null}<p className={styles.status}>Drag the highlighted region. Arrow keys adjust the focused region; Shift moves faster. Focus the waveform to seek.</p>
   {!serverCompatible?<p role="status" className={styles.status}>This short recording can play in full. Exact full-length AAC generation needs a worker precision update; no shortened selection will be substituted.</p>:null}
   <div className={styles.actions}><button type="button" className={styles.modeButton} disabled={disabled||!dirty||!serverCompatible} onClick={()=>{stop();onSave(region.startMs,region.endMs);}}>Save preview selection</button>{dirty?<button type="button" className={styles.modeButton} disabled={disabled} onClick={()=>{stop();setRetainSaved(true);setStart(previewSelection(durationUs,selection.start_ms??0).startMs);}}>Reset selection</button>:null}<button type="button" className={styles.modeButton} disabled={disabled||dirty||!serverCompatible||!!currentPreview||!!preview&&!['ready','failed','expired'].includes(preview.state)} onClick={()=>{stop();onGenerate();}}>Generate AAC preview</button></div></>:null}
   {dirty?<p role="status" className={styles.status}>Selection changed. The previous generated preview is no longer current. Save this selection, then generate a new AAC preview.</p>:!currentPreview?<p role="status" className={styles.status}>{processingPaused?'Selection saved. AAC generation is pending while secure processing is paused.':'Save your selection and generate the AAC preview before accepting it.'}</p>:<div className={styles.generated}>
    <p>{currentPreview.accepted?'Generated preview accepted':'Generated AAC ready · listen before accepting'}</p>
    <button type="button" className={styles.modeButton} disabled={loading&&!active('generated')} aria-pressed={active('generated')} onClick={()=>void play('generated')}>{active('generated')?'Pause Generated AAC':'Play Generated AAC'}</button>
    {!readOnly&&!currentPreview.accepted?<button type="button" className={styles.modeButton} disabled={disabled||heard!==currentPreview.id} onClick={()=>{stop();onAccept(currentPreview.id);}}>Accept Generated Preview</button>:null}
   </div>}
  </div>
 </section>;
}
