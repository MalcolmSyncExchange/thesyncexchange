import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {database,snapshot,source,root} from './helpers/artist-baseline-db.mjs';
import {compare} from '../scripts/artist-baseline/compare.mjs';
test('replayed repository domain schema matches captured production, without implying complete migration history',async()=>{
 const db=await database('historical-repository',{seed:false});
 try {
  const repo=(await db.query(source('scripts/artist-baseline/inventory.sql'))).rows[0].baseline;
  const diff=compare(repo,snapshot('production'));
  for(const [category,d] of Object.entries(diff)) assert.deepEqual(d,{onlyLeft:[],onlyRight:[],changed:[]},category);
 }finally{await db.close();}
});
test('staging security additions and live storage-policy divergence stay visible',()=>{
 const prod=snapshot('production'),stage=snapshot('staging');
 assert.equal(prod.policies.filter(p=>p.schema==='storage').length,0);
 assert.equal(stage.policies.filter(p=>p.schema==='storage').length,3);
 const changes=compare(prod,stage,{includeStorage:true});
 assert.equal(changes.functions.onlyRight.length,4);assert.equal(changes.triggers.onlyRight.length,2);
 assert.ok(stage.functions.some(f=>f.name==='guard_reviewed_rights'));
 assert.ok(stage.functions.some(f=>f.name==='guard_referenced_media_version'));
});
test('missing migration ledger entries are recorded, not treated as missing schema',()=>{
 const migrations=readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql'));
 assert.equal(migrations.filter(f=>f.startsWith('0006_')).length,2);
 assert.equal(snapshot('production').migrations.length,1);
 assert.equal(snapshot('staging').migrations.length,3);
});
test('manual setup entry point clearly retires historical execution advice',()=>{
 const doc=source('supabase/manual-apply.md');
 assert.match(doc.slice(0,1200),/RETIRED/);assert.match(doc.slice(0,1200),/Do not execute/);
 assert.match(doc,/historical instructions below are retained as evidence/);
});

test('captured evidence and historical SQL match the recorded SHA-256 provenance',async()=>{
 const {createHash}=await import('node:crypto');
 const hash=path=>createHash('sha256').update(source(path)).digest('hex');
 const provenance=snapshot('provenance');
 assert.equal(hash('scripts/artist-baseline/inventory.sql'),provenance.querySha256);
 for(const [name,expected] of Object.entries(provenance.snapshots)) assert.equal(hash(`tests/fixtures/artist-baseline/${name}.json`),expected,name);
 for(const [path,expected] of Object.entries(provenance.repositorySqlSha256)) assert.equal(hash(path),expected,path);
});
