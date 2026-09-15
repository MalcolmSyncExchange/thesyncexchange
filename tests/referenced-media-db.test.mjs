import test from 'node:test';
import assert from 'node:assert/strict';
import { database, asActor, artist, other, admin, track, mediaPath, source } from './helpers/security-db.mjs';
test('PostgreSQL: restrictive storage policies prevent overwrite, rename, delete and recreation of persisted media', async () => {
  const db=await database();
  try {
    await asActor(db,artist,()=>db.exec(`update storage.objects set version='replacement-version', metadata='{"version":"replaced"}' where name='${mediaPath}'`));
    assert.equal((await db.query(`select version from storage.objects where name='${mediaPath}'`)).rows[0].version,'replacement-version');
    const migration=source('supabase/migrations/20260915065205_protect_referenced_media.sql');
    await db.exec(migration);await db.exec(migration);
    await db.exec(source('supabase/migrations/20260915082111_allow_artist_avatar_cleanup.sql'));
    // Reapplying the documented legacy owner policy bundle must not weaken the fix.
    await db.exec(source('supabase/storage-policies.sql'));
    const fresh=`${artist}/uploads/audio/new.wav`;
    const missing=`${artist}/uploads/previews/missing.mp3`;
    await db.exec(`update tracks set preview_file_path='${missing}' where id='${track}'`);
    await asActor(db,artist,async()=>{
      assert.equal((await db.query(`update storage.objects set metadata='{}' where name='${mediaPath}' returning name`)).rows.length,0);
      assert.equal((await db.query(`update storage.objects set name='${fresh}' where name='${mediaPath}' returning name`)).rows.length,0);
      assert.equal((await db.query(`delete from storage.objects where name='${mediaPath}' returning name`)).rows.length,0);
      await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values('track-previews','${missing}')`),/row-level security|Referenced track media/g);
      await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values('track-audio','${mediaPath}') on conflict(bucket_id,name) do update set metadata='{}'`),/row-level security|Referenced track media/g);
      await db.exec(`insert into storage.objects(bucket_id,name) values('track-previews','${fresh}')`);
      await assert.rejects(db.exec(`update storage.objects set name='${missing}' where name='${fresh}'`),/row-level security|Referenced track media/g);
      assert.equal((await db.query(`delete from storage.objects where name='${fresh}' returning name`)).rows.length,1);
      assert.equal((await db.query(`select name from storage.objects where name='${mediaPath}'`)).rows.length,1);
      await db.exec(`update tracks set status='archived' where id='${track}'`);
      assert.equal((await db.query(`delete from storage.objects where name='${mediaPath}' returning name`)).rows.length,0);
    });
    // A reference hidden by tracks RLS still blocks the object's owner.
    await db.exec(`update tracks set artist_user_id='${other}', status='draft' where id='${track}'`);
    await asActor(db,artist,async()=>{
      assert.equal((await db.query(`select id from tracks where id='${track}'`)).rows.length,0);
      assert.equal((await db.query(`update storage.objects set metadata='{}' where name='${mediaPath}' returning name`)).rows.length,0);
    });
    // A saved upsert token redeems as privileged Storage after review. Simulate
    // both its permission probe and its final version commit with BYPASSRLS.
    for (const role of ['service_role', 'authenticated']) {
      await asActor(db, admin, async () => {
        await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name,version) values('track-audio','${mediaPath}','replayed-version') on conflict(bucket_id,name) do update set version=excluded.version`), /Referenced track media/);
        await assert.rejects(db.exec(`update storage.objects set version='replayed-version' where name='${mediaPath}'`), /Referenced track media/);
        await assert.rejects(db.exec(`delete from storage.objects where name='${mediaPath}'`), /Referenced track media/);
        await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name,version) values('track-previews','${missing}','late-first-upload')`), /Referenced track media/);
      }, role);
    }
    await asActor(db,admin,()=>db.exec(`update storage.objects set metadata='{"admin":true}' where name='${mediaPath}'`));
    assert.equal((await db.query(`select metadata from storage.objects where name='${mediaPath}'`)).rows[0].metadata.admin,true);
    await asActor(db,artist,()=>db.exec(`update storage.objects set metadata='{"service":true}' where name='${mediaPath}'`),'service_role');
    assert.equal((await db.query(`select metadata from storage.objects where name='${mediaPath}'`)).rows[0].metadata.service,true);
  } finally {await db.close();}
});

