import type { BuyerTrack } from "../types/models.ts";
export type MarketplaceParams = Record<string, string | string[] | undefined>;
export type MarketplaceFacets = { genre?: string[]; subgenre?: string[]; mood?: string[]; musicalKey?: string[]; language?: string[]; licenses?: {id:string; name:string}[] };
export type MarketplacePage = { items: BuyerTrack[]; total:number; page:number; page_size:number; page_count:number };
export const marketplaceFields = ["query","artist","title","keyword","genre","subgenre","mood","bpmMin","bpmMax","key","durationMin","durationMax","vocal","explicit","language","license","artistId","slug","savedOnly","exclude"] as const;
export const marketplaceSorts = ["relevance","featured","title","newest","price","bpm","tempo-high","duration"] as const;
export function parseMarketplaceParams(params:MarketplaceParams={},demo=false) {
 const filters:Record<string,string|number>={};let invalid=false;
 for(const key of marketplaceFields){const value=params[key];if(value===undefined||value===""||value==="all")continue;if(typeof value!=="string"||value.length>200||/[\u0000-\u001f\u007f]/.test(value)){invalid=true;continue;}
  if(["bpmMin","bpmMax","durationMin","durationMax"].includes(key)){const max=key.startsWith("bpm")?400:36000;if(!/^\d{1,5}$/.test(value)||Number(value)>max)invalid=true;else filters[key]=Number(value);}
  else filters[key]=value.trim();
 }
 for(const [min,max]of [["bpmMin","bpmMax"],["durationMin","durationMax"]])if(Number(filters[min]??0)>Number(filters[max]??36000))invalid=true;
 for(const key of ["license","artistId","exclude"])if(filters[key]&&!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(filters[key]))&&!(demo&&/^(lt|ap|track)-[1-9][0-9]*$/.test(String(filters[key]))))invalid=true;
 if(filters.vocal&&!["vocal","instrumental","mixed"].includes(String(filters.vocal))||filters.explicit&&!["clean","explicit"].includes(String(filters.explicit))||filters.savedOnly&&filters.savedOnly!=="true")invalid=true;
 const page=typeof params.page==="string"&&/^\d{1,5}$/.test(params.page)&&Number(params.page)>=1&&Number(params.page)<=10000?Number(params.page):1;
 const sort=typeof params.sort==="string"&&(marketplaceSorts as readonly string[]).includes(params.sort)?params.sort:"relevance";
 const size=typeof params.size==="string"&&["10","20","50"].includes(params.size)?Number(params.size):20;
 return {filters,page,size,sort,layout:params.layout==="grid"?"grid" as const:"list" as const,invalid};
}
export function marketplaceHref(base:string,params:MarketplaceParams,patch:Record<string,string|undefined>={}){
 const query=new URLSearchParams();for(const [key,value]of Object.entries({...params,...patch}))if(typeof value==="string"&&value&&value!=="all")query.set(key,value);return base+(query.size?"?"+query:"");
}
export function safeArtistLink(value:unknown){if(typeof value!=="string"||value.length>2048)return null;try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password?u.href:null;}catch{return null;}}
