import "server-only";
import { createHash } from "node:crypto";
import { requireAccountScope } from "@/services/auth/authorization";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { readPrivateArtifact } from "@/services/delivery/server";
import { parseWaveform, previewEnvelope } from '@/lib/media/waveform.mjs';
import { marketplaceRpc } from "./marketplace";
export type PreviewLocator={asset_id:string;bucket:string;path:string;sha256:string;bytes:number;version:string;mime:string;source_sha256?:string;start_sample?:number;end_sample?:number;sample_rate?:number;duration_us?:number;preview_asset_id?:string};
export const previewHeaders={"cache-control":"private, no-store, max-age=0","referrer-policy":"no-referrer","x-content-type-options":"nosniff","cross-origin-resource-policy":"same-origin","content-disposition":"inline"};
export function previewResponse(bytes:Uint8Array,mime:string,range:string|null){
 const headers={...previewHeaders,"content-type":mime,"accept-ranges":"bytes"};
 if(!range)return new Response(bytes as BodyInit,{headers:{...headers,"content-length":String(bytes.length)}});
 const match=/^bytes=(\d*)-(\d*)$/.exec(range);let start=0,end=bytes.length-1;
 if(!match||!match[1]&&!match[2])return new Response(null,{status:416,headers:{...headers,"content-range":`bytes */${bytes.length}`}});
 if(match[1]){start=Number(match[1]);if(match[2])end=Number(match[2]);}else start=Math.max(0,bytes.length-Number(match[2]));
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=bytes.length)return new Response(null,{status:416,headers:{...headers,"content-range":`bytes */${bytes.length}`}});
 end=Math.min(end,bytes.length-1);return new Response(bytes.slice(start,end+1) as BodyInit,{status:206,headers:{...headers,"content-range":`bytes ${start}-${end}/${bytes.length}`,"content-length":String(end-start+1)}});
}
export async function buyerPreview(request:Request,track:string){
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(track))return new Response("Preview unavailable",{status:404,headers:previewHeaders});
 const kind=new URL(request.url).searchParams.get("kind")||"preview";if(!["preview","artwork","waveform","descriptor"].includes(kind))return new Response("Preview unavailable",{status:404,headers:previewHeaders});
 const {supabase,user}=await requireAccountScope("buyer");const session=await marketplaceRpc<string>(supabase,"marketplace_preview_check",{p_track:track});
 const admin=createAdminSupabaseClient();if(!admin)throw Error("Preview unavailable");
 const expectedAsset=new URL(request.url).searchParams.get("asset");
 if((expectedAsset&&!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(expectedAsset))||(kind==="waveform"&&!expectedAsset))throw Error("Preview unavailable");
 const args={p_actor:user.id,p_session:session,p_track:track,...(kind==="waveform"?{}:{p_kind:kind==="descriptor"?"preview":kind})};
 const procedure=kind==="waveform"?"marketplace_waveform_locator":"marketplace_preview_locator";
 const locator=await marketplaceRpc<PreviewLocator>(admin,procedure,args);
 if(!locator||locator.bucket!==(kind==="artwork"?"submission-artwork":"submission-derived")||!Number.isSafeInteger(locator.bytes)||locator.bytes<1||locator.bytes>(kind==="waveform"?360512:kind==="artwork"?10000000:4000000)||!(/^[a-f0-9]{64}$/).test(locator.sha256)||!(kind==="waveform"?/^[a-f0-9]{64}$/.test(locator.source_sha256||""):kind!=="artwork"?locator.mime==="audio/mp4":["image/png","image/jpeg","image/webp"].includes(locator.mime)))throw Error("Preview unavailable");
 if(expectedAsset&&(kind==="waveform"?locator.preview_asset_id:locator.asset_id)!==expectedAsset)throw Error("Preview unavailable");
 if(kind==="descriptor"){
  if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(locator.asset_id))throw Error("Preview unavailable");
  await marketplaceRpc(supabase,"marketplace_preview_check",{p_track:track});
  const latest=await marketplaceRpc<PreviewLocator>(admin,procedure,args);if(JSON.stringify(latest)!==JSON.stringify(locator))throw Error("Preview unavailable");
  return Response.json({previewUrl:`/api/buyer/preview/${track}?asset=${locator.asset_id}`,waveformUrl:`/api/buyer/preview/${track}?kind=waveform&asset=${locator.asset_id}`},{headers:previewHeaders});
 }
 const bytes=await readPrivateArtifact({bucket:locator.bucket,path:locator.path,byteSize:locator.bytes,signal:request.signal});if(createHash("sha256").update(bytes).digest("hex")!==locator.sha256)throw Error("Preview unavailable");
 await marketplaceRpc(supabase,"marketplace_preview_check",{p_track:track});const latest=await marketplaceRpc<PreviewLocator>(admin,procedure,args);if(JSON.stringify(latest)!==JSON.stringify(locator))throw Error("Preview unavailable");
 if(kind==="waveform"){
  const envelope=previewEnvelope(parseWaveform(bytes,locator.source_sha256),{startSample:locator.start_sample!,endSample:locator.end_sample!,sampleRate:locator.sample_rate!,durationUs:locator.duration_us!});
  return Response.json(envelope,{headers:previewHeaders});
 }
 return previewResponse(bytes,locator.mime,request.headers.get("range"));
}
