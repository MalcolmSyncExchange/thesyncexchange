import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { database, applyCapturedAuthorization, source, root, asActor, ids } from './helpers/artist-baseline-db.mjs';

const files = [
  '20260915224738_reconcile_reviewed_rights_and_storage.sql',
  '20260915224822_separate_profile_finance_and_buyer_access.sql',
  '20260915225349_atomic_artist_track_writes.sql'
];
const before = JSON.parse(source('docs/security-pr2/staging-rollout/catalog-before.json'));
const inventory = async db => (await db.query(source('scripts/artist-baseline/inventory.sql'))).rows[0].baseline;

test('PR21 is the only forward migration path; PR18 migrations cannot enter the directory', () => {
  assert.deepEqual(readdirSync(new URL('supabase/migrations/', root)).filter(f => /^2026.*\.sql$/.test(f)).sort(), files);
});

test('captured staging PR18 protections reconcile to PR21, preserve records, and reapply idempotently', async () => {
  const db = await database('historical-repository');
  const canonical = await database();
  try {
    await applyCapturedAuthorization(db, before);
    const tracks = (await db.query('select id,title,status from tracks order by id')).rows;
    for (const file of files) await db.exec(source(`supabase/migrations/${file}`));
    const first = await inventory(db);
    const expected = await inventory(canonical);
    for (const category of ['policies', 'views', 'column_grants']) assert.deepEqual(first[category], expected[category], category);
    assert.deepEqual((await db.query('select id,title,status from tracks order by id')).rows, tracks);
    await asActor(db, ids.a, async () => {
      await assert.rejects(db.exec("update artist_profiles set verification_status='verified'"), /permission|Protected/);
      await assert.rejects(db.exec(`update rights_holders set name='Bypass' where track_id='${ids.live}'`), /Reviewed/);
      await assert.rejects(db.exec(`update rights_holders set approval_status='approved' where track_id='${ids.draft}'`), /workflow/);
    });
    for (const file of files) await db.exec(source(`supabase/migrations/${file}`));
    const second = await inventory(db);
    for (const category of ['policies', 'views', 'functions', 'triggers', 'column_grants']) assert.deepEqual(second[category], first[category], category);
  } finally { await db.close(); await canonical.close(); }
});

test('failed forward migration transaction restores the prior catalog without disabling security', async () => {
  const db = await database('historical-repository');
  try {
    await applyCapturedAuthorization(db, before);
    const original = await inventory(db);
    await db.exec('begin');
    await db.exec(source(`supabase/migrations/${files[1]}`).replace(/^begin;\s*$/gmi, '').replace(/^commit;\s*$/gmi, ''));
    await assert.rejects(db.exec('select * from intentionally_absent_rollback_probe'), /does not exist/);
    await db.exec('rollback');
    const restored = await inventory(db);
    for (const category of ['policies', 'views', 'functions', 'triggers', 'column_grants']) assert.deepEqual(restored[category], original[category], category);
    await asActor(db, ids.a, () => assert.rejects(db.exec(`delete from rights_holders where track_id='${ids.live}'`), /Reviewed/));
  } finally { await db.close(); }
});
