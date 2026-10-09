import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { database, applyCapturedAuthorization, source, root, asActor, ids } from './helpers/artist-baseline-db.mjs';

const files = [
  '20260915224738_reconcile_reviewed_rights_and_storage.sql',
  '20260915224822_separate_profile_finance_and_buyer_access.sql',
  '20260915225349_atomic_artist_track_writes.sql',
  '20260924052925_nonretryable_artist_track_stale_conflict.sql',
  '20260924171123_preserve_atomic_rights_holder_identity.sql',
  '20261001042359_secure_buyer_catalog_views.sql'
];
const before = JSON.parse(source('docs/security-pr2/staging-rollout/catalog-before.json'));
const inventory = async db => (await db.query(source('scripts/artist-baseline/inventory.sql'))).rows[0].baseline;

test('PR21 reconciliation remains intact with the additive purchase foundation and adapter; PR18 migrations cannot re-enter', () => {
  assert.deepEqual(readdirSync(new URL('supabase/migrations/', root)).filter(f => /^2026.*\.sql$/.test(f)).sort(), [
    ...files,
    '20261002045900_purchase_completion_foundation.sql',
    '20261002201230_purchase_completion_fulfillment_adapters.sql',
    '20261004023232_gate_d_acceptance_schema.sql',
    '20261004023241_gate_d_acceptance_functions.sql',
    '20261008091022_slice3_submission_media_schema.sql',
    '20261008091023_slice3_submission_media_functions.sql',
    '20261008091024_slice3_submission_media_storage.sql',
    '20261008231329_slice3_media_worker_fenced_io.sql',
    '20261009010228_slice3_media_execution_permits.sql'
  ]);
});

test('captured staging PR18 protections reconcile forward, preserve records, and reject duplicate view remediation without drift', async () => {
  const db = await database('historical-repository');
  const canonical = await database('pr27');
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
    await assert.rejects(db.exec(source(`supabase/migrations/${files.at(-1)}`)), /catalog view option baseline mismatch|helper function name collision/);
    await db.exec('rollback');
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
