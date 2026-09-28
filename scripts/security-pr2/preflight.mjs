// Offline by construction. Reads catalog exports; never connects to a database.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { database, source, root } from '../../tests/helpers/artist-baseline-db.mjs';
import { compare } from '../artist-baseline/compare.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const migrations=readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort();
const manifest={ format:1, baselineCommit:'35062fb', order:migrations.map(file=>({file,sha256:sha(source(`supabase/migrations/${file}`))})), storageBuckets:{avatars:true,'cover-art':true,'track-previews':true,'track-audio':false,agreements:false} };
const manifestPath=new URL('../../docs/security-pr2/migration-manifest.json',import.meta.url);
if(process.argv.includes('--write-manifest')) writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
else assert.deepEqual(manifest,JSON.parse(readFileSync(manifestPath,'utf8')),'Migration manifest changed: review SQL before regenerating.');
const db=await database('repository',{seed:false});
try {
 const canonical=(await db.query(source('scripts/artist-baseline/inventory.sql'))).rows[0].baseline;
 const policies=canonical.policies.filter(p=>p.schema==='storage');
 assert.equal(policies.length,5);assert.equal(policies.filter(p=>p.permissive==='RESTRICTIVE').length,3);
 assert.ok(!canonical.triggers.some(t=>['on_auth_user_created','on_auth_user_updated'].includes(t.name)));
 const {rows:[g]}=await db.query(`select
  has_table_privilege('authenticated','artist_profiles','select') as broad_profile,
  has_column_privilege('authenticated','artist_profiles','payout_email','select') as payout,
  has_column_privilege('authenticated','artist_profiles','verification_status','update') as verification,
  has_table_privilege('authenticated','track_audit_log','delete') as delete_audit,
  has_function_privilege('anon','get_own_artist_finance()','execute') as anon_finance,
  has_function_privilege('authenticated','update_artist_track_atomic(uuid,uuid,timestamptz,jsonb,jsonb,jsonb)','execute') as direct_atomic,
  has_function_privilege('service_role','update_artist_track_atomic(uuid,uuid,timestamptz,jsonb,jsonb,jsonb)','execute') as service_atomic`);
 assert.deepEqual(g,{broad_profile:false,payout:false,verification:false,delete_audit:false,anon_finance:false,direct_atomic:false,service_atomic:true});
 for(const file of ['scripts/create-admin.mjs','scripts/seed-test-accounts.mjs','scripts/setup-supabase-storage.mjs','scripts/diagnose-supabase-project.mjs','app/api/health/readiness/route.ts']) assert.doesNotMatch(source(file),/foundation-bootstrap|apply_foundation_bootstrap|apply_finalization_bundle|apply_follow_up_bundle/);
 const captureArg=process.argv.indexOf('--capture');
 if(captureArg>=0) {
  const document=JSON.parse(readFileSync(process.argv[captureArg+1],'utf8'));
  const live=document.baseline || document;
  const diff=compare(canonical,live);
  diff.storagePolicies=compare({policies},{policies:live.policies.filter(p=>p.schema==='storage')},{includeStorage:true}).policies;
  diff.storageTriggers=compare({triggers:canonical.triggers.filter(t=>t.schema==='storage')},{triggers:live.triggers.filter(t=>t.schema==='storage'&&t.name==='guard_referenced_media_version')},{includeStorage:true}).triggers;
  const normalizeGrants=rows=>(rows||[]).filter(g=>['anon','authenticated'].includes(g.grantee)).map(g=>JSON.stringify(g)).sort();
  // Check exact column grants; table-wide grants also appear in column_privileges.
  const columnGrantsMatch=JSON.stringify(normalizeGrants(canonical.column_grants))===JSON.stringify(normalizeGrants(live.column_grants));
  const rpcNames=['get_own_artist_finance','update_artist_track_atomic'];
  const aclPrincipals=acl=>acl===null ? ['PUBLIC'] : [...String(acl).matchAll(/(?:^\{|,)([^=]*)=([^/]+)\//g)].filter(([,principal,permissions])=>['','anon','authenticated','service_role'].includes(principal)&&permissions.includes('X')).map(([,principal])=>principal||'PUBLIC').sort();
  const routineGrants=rpcNames.map(name=>{
   const f=live.functions.find(f=>f.schema==='public'&&f.name===name);
   const expected=aclPrincipals(canonical.functions.find(f=>f.name===name).acl);
   const actual=f?aclPrincipals(f.acl):[];
   return {name,present:!!f,expected,actual,match:!!f&&JSON.stringify(expected)===JSON.stringify(actual)};
  });
  const bucketMismatches=Object.entries(manifest.storageBuckets).filter(([id,isPublic])=>!live.buckets?.some(b=>b.id===id&&b.public===isPublic));
  const report={capturedAt:live.captured_at,canonicalMigrationCount:migrations.length,liveMigrations:live.migrations,diff,columnGrantsMatch,routineGrants,bucketMismatches,limitations:['Hosted internal storage tables/triggers excluded except application guard. New RPC EXECUTE grants compared for PUBLIC/anon/authenticated/service_role; provider owners/default grants remain an operational review item. No live mutations or runtime Storage/PostgREST requests.']};
  const out=process.argv.indexOf('--report');if(out>=0)writeFileSync(process.argv[out+1],JSON.stringify(report,null,2)+'\n');
  const counts=Object.fromEntries(Object.entries(diff).map(([k,v])=>[k,{missing:v.onlyLeft.length,unexpected:v.onlyRight.length,changed:v.changed.length}]));
  console.log(JSON.stringify({counts,columnGrantsMatch,routineGrants,bucketMismatches},null,2));
  if(!columnGrantsMatch||bucketMismatches.length||routineGrants.some(g=>!g.match)||Object.values(diff).some(d=>d.onlyLeft.length||d.onlyRight.length||d.changed.length)) process.exitCode=1;
 } else console.log(`PASS: ${migrations.length} hashed migrations; canonical role/column/RPC/Storage assertions; no obsolete executable recommendations.`);
} finally {await db.close();}
