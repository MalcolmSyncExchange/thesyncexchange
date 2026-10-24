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
    '20260915072720_analytics_purchase_outbox.sql',
    '20260915224738_reconcile_reviewed_rights_and_storage.sql',
    '20260915224822_separate_profile_finance_and_buyer_access.sql',
    '20260915225349_atomic_artist_track_writes.sql',
    '20260924052925_nonretryable_artist_track_stale_conflict.sql',
    '20260924171123_preserve_atomic_rights_holder_identity.sql',
    '20261001042359_secure_buyer_catalog_views.sql',
    '20261002045900_purchase_completion_foundation.sql',
    '20261002201230_purchase_completion_fulfillment_adapters.sql',
    '20261004023232_gate_d_acceptance_schema.sql',
    '20261004023241_gate_d_acceptance_functions.sql',
    '20261008091022_slice3_submission_media_schema.sql',
    '20261008091023_slice3_submission_media_functions.sql',
    '20261008091024_slice3_submission_media_storage.sql',
    '20261008231329_slice3_media_worker_fenced_io.sql',
    '20261009010228_slice3_media_execution_permits.sql',
    '20261010060000_analytics_verified_purchase_evidence.sql',
    '20261011004710_sec_payment_readiness.sql',
    '20261011191427_analytics_delivery_reliability.sql',
    '20261011210517_analytics_reporting_index.sql',
    '20261012173855_artist_onboarding_atomic.sql',
    '20261012173856_staging_avatar_storage_readiness.sql',
    '20261014024758_bounded_staging_analytics_validation.sql',
    '20261014050032_immutable_staging_validation_renewal.sql',
    '20261022053950_checkout_recovery.sql',
    '20261022165929_purchase_legal_snapshots.sql',
    '20261022180614_secure_asset_delivery.sql',
    '20261022191602_immutable_source_integration.sql',
    '20261022210225_financial_ledger_reconciliation.sql',
    '20261022213225_financial_ingestion_recovery.sql',
    '20261023000941_authenticated_adverse_financial_evidence.sql',
    '20261023001622_verified_provider_fee_bounds.sql',
    '20261024021823_system01_authentication_guards.sql',
    '20261024032018_system02_artist_account.sql',
  '20261024035806_system03_music_uploads.sql','20261024044101_system04_rights_verification.sql'
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
