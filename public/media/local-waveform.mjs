// Local, sampled PCM visualization only. Never a security or upload verdict.
// At most 256 bins x four 128-frame windows: <=1 MiB PCM for stereo32.
const unavailable=()=>{throw Error('LOCAL_FORMAT_UNAVAILABLE');};
const text=(v,o,n)=>String.fromCharCode(...new Uint8Array(v.buffer,v.byteOffset+o,n));
export async function localWaveform(file,{columns=256,now=()=>performance.now(),timeoutMs=4000}={}){
 if(!Number.isSafeInteger(file.size)||file.size<44||file.size>150000000||!Number.isInteger(columns)||columns<8||columns>256)unavailable();
 const started=now();let reads=0,readBytes=0;
 const read=async(offset,size)=>{if(now()-started>timeoutMs||offset<0||size>8192||offset+size>file.size)unavailable();const bytes=await file.slice(offset,offset+size).arrayBuffer();readBytes+=bytes.byteLength;reads++;if(bytes.byteLength!==size)unavailable();return new DataView(bytes);};
 const first=await read(0,12),riff=text(first,0,4)==='RIFF'&&text(first,8,4)==='WAVE',aiff=text(first,0,4)==='FORM'&&['AIFF','AIFC'].includes(text(first,8,4));if(!riff&&!aiff)unavailable();
 const end=first.getUint32(4,riff)+8;if(end>file.size||end<44)unavailable();
 let format=null,data=null;
 for(let at=12,count=0;at+8<=end&&count<128;count++){
  const h=await read(at,8),kind=text(h,0,4),size=h.getUint32(4,riff),body=at+8;if(body+size>end)unavailable();
  if(riff&&kind==='fmt '){if(size<16)unavailable();const v=await read(body,Math.min(size,40));let codec=v.getUint16(0,true);if(codec===65534&&size>=40)codec=v.getUint16(24,true);format={channels:v.getUint16(2,true),rate:v.getUint32(4,true),bits:v.getUint16(14,true),align:v.getUint16(12,true),float:codec===3,little:true,unsigned:true};if(![1,3].includes(codec))unavailable();}
  if(aiff&&kind==='COMM'){
   if(size<18)unavailable();const v=await read(body,Math.min(size,22)),exponent=v.getUint16(8,false),significand=v.getUint32(10,false)*4294967296+v.getUint32(14,false),rate=significand*2**(exponent-16383-63),codec=text(first,8,4)==='AIFC'?(size>=22?text(v,18,4):'invalid'):'NONE';
   if(!['NONE','twos','sowt'].includes(codec))unavailable();format={channels:v.getUint16(0,false),rate,bits:v.getUint16(6,false),frames:v.getUint32(2,false),little:codec==='sowt',float:false,unsigned:false};
  }
  if(riff&&kind==='data')data={offset:body,bytes:size};
  if(aiff&&kind==='SSND'){if(size<8)unavailable();const v=await read(body,8),offset=v.getUint32(0,false);if(offset>size-8)unavailable();data={offset:body+8+offset,bytes:size-8-offset};}
  if(format&&data)break;at=body+size+(size%2);
 }
 if(!format||!data)unavailable();const f=format,block=f.channels*f.bits/8;
 if(![1,2].includes(f.channels)||!Number.isInteger(f.rate)||f.rate<8000||f.rate>192000||![8,16,24,32].includes(f.bits)||f.float&&f.bits!==32||f.align!==undefined&&f.align!==block||data.bytes%block)unavailable();
 const frames=f.frames??data.bytes/block;if(frames<1||frames*block>data.bytes||frames/f.rate>900)unavailable();
 const points=[],levels=[];
 const sample=(v,offset)=>{
  if(f.float){const n=v.getFloat32(offset,true);return Number.isFinite(n)?Math.max(-1,Math.min(1,n)):0;}
  if(f.bits===8)return (f.unsigned?v.getUint8(offset)-128:v.getInt8(offset))/128;
  if(f.bits===16)return v.getInt16(offset,f.little)/32768;
  if(f.bits===32)return v.getInt32(offset,f.little)/2147483648;
  let n=f.little?v.getUint8(offset)|v.getUint8(offset+1)<<8|v.getUint8(offset+2)<<16:v.getUint8(offset)<<16|v.getUint8(offset+1)<<8|v.getUint8(offset+2);if(n&8388608)n-=16777216;return n/8388608;
 };
 for(let bin=0;bin<columns;bin++){
  const from=Math.floor(bin*frames/columns),to=Math.floor((bin+1)*frames/columns),length=Math.min(128,to-from),starts=new Set();let low=0,high=0,sum=0,count=0;
  for(let i=0;i<4&&length>0;i++)starts.add(from+Math.floor((to-from-length)*i/3));
  for(const start of starts){const v=await read(data.offset+start*block,length*block);for(let frame=0;frame<length;frame++){let peak=0;for(let channel=0;channel<f.channels;channel++){const value=sample(v,frame*block+channel*f.bits/8);low=Math.min(low,value);high=Math.max(high,value);peak=Math.max(peak,Math.abs(value));}sum+=peak;count++;}}
  const pair=[Math.max(-32768,Math.round(low*32767)),Math.min(32767,Math.round(high*32767))];points.push(pair);levels.push(Math.min(Math.max(Math.abs(pair[0]),Math.abs(pair[1])),Math.round(count?sum/count*32767:0)));
 }
 return {envelope:{encoding:'tse-preview-envelope-v1',duration_us:Math.round(frames/f.rate*1000000),points,levels},sampled:true,readBytes,reads,elapsedMs:now()-started};
}
