export class StorageRequestError extends Error { status:number; constructor(status:number) { super("Invalid or oversized upload request.");this.status=status; } }
// Legacy server uploads need a transport bound before multipart parsing; the
// selected kind's smaller file-size limit is still enforced after parsing.
export async function readStorageMultipart(request:Request) {
  const type=request.headers.get("content-type")||"";
  if (!/^multipart\/form-data;\s*boundary=/i.test(type)) throw new StorageRequestError(415);
  const max=51*1024*1024;
  const length=request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length)||Number(length)>max)) throw new StorageRequestError(413);
  const reader=request.body?.getReader();if(!reader)throw new StorageRequestError(400);
  const chunks:Uint8Array[]=[];let size=0;let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new StorageRequestError(408)),30_000);});
  try {
    for(;;){const part=await Promise.race([reader.read(),deadline]);if(part.done)break;size+=part.value.byteLength;if(size>max)throw new StorageRequestError(413);chunks.push(part.value);}
    try {return await new Response(Buffer.concat(chunks),{headers:{"content-type":type}}).formData();}catch{throw new StorageRequestError(400);}
  }finally{clearTimeout(timer);void reader.cancel().catch(()=>{});reader.releaseLock();}
}
