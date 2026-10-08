import { open, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
export async function tone(path,{seconds=30,rate=44100,channels=1,antiphase=false}={}) {
  const frames=Math.round(seconds*rate),bytes=frames*channels*2,h=Buffer.alloc(44);
  h.write('RIFF');h.writeUInt32LE(bytes+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(channels,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*channels*2,28);h.writeUInt16LE(channels*2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(bytes,40);
  const f=await open(path,'wx');try {await f.write(h);for(let start=0;start<frames;start+=4096) {const end=Math.min(frames,start+4096),b=Buffer.alloc((end-start)*channels*2);for(let frame=start;frame<end;frame++)for(let c=0;c<channels;c++)b.writeInt16LE(Math.round(Math.sin(frame*2*Math.PI*440/rate)*16000)*(antiphase&&c===1?-1:1),((frame-start)*channels+c)*2);await f.write(b);}}finally{await f.close();}
}
function crc32(b) {let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(name,data) {const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(name,4);data.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4);return b;}
export async function png(path,width=256,height=256,{animated=false}={}) {
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
  const raw=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++)raw.fill(128,y*(width*3+1)+1,(y+1)*(width*3+1));
  await writeFile(path,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),...(animated?[chunk('acTL',Buffer.alloc(8))]:[]),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
