// Advisory, credential-free PCM WAV estimate. Never an admission or validation
// verdict. Bounded to 20 seconds / 8 MiB; unsupported or ambiguous audio stays manual.
export function estimatePulse(energy,rate=100){
 if(energy.length<600)return {reason:'Recording too short for a reliable BPM estimate. Enter BPM manually.'};
 const onset=energy.map((v,i)=>Math.max(0,v-(energy[i-1]||0))),power=onset.reduce((n,v)=>n+v*v,0),peak=Math.max(...onset);
 if(peak<Math.sqrt(energy.reduce((n,v)=>n+v*v,0)/energy.length)*.15||power<1e-9||onset.filter(v=>v>peak*.35).length<6)return {reason:'No reliable beat detected. Enter BPM manually.'};
 const scores=[];for(let lag=Math.ceil(rate*60/220);lag<=Math.floor(rate*60/40);lag++){let sum=0,a=0,b=0;for(let i=lag;i<onset.length;i++){sum+=onset[i]*onset[i-lag];a+=onset[i]**2;b+=onset[i-lag]**2;}scores.push({bpm:Math.round(rate*60/lag),score:sum/Math.sqrt(a*b||1)});}
 scores.sort((a,b)=>b.score-a.score||Math.abs(a.bpm-120)-Math.abs(b.bpm-120));const best=scores.filter(s=>s.score>=scores[0].score*.98).sort((a,b)=>Math.abs(a.bpm-120)-Math.abs(b.bpm-120))[0];
 if(best.score<.45)return {reason:'Beat confidence is low. Enter BPM manually.'};
 const alternatives=[best.bpm/2,best.bpm*2].map(Math.round).filter(v=>v>=40&&v<=220);
 return {bpm:best.bpm,alternatives,confidence:best.score};
}
export async function localTempo(file){
 const started=performance.now();if(file.size<44||file.size>150000000)return {reason:'BPM estimate unavailable. Enter BPM manually.'};
 const read=async(at,n)=>{if(performance.now()-started>2500||at<0||n>8388608||at+n>file.size)throw Error('TEMPO_BOUND');return new DataView(await file.slice(at,at+n).arrayBuffer());};
 const str=(v,o,n)=>String.fromCharCode(...new Uint8Array(v.buffer,v.byteOffset+o,n));const h=await read(0,12);
 if(str(h,0,4)!=='RIFF'||str(h,8,4)!=='WAVE')return {reason:'On-device BPM estimation supports PCM WAV. Enter BPM manually for this format.'};
 let f,data;for(let at=12,n=0;at+8<=file.size&&n<128;n++){const c=await read(at,8),size=c.getUint32(4,true),kind=str(c,0,4),body=at+8;if(body+size>file.size)throw Error('TEMPO_FORMAT');if(kind==='fmt '&&size>=16){const v=await read(body,Math.min(size,40));let codec=v.getUint16(0,true);if(codec===65534&&size>=40)codec=v.getUint16(24,true);f={codec,channels:v.getUint16(2,true),rate:v.getUint32(4,true),bits:v.getUint16(14,true),align:v.getUint16(12,true)};}if(kind==='data')data={at:body,size};if(f&&data)break;at=body+size+(size%2);}
 if(!f||!data||![1,3].includes(f.codec)||![1,2].includes(f.channels)||![16,24,32].includes(f.bits)||f.codec===3&&f.bits!==32||f.rate<8000||f.rate>192000||f.align!==f.channels*f.bits/8)throw Error('TEMPO_FORMAT');
 const frames=Math.floor(Math.min(data.size,8388608,20*f.rate*f.align)/f.align),v=await read(data.at,frames*f.align),bin=Math.round(f.rate/100),energy=[];
 for(let start=0;start<frames;start+=bin){let sum=0,count=0;for(let i=start;i<Math.min(frames,start+bin);i+=8){let peak=0;for(let c=0;c<f.channels;c++){let at=i*f.align+c*f.bits/8,x;if(f.codec===3)x=v.getFloat32(at,true);else if(f.bits===16)x=v.getInt16(at,true)/32768;else if(f.bits===32)x=v.getInt32(at,true)/2147483648;else{let k=v.getUint8(at)|v.getUint8(at+1)<<8|v.getUint8(at+2)<<16;if(k&8388608)k-=16777216;x=k/8388608;}if(!Number.isFinite(x))throw Error('TEMPO_FORMAT');peak=Math.max(peak,Math.abs(x));}sum+=peak*peak;count++;}energy.push(Math.sqrt(sum/Math.max(1,count)));}
 return {...estimatePulse(energy,f.rate/bin),readBytes:v.byteLength+12,elapsedMs:performance.now()-started};
}
