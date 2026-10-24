import "server-only";
import { z } from "zod";
import { mediaActor, mediaRpc, UploadError } from "@/services/media/uploads";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { declarationSchema, documentKinds } from "@/lib/rights/contract";
export { UploadError as RightsError };
export async function rightsActor(admin=false){return mediaActor(admin);}
export async function documentActor(){const c=await createServerSupabaseClient();const {data:{user}}=await c.auth.getUser();if(!user)throw new UploadError(401,'AUTH_REQUIRED');const p=await selectUserProfileCompat(c,user.id);return rightsActor(p.data?.role==='admin');}
const base={track:z.string().uuid(),revision:z.number().int().nonnegative(),key:z.string().uuid()};
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('list'),admin:z.boolean().optional()}).strict(),
 z.object({action:z.literal('read'),track:base.track,admin:z.boolean().optional()}).strict(),
 z.object({action:z.literal('history'),track:base.track,kind:z.enum(['versions','decisions','events','documents']),before:z.string().max(36),admin:z.boolean().optional()}).strict(),
 z.object({action:z.literal('recover'),track:base.track,key:z.string().uuid(),admin:z.boolean().optional()}).strict(),
 z.object({action:z.literal('save'),...base,payload:declarationSchema}).strict(),
 z.object({action:z.literal('submit'),...base}).strict(),
 z.object({action:z.literal('review'),...base,version:z.string().uuid(),state:z.enum(['approved','rejected','clarification','disputed','expired','revoked']),note:z.string().trim().min(5).max(2000),checklist:z.record(z.boolean())}).strict(),
 z.object({action:z.literal('document'),...base,kind:z.enum(documentKinds),filename:z.string().min(1).max(200),bytes:z.number().int().min(1).max(3_000_000),type:z.enum(['application/pdf','image/png','image/jpeg'])}).strict(),
 z.object({action:z.literal('withdraw'),...base,document:z.string().uuid()}).strict(),
 z.object({action:z.literal('restrict'),...base,document:z.string().uuid(),state:z.enum(['revoked','disputed']),note:z.string().trim().min(5).max(2000)}).strict()
]);
export async function performRightsRequest(input:unknown){const p=schema.parse(input);const admin=p.action==='review'||p.action==='restrict'||((p.action==='read'||p.action==='list'||p.action==='recover'||p.action==='history')&&p.admin===true);const {client,user}=await rightsActor(admin);
 if(p.action==='history')return mediaRpc(client,'rights_history',{p_track:p.track,p_kind:p.kind,p_before:p.before,p_admin:admin});if(p.action==='recover')return mediaRpc(client,'rights_recover',{p_track:p.track,p_key:p.key});if(p.action==='list')return mediaRpc(client,'rights_list',{p_admin:admin});if(p.action==='read')return mediaRpc(client,'rights_read',{p_track:p.track,p_admin:admin});
 const common={p_track:p.track,p_revision:p.revision,p_key:p.key};switch(p.action){case'save':return mediaRpc(client,'rights_save',{...common,p_payload:{...p.payload,seller:{...p.payload.seller,userId:user.id}}});case'submit':return mediaRpc(client,'rights_submit',common);case'review':if(p.state==='approved'){const {verifyRightsDocuments}=await import('./documents');await verifyRightsDocuments(client,user.id,p.track);}return mediaRpc(client,'rights_review',{...common,p_version:p.version,p_state:p.state,p_note:p.note,p_checklist:p.checklist});case'document':return mediaRpc(client,'rights_document_reserve',{...common,p_kind:p.kind,p_filename:p.filename,p_bytes:p.bytes,p_type:p.type});case'withdraw':return mediaRpc(client,'rights_document_withdraw',{p_document:p.document,p_revision:p.revision,p_key:p.key});case'restrict':return mediaRpc(client,'rights_document_restrict',{p_document:p.document,p_revision:p.revision,p_key:p.key,p_state:p.state,p_note:p.note});}
}
