import "server-only";
import { captureForUser } from "@/services/analytics/actor";
import { z } from "zod";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { hasPrivilegedAssurance } from "@/services/auth/security";
import { resolveMaintenanceMode } from "@/lib/maintenance-mode.mjs";
import { hasSupabaseEnv, env } from "@/lib/env";
import { consumeRateLimit } from "@/services/security/rate-limit";
import { uploadMetadataSchema, uploadRoles, type UploadState } from "@/lib/media/upload-contract";
export type MediaClient = {rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
export class UploadError extends Error{constructor(public status:number,public code:string){super(code);}}
export async function mediaActor(admin=false){
 if(resolveMaintenanceMode(process.env.SYNC_EXCHANGE_MAINTENANCE_MODE).blocksApplication||!hasSupabaseEnv||env.demoMode)throw new UploadError(503,"MEDIA_UNAVAILABLE");
 const client=await createServerSupabaseClient();const {data:{user},error}=await client.auth.getUser();if(error||!user)throw new UploadError(401,"AUTH_REQUIRED");const profile=await selectUserProfileCompat(client,user.id);
 if(profile.error||!profile.data||(!admin&&profile.data.role!=="artist")||(admin&&profile.data.role!=="admin")||(admin&&!(await hasPrivilegedAssurance(client))))throw new UploadError(403,"ACCESS_DENIED");return {client:client as unknown as MediaClient,user};
}
export async function mediaRpc<T>(client:MediaClient,name:string,args:Record<string,unknown>={}){const {data,error}=await client.rpc(name,args);if(error||data===null){const code=error?.code;if(code==="55000")throw new UploadError(503,"MEDIA_DISABLED");if(code==="PGRST202"||code==="42883")throw new UploadError(503,"WORKSPACE_UPDATE_REQUIRED");throw new UploadError(code==="42501"?403:code==="40001"?409:code==="22023"?400:code==="54000"?429:503,code==="40001"?"STALE_REVISION":code==="22023"?"CHECK_REQUIRED_FIELDS":code==="54000"?"UPLOAD_LIMIT":code==="42501"?"ACCESS_DENIED":"MEDIA_UNAVAILABLE");}return data as T;}
export async function readUploads(id:string,admin=false){z.string().uuid().parse(id);const {client}=await mediaActor(admin);return mediaRpc<UploadState>(client,admin?"media_upload_admin_read":"media_upload_read",{p_submission:id});}
const base={submission:z.string().uuid(),revision:z.number().int().nonnegative(),key:z.string().uuid()};
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("create"),key:z.string().uuid(),track:z.string().uuid().nullable().optional()}).strict(),
 z.object({action:z.literal("read"),submission:base.submission,admin:z.boolean().optional()}).strict(),
 z.object({action:z.literal("documents"),submission:base.submission,admin:z.boolean().optional()}).strict(),
 z.object({action:z.literal("reserve_document"),submission:base.submission,kind:z.enum(['authority','sample','agreement']),filename:z.string().min(5).max(255).regex(/^[^/\\\x00-\x1f\x7f]+[.]pdf$/i),bytes:z.number().int().min(16).max(3_000_000),key:base.key}).strict(),
 z.object({action:z.literal("list")}).strict(),
 z.object({action:z.literal("workspace_status")}).strict(),
 z.object({action:z.literal("recover_draft"),submission:base.submission,key:base.key}).strict(),
 z.object({action:z.literal("prepare_workspace"),...base}).strict(),
 z.object({action:z.literal("save_draft"),...base,data:z.unknown()}).strict(),
 z.object({action:z.literal("reserve"),...base,role:z.enum(uploadRoles),label:z.string().trim().min(1).max(80),filename:z.string().min(1).max(255),bytes:z.number().int().positive().max(150_000_000),replaces:z.string().uuid().nullable().optional()}).strict(),
 z.object({action:z.literal("destination"),submission:base.submission,asset:z.string().uuid()}).strict(),
 z.object({action:z.literal("confirm"),submission:base.submission,asset:z.string().uuid()}).strict(),
 z.object({action:z.literal("remove"),...base,asset:z.string().uuid()}).strict(),
 z.object({action:z.literal("region"),...base,master:z.string().uuid(),start:z.number().int().nonnegative(),end:z.number().int().positive().max(900_000)}).strict(),
 z.object({action:z.literal("preview"),...base}).strict(),
 z.object({action:z.literal("accept"),...base,asset:z.string().uuid()}).strict(),
 z.object({action:z.literal("retry"),...base,job:z.string().uuid()}).strict(),
 z.object({action:z.literal("metadata"),...base,data:uploadMetadataSchema}).strict(),
 z.object({action:z.literal("submit"),...base}).strict()
]);
export async function performMediaRequest(input:unknown){const p=schema.parse(input);const {client,user}=await mediaActor((p.action==="read"||p.action==="documents")&&p.admin===true);if(p.action==="reserve"){const admission=await consumeRateLimit("upload",user.id);if(admission.status!=="allowed")throw new UploadError(429,"UPLOAD_LIMIT");}
 if(p.action==='documents')return mediaRpc(client,'media_workspace_documents',{p_submission:p.submission,p_admin:p.admin===true});
 if(p.action==='reserve_document'){if((await consumeRateLimit('upload',user.id)).status!=='allowed')throw new UploadError(429,'UPLOAD_LIMIT');return mediaRpc(client,'media_workspace_document_reserve',{p_submission:p.submission,p_kind:p.kind,p_filename:p.filename,p_bytes:p.bytes,p_key:p.key});}
 if(p.action==="recover_draft")return mediaRpc(client,"media_submission_recover",{p_submission:p.submission,p_key:p.key});
 if(p.action==="workspace_status")return mediaRpc(client,"media_submission_status");
 if(p.action==="prepare_workspace")return mediaRpc(client,"media_submission_prepare",{p_submission:p.submission,p_revision:p.revision,p_key:p.key});
 if(p.action==="save_draft"){const {submissionDraftSchema}=await import("@/lib/media/submission-draft");return mediaRpc(client,"media_submission_save_draft",{p_submission:p.submission,p_data:submissionDraftSchema.parse(p.data),p_revision:p.revision,p_key:p.key});}
 if(p.action==="create"){const result=await mediaRpc<{submission_id:string}>(client,"media_create_submission",{p_key:p.key,p_track:p.track||null});await captureForUser(user.id,"submission_started",{submission_attempt_id:result.submission_id,surface:p.track?"submission_edit":"submission_create"},"submission-start:"+result.submission_id).catch(()=>{});return result;}if(p.action==="list")return mediaRpc(client,"media_upload_list");if(p.action==="read")return mediaRpc(client,p.admin?"media_upload_admin_read":"media_upload_read",{p_submission:p.submission});
 const common={p_submission:p.submission};if(p.action==="destination"||p.action==="confirm")return mediaRpc(client,p.action==="confirm"?"media_upload_confirm":"media_upload_destination",{...common,p_asset:p.asset});
 const mutation={...common,p_revision:p.revision,p_key:p.key};
 switch(p.action){case "reserve":return mediaRpc(client,"media_upload_reserve",{...mutation,p_role:p.role,p_label:p.label,p_filename:p.filename,p_bytes:p.bytes,p_replaces:p.replaces||null});case "remove":return mediaRpc(client,"media_upload_remove",{...mutation,p_asset:p.asset});case "region":return mediaRpc(client,"media_select_preview_region",{...mutation,p_master:p.master,p_start_ms:p.start,p_end_ms:p.end});case "preview":return mediaRpc(client,"media_request_preview",mutation);case "accept":return mediaRpc(client,"media_accept_asset",{...mutation,p_asset:p.asset});case "retry":return mediaRpc(client,"media_retry_job",{...mutation,p_job:p.job});case "metadata":return mediaRpc(client,"media_upload_save_metadata",{...mutation,p_data:p.data});case "submit":{const result=await mediaRpc<{track_id:string;review_id:string;is_resubmission:boolean}>(client,"media_upload_submit",mutation);await captureForUser(user.id,"submission_completed",{track_id:result.track_id,is_resubmission:result.is_resubmission},"submission:"+result.track_id+":media-review:"+result.review_id).catch(()=>{});return result;}}
}

export async function findTrackUpload(trackId:string){
 const client=await createServerSupabaseClient();const {data,error}=await (client as unknown as MediaClient).rpc("media_upload_find",{p_track:trackId});return error||typeof data!=="string"?null:data;
}
