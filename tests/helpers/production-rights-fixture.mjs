import { readFile } from 'node:fs/promises';
import { uploadsFixture } from './music-uploads-fixture.mjs';
const root=new URL('../../',import.meta.url);
const target=JSON.parse(await readFile(new URL('docs/audio-reconstruction/production-schema-evidence.json',root),'utf8'));
// Local-only reconstruction of already-installed target rights DDL. Never deploy
// these historical fixture migrations or replay them against production.
export async function productionRightsFixture(){const db=await uploadsFixture();try{
 // Exact current definitions, rather than assuming historical function bodies match.
 for(const name of ['validate_master_owners','workspace_text_object','workspace_date_window','workspace_region','workspace_document_ref','validate_workspace_rights','workspace_document_editable','workspace_document_actor','media_workspace_document_reserve','media_workspace_documents','media_workspace_document_access','media_workspace_document_received','media_workspace_document_audit','media_submission_save_draft','media_submission_prepare','guard_master_ownership_review'])await db.exec(target.functions.find(f=>f.name===name).definition);
 await db.exec(await readFile(new URL('supabase/migrations/20261119193818_submission_workflow_repair.sql',root),'utf8'));
 await db.exec(await readFile(new URL('supabase/migrations/20261120055242_automatic_public_preview_submission.sql',root),'utf8'));
 return db;
 }catch(e){await db.close();throw e;}}
