import "server-only";
import { requireAccountScope } from "@/services/auth/authorization";
import { parseMarketplaceParams, type MarketplacePage, type MarketplaceParams, type MarketplaceFacets } from "@/lib/buyer-marketplace";
import { shouldUseDemoData } from "@/lib/env";
import { tracks, favorites, artistProfiles } from "@/lib/demo-data";
import { toBuyerTrack } from "./contract";
import type { BuyerTrack } from "@/types/models";
type Client={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>};
export async function marketplaceRpc<T>(client:unknown,name:string,args:Record<string,unknown>={}){const {data,error}=await(client as Client).rpc(name,args);if(error)throw new Error("The marketplace is unavailable. Please try again.");return data as T;}
export async function getMarketplacePage(userId:string,params:MarketplaceParams={}):Promise<MarketplacePage>{
 const parsed=parseMarketplaceParams(params,shouldUseDemoData());if(parsed.invalid)return {items:[],total:0,page:1,page_size:20,page_count:0};
 if(shouldUseDemoData()){
  const {filters:f}=parsed;
  const contains=(v:string,query:unknown)=>!query||v.toLowerCase().includes(String(query).toLowerCase());
  const equals=(v:string,query:unknown)=>!query||v.toLowerCase()===String(query).toLowerCase();
  const list=tracks.filter(t=>t.status==="approved").map(t=>({...toBuyerTrack(t,favorites.some(v=>v.buyer_user_id===userId&&v.track_id===t.id)),artist_id:artistProfiles.find(a=>a.user_id===t.artist_user_id)?.id,audio_file_url:t.audio_file_url})).filter(t=>contains([t.title,t.artist_name,t.genre,...t.mood].join(" "),f.query)&&contains(t.title,f.title)&&contains(t.artist_name,f.artist)&&equals(t.genre,f.genre)&&equals(t.subgenre,f.subgenre)&&(!f.mood||t.mood.some(m=>equals(m,f.mood)))&&equals(t.key,f.key)&&(!f.keyword||t.mood.some(m=>equals(m,f.keyword)))&&(!f.language||f.language==="en")&&(!f.vocal||(f.vocal==="instrumental"?t.instrumental:f.vocal==="vocal"?t.vocals:t.vocals&&t.instrumental))&&(!f.explicit||(f.explicit==="explicit"?t.explicit:!t.explicit))&&(!f.license||t.license_options.some(o=>o.id===f.license&&o.active))&&t.bpm>=Number(f.bpmMin??0)&&t.bpm<=Number(f.bpmMax??400)&&t.duration_seconds>=Number(f.durationMin??0)&&t.duration_seconds<=Number(f.durationMax??36000)&&(!f.slug||t.slug===f.slug)&&(!f.exclude||t.id!==f.exclude)&&(!f.savedOnly||t.is_favorite)&&(!f.artistId||t.artist_id===f.artistId));
  const price=(t:BuyerTrack)=>Math.min(...t.license_options.filter(o=>o.active&&(!f.license||o.id===f.license)).map(o=>o.price_override??o.base_price));
  list.sort((a,b)=>(parsed.sort==="price"?price(a)-price(b):parsed.sort==="bpm"?a.bpm-b.bpm:parsed.sort==="tempo-high"?b.bpm-a.bpm:parsed.sort==="duration"?a.duration_seconds-b.duration_seconds:parsed.sort==="featured"?Number(b.featured)-Number(a.featured):0)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
  return {items:list.slice((parsed.page-1)*parsed.size,parsed.page*parsed.size) as BuyerTrack[],total:list.length,page:parsed.page,page_size:parsed.size,page_count:Math.ceil(list.length/parsed.size)};
 }
 const {supabase}=await requireAccountScope("buyer",userId);const data=await marketplaceRpc<MarketplacePage>(supabase,"marketplace_search",{p_filters:parsed.filters,p_page:parsed.page,p_size:parsed.size,p_sort:parsed.sort});
 if(!data||!Array.isArray(data.items)||!Number.isSafeInteger(data.total))throw new Error("The marketplace is unavailable. Please try again.");return data;
}
export async function getMarketplaceFacets(userId:string){
 if(shouldUseDemoData()){const eligible=tracks.filter(t=>t.status==="approved");const values=(key:"genre"|"subgenre"|"key")=>[...new Set(eligible.map(t=>t[key]).filter(Boolean))].sort();return {genre:values("genre"),subgenre:values("subgenre"),musicalKey:values("key"),mood:[...new Set(eligible.flatMap(t=>t.mood))].sort(),language:["en"],licenses:[...new Map(eligible.flatMap(t=>t.license_options.filter(o=>o.active).map(o=>[o.id,{id:o.id,name:o.name}]))).values()]} as MarketplaceFacets;}
 const {supabase}=await requireAccountScope("buyer",userId);return marketplaceRpc<MarketplaceFacets>(supabase,"marketplace_facets");
}
export type MarketplaceArtist={id:string;name:string;bio:string;location:string;website:string|null;instagram:string|null;spotify:string|null;youtube:string|null;trackCount:number};
export async function getMarketplaceArtist(userId:string,id:string):Promise<MarketplaceArtist|null>{
 if(shouldUseDemoData()){const a=artistProfiles.find(a=>a.id===id);return a?{id:a.id,name:a.artist_name,bio:a.bio,location:a.location,website:a.website||null,instagram:null,spotify:null,youtube:null,trackCount:tracks.filter(t=>t.artist_user_id===a.user_id&&t.status==="approved").length}:null;}
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))return null;
 const {supabase}=await requireAccountScope("buyer",userId);return marketplaceRpc<MarketplaceArtist|null>(supabase,"marketplace_artist",{p_artist:id});
}
