import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pathToFileURL} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {openPrivateArtifact,verifyArtifact,privateDeliveryHeaders,DeliveryFailure} from './transfer.mjs';
import {spoolArtifact,guardedArtifactStream} from './stream.mjs';

const hash=ticket=>createHash('sha256').update(ticket).digest('hex');
/** Separate local Node runtime: never deploy large binary bodies in a Netlify
 * Function. Tickets are 256-bit random capabilities, single-use and <=60s old.
 * No session cookie, arbitrary object path or buyer identity is accepted here. */
export async function prepareTicketDownload(request,{appOrigin,redeem,read,prepare,finish,check,record}) {
 const headers={...privateDeliveryHeaders,'Access-Control-Allow-Origin':appOrigin,'Access-Control-Expose-Headers':'Content-Disposition, Content-Length',Vary:'Origin'};
 const denied=(status=409)=>Response.json({error:'Download unavailable. Refresh the original purchase.'},{status,headers});
 if(request.headers.get('origin')!==appOrigin)return denied(403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'300'}});
 if(request.method!=='POST')return denied(405);
 if(request.headers.has('range'))return denied(416);
 let a;
 try {
  let body;try{body=await readTicketRequest(request);}catch{return denied(400);}
  a=await redeem(hash(body.ticket));
  if(!a.allowed)return denied();
  const prepared=prepare?await prepare(a,request.signal):null;
  let stream;
  try {
  const bytes=prepared?null:verifyArtifact(await read(a,request.signal),a);
  if(request.signal.aborted)throw new DeliveryFailure('aborted');
  const extension={'audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3','audio/aiff':'aiff','audio/flac':'flac','application/zip':'zip','application/pdf':'pdf'}[a.mimeType];
  if(!extension||!['master','instrumental','clean','stems','alternate','supporting'].includes(a.kind)||!/^[a-zA-Z0-9-]{1,64}$/.test(a.assetVersionId))throw new DeliveryFailure('integrity_failed');
  if(!await finish(a.buyerId,a.authorizationId,'bytes_prepared')){await prepared?.close();return denied();}
  // Enqueue the already verified buffer without a second full-file copy.
  stream=check&&record?await guardedArtifactStream(prepared||{size:bytes.byteLength,read:async(offset,count)=>bytes.subarray(offset,offset+count),close:async()=>{}},a,{signal:request.signal,check:()=>check(a.buyerId,a.authorizationId),record:(outcome,count)=>record(a.buyerId,a.authorizationId,outcome,count)}):new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}});
  return new Response(stream,{headers:{...headers,'Content-Type':a.mimeType,'Content-Length':String(a.byteSize),
   'Content-Disposition':`attachment; filename="tse-${a.kind}-${a.assetVersionId}.${extension}"`}});
  }catch(error){if(!stream)await prepared?.close();throw error;}
 }catch(error){
  if(a?.allowed)try{await finish(a.buyerId,a.authorizationId,error instanceof DeliveryFailure?error.code:'storage_failed');}catch{/* No bytes without durable finalization. */}
  return denied(503);
 }
}

export async function readTicketRequest(request) {
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new DeliveryFailure('storage_failed');
 const reader=request.body?.getReader();if(!reader)throw new DeliveryFailure('storage_failed');
 let timeout;const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new DeliveryFailure('storage_failed')),5000);});
 const chunks=[];let size=0;
 try{for(;;){const part=await Promise.race([reader.read(),deadline]);if(part.done)break;size+=part.value.byteLength;if(size>128)throw new DeliveryFailure('storage_failed');chunks.push(part.value);}
 const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
 if(!body||Array.isArray(body)||Object.keys(body).length!==1||typeof body.ticket!=='string'||!/^[a-f0-9]{64}$/.test(body.ticket))throw new DeliveryFailure('storage_failed');return body;
 }finally{clearTimeout(timeout);void reader.cancel().catch(()=>{});reader.releaseLock();}
}

export function createDeliveryBroker({appOrigin,projectUrl,serviceKey,fetcher=fetch,rpcClient}) {
 const app=new URL(appOrigin),project=new URL(projectUrl);
 if(app.origin!==appOrigin||app.protocol!=='https:'||project.protocol!=='https:'||project.username||project.password||project.search||project.hash||project.pathname!=='/'||!serviceKey)throw Error('Explicit HTTPS app/project and private broker credential required.');
 const client=rpcClient||createClient(projectUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000)})}});
 const rpc=async(name,args)=>{const {data,error}=await client.rpc(name,args);if(error||data===null)throw Error('Broker database unavailable.');return data;};
 let active=0;
 const server=createServer(async(req,res)=>{
  // No request URLs, ticket values, provider errors or credentials are logged.
  if(req.url!=='/download'){res.writeHead(404,{'Cache-Control':'no-store'});res.end();return;}
  if(active>=2){res.writeHead(503,{'Cache-Control':'no-store'});res.end();return;}
  active++;
  const abort=new AbortController();req.on('aborted',()=>abort.abort());res.on('close',()=>{if(!res.writableFinished)abort.abort();});
  try{
   const request=new Request(`${appOrigin}/download`,{method:req.method,headers:req.headers,
    ...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{}),signal:abort.signal});
   const response=await prepareTicketDownload(request,{appOrigin,
    redeem:tokenHash=>rpc('redeem_asset_delivery_ticket',{p_hash:tokenHash}),
    prepare:async(a,signal)=>spoolArtifact(await openPrivateArtifact({projectUrl,serviceKey,bucket:a.bucket,path:a.path,byteSize:a.byteSize,signal,fetcher}),a,{signal}),
    check:(buyer,id)=>rpc('check_asset_transfer',{p_buyer:buyer,p_authorization:id}),
    record:(buyer,id,outcome,count)=>rpc('record_asset_transfer',{p_buyer:buyer,p_authorization:id,p_outcome:outcome,p_bytes:count}),
    finish:(buyer,id,outcome)=>rpc('finish_asset_download',{p_buyer:buyer,p_authorization:id,p_outcome:outcome})});
   res.writeHead(response.status,Object.fromEntries(response.headers));
   if(response.body)await new Promise((resolve,reject)=>{const stream=Readable.fromWeb(response.body);stream.on('error',reject);res.on('error',reject);res.on('finish',resolve);res.on('close',resolve);stream.pipe(res);});else res.end();
  }catch{if(!res.headersSent){res.writeHead(503,{'Cache-Control':'no-store'});res.end();}else res.destroy();}
  finally{active--;}
 });
 server.headersTimeout=10_000;server.requestTimeout=30_000;
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const server=createDeliveryBroker({appOrigin:process.env.SYNC_EXCHANGE_DELIVERY_APP_ORIGIN,projectUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY});
 const port=Number(process.env.PORT||8080);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid broker port.');
 // Loopback-only by default; hosted binding is an explicit deployment setting.
 server.listen(port,process.env.SYNC_EXCHANGE_DELIVERY_BIND||'127.0.0.1');
}
