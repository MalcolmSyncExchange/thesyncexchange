"use client";
import {useEffect,useRef,useState} from 'react';
import {LoaderCircle,Pause,Play,Volume2,VolumeX} from 'lucide-react';
import {ValidatedWaveform} from './validated-waveform';
import {seekTime} from '@/lib/media/waveform.mjs';
import styles from './waveform-player.module.css';
const clock=(n:number)=>`${Math.floor((Number.isFinite(n)?n:0)/60)}:${String(Math.floor((Number.isFinite(n)?n:0)%60)).padStart(2,'0')}`;
export function WaveformPlayer({src,waveformUrl,title='Generated preview',region}:{src:string;waveformUrl?:string;title?:string;region?:{startSample:number;endSample:number;sampleRate:number;durationUs:number}}){
 const audio=useRef<HTMLAudioElement>(null);
 const [playing,setPlaying]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[time,setTime]=useState(0),[duration,setDuration]=useState(0),[volume,setVolume]=useState(.72),[muted,setMuted]=useState(false);
 const request=useRef(0);
 useEffect(()=>{const a=audio.current;if(a){a.pause();a.load();}setTime(0);setDuration(0);setPlaying(false);setError('');setLoading(false);++request.current;return()=>{a?.pause();};},[src]);
 useEffect(()=>{if(audio.current){audio.current.volume=volume;audio.current.muted=muted;}},[volume,muted]);
 useEffect(()=>{
  if(!playing||typeof requestAnimationFrame!=='function'||(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches))return;
  let frame=0;const update=()=>{setTime(audio.current?.currentTime||0);frame=requestAnimationFrame(update);};frame=requestAnimationFrame(update);return()=>cancelAnimationFrame(frame);
 },[playing]);
 useEffect(()=>{if(!loading)return;const timer=setTimeout(()=>{++request.current;audio.current?.pause();setLoading(false);setError('Preview timed out. Try again.');},15000);return()=>clearTimeout(timer);},[loading]);
 async function toggle(){const a=audio.current;if(!a)return;if(!a.paused||loading){++request.current;a.pause();setLoading(false);return;}const token=++request.current;setError('');setLoading(true);try{await a.play();}catch{if(token===request.current){setError('Preview could not play. Try again.');setLoading(false);setPlaying(false);}}}
 function seek(value:number){const a=audio.current;if(!a)return;const next=seekTime(value,duration);a.currentTime=next;setTime(next);}
 return <section className={styles.player} aria-label={`${title} player`}>
  <div className={styles.heading}><div><p className={styles.eyebrow}>The Sync Exchange · Listening room</p><h3 className={styles.title}>{title}</h3></div><span className={styles.badge}>Private preview</span></div>
  <audio ref={audio} src={src} preload="none" aria-label={title} onPlaying={()=>{setPlaying(true);setLoading(false);}} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);setTime(audio.current?.duration||0);}} onWaiting={()=>setLoading(true)} onCanPlay={()=>setLoading(false)} onTimeUpdate={()=>setTime(audio.current?.currentTime||0)} onDurationChange={()=>{const n=audio.current?.duration;if(Number.isFinite(n))setDuration(Number(n));}} onError={()=>{setPlaying(false);setLoading(false);setError('Preview unavailable. Refresh the saved draft and try again.');}}/>
  <div className={styles.timeline}>
   {waveformUrl?<ValidatedWaveform url={waveformUrl} format="master" region={region} progress={duration?time/duration:0} label="Generated preview waveform"/>:<div className={styles.wave}><span className={styles.waveStatus}>Waveform unavailable. Audio controls remain available.</span></div>}
   <input className={styles.seek} type="range" min="0" max="1" step="0.001" value={duration?Math.min(1,time/duration):0} disabled={!duration} aria-label="Preview position" aria-valuetext={`${clock(time)} of ${clock(duration)}`} onChange={e=>seek(Number(e.target.value))}/>
  </div>
  <div className={styles.controls}>
   <button type="button" className={styles.play} onClick={()=>void toggle()} aria-label={playing?'Pause preview':error?'Retry preview':'Play preview'} aria-pressed={playing}>{loading?<LoaderCircle className={styles.spinner} aria-hidden/>:playing?<Pause aria-hidden/>:<Play aria-hidden/>}</button>
   <p className={styles.time}>{clock(time)} <span>/ {clock(duration)}</span></p>
   <div className={styles.sound}><button type="button" className={styles.mute} onClick={()=>setMuted(!muted)} aria-label={muted?'Unmute preview':'Mute preview'} aria-pressed={muted}>{muted||!volume?<VolumeX aria-hidden/>:<Volume2 aria-hidden/>}</button><input className={styles.volume} type="range" min="0" max="1" step="0.01" value={muted?0:volume} aria-label="Preview volume" onChange={e=>{setVolume(Number(e.target.value));setMuted(false);}}/></div>
  </div>
  {error?<p role="alert" className={styles.status}>{error}</p>:<p role="status" className={styles.status}>{loading?'Loading preview…':'Drag the waveform to seek · Arrow keys for precise seeking'}</p>}
 </section>;
}