test('PostgreSQL: absolute and encoded Storage URL references protect approved previews', async () => {
  const db = await database();
  const draftId = '55555555-5555-4555-8555-555555555555';
  try {
    await db.exec(source('supabase/migrations/20260915065205_protect_referenced_media.sql'));
    const object = `${artist}/uploads/previews/take é 1.mp3`;
    const encoded = object.split('/').map(encodeURIComponent).join('/');
    const urls = [
      `https://project.supabase.co/storage/v1/object/public/track-previews/${encoded}`,
      `https://project.supabase.co/storage/v1/object/sign/track-previews/${encoded}?token=synthetic`,
      `https://project.supabase.co/storage/v1/object/authenticated/track-previews/${encoded}`,
      `https://media.example.test/storage/v1/render/image/public/track-previews/${encoded}?width=200#ignored`,
      `https://project.supabase.co/storage/v1/object/track-previews/${encoded}`,
      `https://project.supabase.co/storage/v1/object/public/track-previews/${artist}/uploads/%2e/previews/take%20%C3%A9%201.mp3`,
      `https://project.supabase.co/storage/v1/object/public/track-previews/${encodeURIComponent(object)}`,
      `https://project.supabase.co/storage/v1/object/public/track-previews/${artist}/uploads/unused/../previews/take%20%C3%A9%201.mp3`
    ];
    await asActor(db, artist, () => db.exec(`insert into storage.objects(bucket_id,name,version) values('track-previews','${object}','reviewed')`));
    for (const reference of urls) {
      await db.exec(`update tracks set status='draft', approved_at=null, approved_by=null where id='${draftId}'`);
      await asActor(db, artist, () => db.query(`update tracks set preview_file_path=$1,status='pending_review' where id=$2`,[reference,draftId]));
      await asActor(db, admin, () => db.exec(`update tracks set status='approved' where id='${draftId}'`));
      await asActor(db, artist, async () => {
        assert.equal((await db.query(`update storage.objects set version='modified' where name=$1 returning name`,[object])).rows.length,0,reference);
        assert.equal((await db.query(`delete from storage.objects where name=$1 returning name`,[object])).rows.length,0,reference);
        assert.equal((await db.query(`select name from storage.objects where name=$1`,[object])).rows.length,1);
      });
      await asActor(db, admin, () => assert.rejects(db.query(`update storage.objects set version='privileged-replay' where name=$1`,[object]), /Referenced track media/), 'service_role');
      assert.equal((await db.query(`select status from tracks where id='${draftId}'`)).rows[0].status,'approved');
    }
  } finally { await db.close(); }
});


test('PostgreSQL: URL parsing preserves literal object names and tolerates malformed references', async () => {
  const db = await database();
  try {
    await db.exec(source('supabase/migrations/20260915065205_protect_referenced_media.sql'));
    for (const path of ['owner/uploads/take%201.mp3', 'owner/uploads//take.mp3', 'owner/uploads/../take.mp3']) {
      const raw = (await db.query('select security_private.track_asset_object_names($1) as names', [path])).rows[0].names;
      assert.ok(raw.includes(path));
      const url = `https://example.test/storage/v1/object/public/track-previews/${encodeURIComponent(path)}`;
      const decoded = (await db.query('select security_private.track_asset_object_names($1) as names', [url])).rows[0].names;
      assert.ok(decoded.includes(path));
    }
    for (const malformed of ['%FF', '%00', '%C3']) {
      assert.equal((await db.query('select security_private.track_asset_object_names($1) as names', [`https://example.test/storage/v1/object/public/track-previews/${malformed}`])).rows[0].names, null);
    }
  } finally { await db.close(); }
});
