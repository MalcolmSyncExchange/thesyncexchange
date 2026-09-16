import test from 'node:test';
import assert from 'node:assert/strict';
import { database, asActor, artist, other, admin, track, draft, source } from './helpers/security-db.mjs';
test('PostgreSQL: reviewed rights trigger closes direct mutations while preserving edit and moderation flows', async () => {
  const db = await database();
  try {
    // Reproduce the original direct Data API boundary before applying the fix.
    await asActor(db, artist, () => db.exec(`update rights_holders set name='Unreviewed' where track_id='${track}'`));
    assert.equal((await db.query(`select name from rights_holders where track_id='${track}'`)).rows[0].name,'Unreviewed');
    const migration=source('supabase/migrations/20260915065140_protect_reviewed_rights.sql');
    await db.exec(migration); await db.exec(migration); // idempotent application
    await asActor(db, artist, async () => {
      for(const sql of [
        `update rights_holders set ownership_percent=50 where track_id='${track}'`,
        `delete from rights_holders where track_id='${track}'`,
        `insert into rights_holders(track_id,name,ownership_percent) values('${track}','New',50)`,
        `update rights_holders set track_id='${draft}' where track_id='${track}'`,
        `update rights_holders set track_id='${track}' where track_id='${draft}'`
      ]) await assert.rejects(db.exec(sql), /Reviewed rights/);
      await db.exec(`update tracks set status='archived' where id='${track}'`);
      await assert.rejects(db.exec(`update rights_holders set name='Archive bypass' where track_id='${track}'`), /Reviewed rights/);
      await db.exec(`update tracks set status='pending_review' where id='${track}'`);
      await assert.rejects(db.exec(`delete from rights_holders where track_id='${track}'`), /Reviewed rights/);
      await db.exec(`update rights_holders set name='Legitimate draft edit' where track_id='${draft}'`);
      await db.exec(`update tracks set status='pending_review' where id='${draft}'`);
      await db.exec(`delete from rights_holders where track_id='${draft}'; insert into rights_holders(track_id,name,ownership_percent) values('${draft}','Pending review owner',100)`);
    });
    await asActor(db, other, async () => {
      assert.equal((await db.query(`update rights_holders set name='Cross-owner' where track_id='${draft}' returning id`)).rows.length,0);
    });
    await asActor(db, admin, () => db.exec(`update rights_holders set name='Admin correction' where track_id='${track}'`));
    await asActor(db, artist, () => db.exec(`update tracks set status='draft' where id='${track}'; delete from rights_holders where track_id='${track}'; insert into rights_holders(track_id,name,ownership_percent) values('${track}','Trusted edit for review',100)`), 'service_role');
    assert.equal((await db.query(`select name from rights_holders where track_id='${track}'`)).rows[0].name,'Trusted edit for review');
    await asActor(db, artist, () => db.exec(`delete from tracks where id='${draft}'`));
    assert.equal((await db.query(`select count(*)::int n from rights_holders where track_id='${draft}'`)).rows[0].n,0);
    assert.equal((await db.query("select has_function_privilege('authenticated','security_private.guard_reviewed_rights()','execute') allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});
