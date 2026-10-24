import "server-only";
import {z} from 'zod';
import {mediaActor,mediaRpc,UploadError,type MediaClient} from '@/services/media/uploads';
import {requireAccountScope} from '@/services/auth/authorization';
import {catalogMetadataSchema,searchFiltersSchema,catalogStates} from '@/lib/catalog/contract';
export {UploadError as CatalogError};
const base={track:z.string().uuid(),revision:z.number().int().nonnegative(),key:z.string().uuid()};
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('read'),track:base.track,admin:z.boolean().optional()}).strict(),
 z.object({action:z.literal('list'),admin:z.boolean().optional(),state:z.enum(['not_started','',...catalogStates]).default(''),page:z.number().int().min(1).max(10000).default(1)}).strict(),
 z.object({action:z.literal('recover'),track:base.track,key:base.key,admin:z.boolean().optional()}).strict(),
 z.object({action:z.literal('history'),track:base.track,kind:z.enum(['versions','decisions','events']),before:z.string().min(1).max(36),admin:z.boolean().optional()}).strict(),
 z.object({action:z.literal('save'),...base,metadata:catalogMetadataSchema}).strict(),
 z.object({action:z.literal('submit'),...base}).strict(),
 z.object({action:z.literal('review'),...base,version:z.string().uuid(),state:z.enum(['approved','changes_requested','rejected']),metadata:catalogMetadataSchema,note:z.string().trim().min(5).max(2000)}).strict(),
 z.object({action:z.literal('transition'),...base,state:z.enum(['published','suspended','unpublished','archived']),note:z.string().trim().min(5).max(2000)}).strict(),
 z.object({action:z.literal('reopen'),...base,note:z.string().trim().min(5).max(2000)}).strict(),
 z.object({action:z.literal('search'),filters:searchFiltersSchema.default({}),page:z.number().int().min(1).max(10000).default(1),size:z.number().int().min(1).max(50).default(20),sort:z.enum(['title','newest','bpm','duration','relevance']).default('title')}).strict()
]);
// Preserve shared safe RPC error mapping; give duplicate recordings a precise
// public code without returning a conflicting account, track or SQL diagnostic.
async function catalogRpc(client:MediaClient,name:string,args:Record<string,unknown>={}) {
 const result=await client.rpc(name,args);
 if(result.error?.code==='23505')throw new UploadError(409,'DUPLICATE_RECORDING');
 return mediaRpc({rpc:()=>Promise.resolve(result)},name,args);
}
export async function performCatalogRequest(input:unknown){const p=schema.parse(input);
 if(p.action==='search'){const {supabase}=await requireAccountScope('buyer');return catalogRpc(supabase as unknown as MediaClient,'catalog_search',{p_filters:p.filters,p_page:p.page,p_size:p.size,p_sort:p.sort});}
 const admin=['review','transition','reopen'].includes(p.action)||('admin' in p&&p.admin===true);const {client}=await mediaActor(admin);
 if(p.action==='read')return catalogRpc(client,'catalog_read',{p_track:p.track,p_admin:admin});
 if(p.action==='list')return catalogRpc(client,'catalog_list',{p_admin:admin,p_state:p.state,p_page:p.page});
 if(p.action==='history')return catalogRpc(client,'catalog_history',{p_track:p.track,p_kind:p.kind,p_before:p.before,p_admin:admin});
 if(p.action==='recover')return catalogRpc(client,'catalog_recover',{p_track:p.track,p_key:p.key});
 const common={p_track:p.track,p_revision:p.revision,p_key:p.key};
 switch(p.action){case'save':return catalogRpc(client,'catalog_save',{...common,p_metadata:p.metadata});case'submit':return catalogRpc(client,'catalog_submit',common);case'review':return catalogRpc(client,'catalog_review',{...common,p_version:p.version,p_state:p.state,p_metadata:p.metadata,p_note:p.note});case'transition':return catalogRpc(client,'catalog_transition',{...common,p_state:p.state,p_note:p.note});case'reopen':return catalogRpc(client,'catalog_reopen',{...common,p_note:p.note});}
}
