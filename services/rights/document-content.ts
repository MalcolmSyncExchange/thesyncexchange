import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
// Admission is not antivirus or proof of legal authority. No PDF engine, macro,
// JavaScript interpreter, remote resource fetch or inline original rendering.
export async function inspectRightsDocument(bytes:Uint8Array,type:string){
 if(bytes.length<16||bytes.length>3_000_000)throw Error('DOCUMENT_CONTENT_DENIED');
 const b=Buffer.from(bytes);
 if(type==='application/pdf'){
  const raw=b.toString('latin1');const names=raw.replace(/#([0-9a-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)));
  if(!/^%PDF-1\.[0-7][\r\n]/.test(raw)||!(/%%EOF\s*$/.test(raw))||!/\bstartxref\s+\d+\s+%%EOF\s*$/.test(raw)||/\/(JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|Filespec|RichMedia|XFA|Encrypt|AcroForm|SubmitForm|ImportData|GoToR|URI|ObjStm|XRef)\b/i.test(names))throw Error('DOCUMENT_CONTENT_DENIED');
 }else if(type==='image/png'||type==='image/jpeg'){
  if(type==='image/png'&&(!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||b.subarray(-8,-4).toString()!=='IEND'))throw Error('DOCUMENT_CONTENT_DENIED');
  if(type==='image/jpeg'&&(b[0]!==255||b[1]!==216||b.at(-2)!==255||b.at(-1)!==217))throw Error('DOCUMENT_CONTENT_DENIED');
  const image=sharp(b,{limitInputPixels:12_000_000,failOn:'warning',animated:false});const m=await image.metadata();
  if(m.format!==(type==='image/png'?'png':'jpeg')||!m.width||!m.height||m.width>6000||m.height>6000||(m.pages||1)>1)throw Error('DOCUMENT_CONTENT_DENIED');await image.raw().toBuffer();
 }else throw Error('DOCUMENT_CONTENT_DENIED');
 return createHash('sha256').update(bytes).digest('hex');
}
