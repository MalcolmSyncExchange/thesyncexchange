import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {MEDIA_PROFILES,ARTIST_MEDIA_ERRORS,OPERATIONAL_MEDIA_ERRORS} from '../contracts/submission-media/profiles.ts';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const files=readdirSync(new URL('supabase/migrations/',root)).filter(x=>x.includes('slice3_submission_media')).sort();
const sql=files.map(f=>read('supabase/migrations/'+f));
test('frozen profiles: source, generated preview, waveform and square-optional artwork',()=>{
 assert.equal(MEDIA_PROFILES.source.maxBytes,250000000);assert.deepEqual(MEDIA_PROFILES.source.containers,['wav','aiff','aifc','flac']);
 assert.equal(MEDIA_PROFILES.preview.minMs,15000);assert.equal(MEDIA_PROFILES.preview.maxMs,60000);assert.equal(MEDIA_PROFILES.preview.precisionMs,100);assert.equal(MEDIA_PROFILES.preview.defaultMs,30000);assert.equal(MEDIA_PROFILES.preview.normalization,false);
 assert.equal(MEDIA_PROFILES.artwork.squareRequired,false);assert.equal(MEDIA_PROFILES.artwork.maxPixels,32000000);assert.equal(MEDIA_PROFILES.waveform.maxPoints,90000);
 for(const p of Object.values(MEDIA_PROFILES)) assert.ok(sql.join('\n').includes(p.version));
 for(const error of OPERATIONAL_MEDIA_ERRORS) assert.ok(sql.join('\n').includes(error));
 assert.ok(ARTIST_MEDIA_ERRORS.includes('STALE_REVISION'));
});
test('source-only dormant installation: no hosted bucket creation/backfill/commerce mutation',()=>{
 for(const s of sql) {
  assert.doesNotMatch(s,/insert into storage\.(buckets|objects)|update storage\.(buckets|objects)|delete from storage\.(buckets|objects)/i);
  assert.doesNotMatch(s,/(insert into|update|delete from|grant .* on)\s+(public\.)?(orders|payment_events|licenses|entitlements)|commerce_private|gate_d|stripe/i);
 }
 assert.match(sql[0],/reservations_enabled boolean not null default false/);
 assert.match(sql[0],/worker_enabled boolean not null default false/);
 assert.match(sql[0],/activation_enabled boolean not null default false/);
 assert.match(sql[0],/foundation_reads_enabled boolean not null default false/);
 assert.doesNotMatch(sql[1],/user_metadata|app_metadata|p_owner|set_config|execute\s+p_/i);
});
test('all defined privileged routines fix search_path; untrusted role has no generic mutation API',()=>{
 for(const s of sql) {
  const routines=[...s.matchAll(/create or replace function ([\s\S]*?)\$\$;/g)];
  for(const [,routine] of routines){assert.match(routine,/security definer set search_path = ''/i);assert.doesNotMatch(routine,/set arbitrary/);}
 }
 // Storage predicate alone accepts path text but validates exact reservation/owner.
 assert.match(sql[2],/s.owner_id=auth.uid\(\) and u.role::text='artist'/);
 assert.match(sql[1],/revoke all on function %s from public,anon,authenticated,service_role,submission_media_broker/);
 assert.match(sql[1],/h:=submission_media.package_hash\(p_master,p_preview\)/);
 assert.match(sql[0],/foreign key\(submission_id,source_asset_id,source_kind\)/);
});
test('DTO projection excludes private identity and source delivery; old UI/source remains untouched',()=>{
 const dto=sql[1].split('function submission_media.asset_dto')[1].split('$$;')[0];
 assert.doesNotMatch(dto,/object_path|storage_version|storage_object_id|bucket|lease_token|sha256/);
 const buyer=sql[1].split('function submission_media.buyer_media')[1].split('$$;')[0];
 assert.match(buyer,/p.source_asset_id=m.id/);assert.match(buyer,/r.state='approved'/);assert.match(buyer,/t.status='approved'/);
 assert.doesNotMatch(buyer,/jsonb_build_object\('source|audio_file_path|signed/);
 assert.match(read('components/forms/submit-music-form.tsx'),/export/);
});

test('ordinary migration boundary: no internal ownership/grants or Storage DDL; separately hashed supported-authority setup',()=>{
 const setup=read('docs/slice3-foundation/storage-protection.sql');
 for(const s of sql) {
  assert.doesNotMatch(s,/grant .* on schema .*\b(auth|storage|extensions)\b|create policy .* on storage\.objects|create trigger .* on storage\.objects|drop trigger .* on storage\.objects/i);
  assert.doesNotMatch(s,/create role submission_media_executor|owner to submission_media_executor|public\.digest\(/);
 }
 assert.match(sql[0],/m\.member='postgres'::regrole and m\.admin_option and not m\.inherit_option and not m\.set_option/);
 assert.match(sql[0],/m\.member='submission_media_broker'::regrole/);
 assert.match(sql[1],/extensions\.digest\(/);assert.match(sql[1],/Required pgcrypto extensions\.digest/);
 assert.match(setup,/Gate 2 requires exact non-superuser postgres actor/); assert.match(setup,/supautils.policy_grants/); assert.match(setup,/supautils.drop_trigger_grants/);assert.match(setup,/create trigger guard_submission_media_object/);
 assert.equal([...setup.matchAll(/create policy /g)].length,5);
 assert.match(sql[2],/grant execute on function submission_media\.guard_storage_object\(\),submission_media\.storage_setup_ready\(\) to supabase_storage_admin/);
});
