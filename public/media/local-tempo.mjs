// Advisory, credential-free PCM WAV estimate. Never an admission or validation
// verdict. Bounded to 20 seconds / 8 MiB; unsupported or ambiguous audio stays manual.
export function estimatePulse(energy,rate=100){
 if(energy.length<600)return {reason:'Recording too short for a reliable BPM estimate. Enter BPM manually.'};
 if(energy.some(v=>!Number.isFinite(v)||v<0))return {reason:'Audio could not be analyzed safely. Enter BPM manually.'};
 // Positive amplitude changes, whitened against a rolling local baseline, keep
 // compressed passages useful without confusing sustained volume with beats.
 const onset=energy.map((v,i)=>i?Math.max(0,v-energy[i-1]):0);
 const power=onset.reduce((n,v)=>n+v*v,0),peak=Math.max(...onset);
 if(peak<Math.sqrt(energy.reduce((n,v)=>n+v*v,0)/energy.length)*.015||power<1e-9||onset.filter(v=>v>peak*.25).length<6)return {reason:'No reliable beat detected. Enter BPM manually.'};
 const novelty=onset.map((v,i)=>{let local=0;for(let j=Math.max(0,i-25);j<Math.min(onset.length,i+26);j++)local+=onset[j];return v/Math.max(peak*.08,local/Math.min(51,onset.length));});
 const mean=novelty.reduce((a,b)=>a+b,0)/novelty.length,centered=novelty.map(v=>v-mean);
 const scores=[];for(let lag=Math.ceil(rate*60/220);lag<=Math.floor(rate*60/40);lag++){let sum=0,a=0,b=0;for(let i=lag;i<centered.length;i++){sum+=centered[i]*centered[i-lag];a+=centered[i]**2;b+=centered[i-lag]**2;}scores.push({bpm:Math.round(rate*60/lag),score:sum/Math.sqrt(a*b||1)});}
 const baseline=[...scores].sort((a,b)=>a.score-b.score)[Math.floor(scores.length/2)].score;
 scores.sort((a,b)=>b.score-a.score||Math.abs(a.bpm-120)-Math.abs(b.bpm-120));const best=scores.filter(s=>s.score>=scores[0].score*.98).sort((a,b)=>Math.abs(a.bpm-120)-Math.abs(b.bpm-120))[0];
 if(best.score<.2||best.score-baseline<.15)return {reason:'The sampled rhythm is ambiguous. Enter BPM manually.'};
 const alternatives=[best.bpm/2,best.bpm*2].map(Math.round).filter(v=>v>=40&&v<=220);
 return {bpm:best.bpm,alternatives,confidence:best.score,confidenceLabel:best.score>=.45?'supported':'low',reason:best.score<.45?'Low-confidence tempo estimate; confirm by listening or enter your own BPM.':undefined};
}
// Heuristic suggestions use only measured amplitude and confident pulse evidence.
// They are optional editorial prompts, never automatic classifications.
export function suggestAudioMoods(energy,pulse){
 if(energy.length<600||energy.some(v=>!Number.isFinite(v)||v<0))return [];
 const ordered=[...energy].sort((a,b)=>a-b),rms=Math.sqrt(energy.reduce((s,v)=>s+v*v,0)/energy.length);
 if(rms<.001)return [];
 const dynamics=20*Math.log10(Math.max(.00001,ordered[Math.floor(ordered.length*.95)])/Math.max(.00001,ordered[Math.floor(ordered.length*.2)]));
 const suggested=[];
 if(pulse.bpm>=110&&pulse.confidence>=.45&&rms>=.1)suggested.push('Energetic');
 if(pulse.bpm>=125&&pulse.confidence>=.6)suggested.push('Driving');
 if(pulse.bpm&&pulse.bpm<=100&&rms<.06)suggested.push('Calm');
 if(dynamics>=16&&rms>=.03)suggested.push('Dramatic');
 return suggested.sort();
}
export async function localTempo(file){
 const started=performance.now();if(file.size<44||file.size>150000000)return {reason:'BPM estimate unavailable. Enter BPM manually.'};
 const read=async(at,n)=>{if(performance.now()-started>2500||at<0||n>8388608||at+n>file.size)throw Error('TEMPO_BOUND');return new DataView(await file.slice(at,at+n).arrayBuffer());};
 const str=(v,o,n)=>String.fromCharCode(...new Uint8Array(v.buffer,v.byteOffset+o,n));const h=await read(0,12);
 if(str(h,0,4)!=='RIFF'||str(h,8,4)!=='WAVE')return {reason:'On-device BPM estimation supports PCM WAV. Enter BPM manually for this format.'};
 let f,data;for(let at=12,n=0;at+8<=file.size&&n<128;n++){const c=await read(at,8),size=c.getUint32(4,true),kind=str(c,0,4),body=at+8;if(body+size>file.size)throw Error('TEMPO_FORMAT');if(kind==='fmt '&&size>=16){const v=await read(body,Math.min(size,40));let codec=v.getUint16(0,true);if(codec===65534&&size>=40)codec=v.getUint16(24,true);f={codec,channels:v.getUint16(2,true),rate:v.getUint32(4,true),bits:v.getUint16(14,true),align:v.getUint16(12,true)};}if(kind==='data')data={at:body,size};if(f&&data)break;at=body+size+(size%2);}
 if(!f||!data||![1,3].includes(f.codec)||![1,2].includes(f.channels)||![16,24,32].includes(f.bits)||f.codec===3&&f.bits!==32||f.rate<8000||f.rate>192000||f.align!==f.channels*f.bits/8)throw Error('TEMPO_FORMAT');
 // Two independent windows avoid making an unrepresentative intro the only
 // evidence. Never concatenate discontinuous windows into a fabricated rhythm.
 const totalFrames=Math.floor(data.size/f.align),frames=Math.floor(Math.min(totalFrames/2,4194304/f.align,10*f.rate)),bin=Math.round(f.rate/100),windows=[],readings=[];let readBytes=12;
 for(const offset of [0,Math.max(0,Math.floor(totalFrames*.55)-Math.floor(frames/2))]){
  const v=await read(data.at+offset*f.align,frames*f.align),energy=[];readBytes+=v.byteLength;
  for(let start=0;start<frames;start+=bin){let sum=0,count=0;for(let i=start;i<Math.min(frames,start+bin);i+=8){let peak=0;for(let c=0;c<f.channels;c++){let at=i*f.align+c*f.bits/8,x;if(f.codec===3)x=v.getFloat32(at,true);else if(f.bits===16)x=v.getInt16(at,true)/32768;else if(f.bits===32)x=v.getInt32(at,true)/2147483648;else{let k=v.getUint8(at)|v.getUint8(at+1)<<8|v.getUint8(at+2)<<16;if(k&8388608)k-=16777216;x=k/8388608;}if(!Number.isFinite(x))throw Error('TEMPO_FORMAT');peak=Math.max(peak,Math.abs(x));}sum+=peak*peak;count++;}energy.push(Math.sqrt(sum/Math.max(1,count)));}
  windows.push(energy);readings.push(estimatePulse(energy,f.rate/bin));
 }
 const supported=readings.filter(r=>r.bpm).sort((a,b)=>b.confidence-a.confidence);let pulse=supported[0]||readings[0];
 if(supported.length===2){const [a,b]=supported,ratio=a.bpm/b.bpm;const compatible=[.5,1,2].some(r=>Math.abs(ratio-r)<r*.06);if(!compatible)pulse={alternatives:[a.bpm,b.bpm],reason:'Different sampled passages suggest different tempos. Choose a candidate or enter BPM manually.',confidenceLabel:'ambiguous'};}
 return {...pulse,moods:suggestAudioMoods(windows.flat(),pulse),durationUs:Math.round(data.size/f.align/f.rate*1e6),sampleRate:f.rate,channels:f.channels,bits:f.bits,readBytes,elapsedMs:performance.now()-started};
}
