import test from 'node:test';
import assert from 'node:assert/strict';
import { database, asActor, artist, other, admin, draft, source } from './helpers/security-db.mjs';

const buyer = '66666666-6666-4666-8666-666666666666';
const noProfile = '77777777-7777-4777-8777-777777777777';
const filename = '1770000000000-88888888-8888-4888-8888-888888888888.png';
const avatar = `${artist}/profile/${filename}`;
const mediaSql = source('supabase/migrations/20260915065205_protect_referenced_media.sql');
const avatarSql = source('supabase/migrations/20260915082111_allow_artist_avatar_cleanup.sql');
const insertObject = (db, bucket, name) => asActor(db, artist, () => db.query(
  "insert into storage.objects(bucket_id,name,version) values($1,$2,'initial')", [bucket, name]
), 'service_role');
const visible = (db, bucket, name) => db.query('select name from storage.objects where bucket_id=$1 and name=$2', [bucket, name]);
const remove = (db, bucket, name) => db.query('delete from storage.objects where bucket_id=$1 and name=$2 returning name', [bucket, name]);
async function applyGuards(db) {
  await db.exec(mediaSql);
  await db.exec(avatarSql);
}

test('PostgreSQL: zero-policy production baseline gains only canonical artist avatar SELECT/DELETE', async () => {
  const db = await database({ storagePolicies: 'none' });
  try {
    assert.equal((await db.query("select count(*)::int n from pg_policies where schemaname='storage' and tablename='objects'")).rows[0].n, 0);
    await insertObject(db, 'avatars', avatar);
    await asActor(db, artist, async () => {
      assert.equal((await visible(db, 'avatars', avatar)).rows.length, 0);
      assert.equal((await remove(db, 'avatars', avatar)).rows.length, 0);
    });
    await applyGuards(db);
    await db.exec(avatarSql); // Idempotent, without bootstrapping legacy owner policies.
    const policies = (await db.query("select cmd,permissive from pg_policies where schemaname='storage' and tablename='objects' order by cmd,permissive")).rows;
    assert.equal(policies.length, 5);
    assert.deepEqual(policies.filter(p => p.permissive === 'PERMISSIVE').map(p => p.cmd).sort(), ['DELETE', 'SELECT']);
    await db.query("insert into user_profiles(id,role) values($1,'buyer')", [buyer]);
    for (const actor of [other, buyer, admin, noProfile]) {
      await asActor(db, actor, async () => {
        assert.equal((await visible(db, 'avatars', avatar)).rows.length, 0);
        assert.equal((await remove(db, 'avatars', avatar)).rows.length, 0);
      });
    }
    await asActor(db, artist, async () => {
      assert.equal((await visible(db, 'avatars', avatar)).rows.length, 0);
      assert.equal((await remove(db, 'avatars', avatar)).rows.length, 0);
    }, 'anon');
    await asActor(db, artist, async () => {
      assert.equal((await visible(db, 'avatars', avatar)).rows.length, 1);
      await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('avatars',$1)", [`${artist}/profile/1770000000001-1770000000001.jpg`]), /row-level security/);
      assert.equal((await db.query("update storage.objects set version='changed' where name=$1 returning name", [avatar])).rows.length, 0);
      assert.equal((await db.query("update storage.objects set name=$1 where name=$2 returning name", [avatar.replace('.png', '.jpg'), avatar])).rows.length, 0);
      await assert.rejects(db.query("insert into storage.objects(bucket_id,name,version) values('avatars',$1,'changed') on conflict(bucket_id,name) do update set version=excluded.version", [avatar]), /row-level security/);
    });
    await db.query("update user_profiles set role='buyer' where id=$1", [artist]);
    await asActor(db, artist, async () => assert.equal((await remove(db, 'avatars', avatar)).rows.length, 0));
    await db.query("update user_profiles set role='artist' where id=$1", [artist]);
    await asActor(db, artist, async () => assert.equal((await remove(db, 'avatars', avatar)).rows.length, 1));
    assert.equal((await visible(db, 'avatars', avatar)).rows.length, 0); // Actual removal, not merely no error.
    const fallback = `${artist}/profile/1770000000000-1770000000000.webp`;
    await insertObject(db, 'avatars', fallback);
    await asActor(db, artist, async () => assert.equal((await remove(db, 'avatars', fallback)).rows.length, 1));
  } finally { await db.close(); }
});

test('PostgreSQL: legacy/forged avatar paths and other buckets never gain cleanup access', async () => {
  const db = await database({ storagePolicies: 'none' });
  try {
    await applyGuards(db);
    const paths = [
      avatar.replace(artist, other), `${artist}/profile/old-avatar.png`, `${artist}/profile/../${filename}`,
      `${artist}/profile/%2e%2e%2f${filename}`, `${artist}%2fprofile%2f${filename}`, `${artist}/profile/${filename}/extra`,
      `${artist}/audio/${filename}`, avatar.replace('/profile/', '\\profile\\'), `/${avatar}`,
      `https://example.invalid/${avatar}`, avatar.replace('.png', '.gif'), `${avatar}\n`, `${avatar}\r`, `${avatar} `
    ];
    for (const path of paths) {
      await insertObject(db, 'avatars', path);
      await asActor(db, artist, async () => {
        assert.equal((await visible(db, 'avatars', path)).rows.length, 0, path);
        assert.equal((await remove(db, 'avatars', path)).rows.length, 0, path);
      });
      assert.equal((await visible(db, 'avatars', path)).rows.length, 1);
    }
    for (const bucket of ['agreements', 'track-audio', 'track-previews', 'cover-art', 'avatar-alias']) {
      await insertObject(db, bucket, avatar);
      await asActor(db, artist, async () => {
        assert.equal((await visible(db, bucket, avatar)).rows.length, 0);
        assert.equal((await remove(db, bucket, avatar)).rows.length, 0);
      });
    }
    for (const actor of [admin, buyer, noProfile]) {
      const own = avatar.replace(artist, actor);
      await insertObject(db, 'avatars', own);
      await asActor(db, actor, async () => assert.equal((await remove(db, 'avatars', own)).rows.length, 0));
    }
  } finally { await db.close(); }
});

test('PostgreSQL: avatar permissions preserve all-role referenced media guard and trusted new-path workflows', async () => {
  const db = await database({ storagePolicies: 'none' });
  try {
    await applyGuards(db);
    const media = [
      ['track-audio', `${artist}/draft/audio/new.wav`, 'audio_file_path'],
      ['track-previews', `${artist}/draft/previews/new.mp3`, 'preview_file_path'],
      ['track-previews', `${artist}/draft/waveforms/new.json`, 'waveform_path'],
      ['cover-art', `${artist}/draft/cover-art/new.png`, 'cover_art_path']
    ];
    for (const [bucket, path, column] of media) {
      await insertObject(db, bucket, path); // Actual upload precedes reference persistence.
      await asActor(db, artist, async () => {
        assert.equal((await visible(db, bucket, path)).rows.length, 0);
        assert.equal((await remove(db, bucket, path)).rows.length, 0);
        await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [bucket, `${path}.other`]), /row-level security/);
      });
      await asActor(db, artist, () => db.query(`update tracks set ${column}=$1 where id=$2`, [path, draft]), 'service_role');
      for (const actor of [artist, admin]) {
        await asActor(db, actor, async () => {
          assert.equal((await remove(db, bucket, path)).rows.length, 0);
          assert.equal((await db.query("update storage.objects set version='attack' where bucket_id=$1 and name=$2 returning name", [bucket, path])).rows.length, 0);
        });
      }
      await asActor(db, artist, async () => {
        assert.equal((await visible(db, bucket, path)).rows.length, 1); // Signing/read metadata remains visible to trusted server.
        await assert.rejects(remove(db, bucket, path), /Referenced track media/);
        await assert.rejects(db.query("update storage.objects set version='replayed-token' where bucket_id=$1 and name=$2", [bucket, path]), /Referenced track media/);
        await assert.rejects(db.query("insert into storage.objects(bucket_id,name,version) values($1,$2,'replay') on conflict(bucket_id,name) do update set version=excluded.version", [bucket, path]), /Referenced track media/);
      }, 'service_role');
    }
    const temporary = `${artist}/draft/audio/unreferenced.wav`;
    await insertObject(db, 'track-audio', temporary);
    await asActor(db, artist, async () => assert.equal((await remove(db, 'track-audio', temporary)).rows.length, 1), 'service_role');
    const agreement = `${buyer}/orders/example/agreement.pdf`;
    await insertObject(db, 'agreements', agreement);
    await asActor(db, artist, async () => {
      await db.query("insert into storage.objects(bucket_id,name,version) values('agreements',$1,'retry') on conflict(bucket_id,name) do update set version=excluded.version", [agreement]);
      assert.equal((await visible(db, 'agreements', agreement)).rows.length, 1);
      assert.equal((await remove(db, 'agreements', agreement)).rows.length, 1); // Failed-persistence cleanup.
    }, 'service_role');
    // Cross-bucket matching remains conservative: the new avatar permission must
    // not let a forged track reference weaken either the RLS or privileged guard.
    await insertObject(db, 'avatars', avatar);
    await db.query('update tracks set cover_art_path=$1 where id=$2', [avatar, draft]);
    await asActor(db, artist, async () => {
      assert.equal((await visible(db, 'avatars', avatar)).rows.length, 1);
      assert.equal((await remove(db, 'avatars', avatar)).rows.length, 0);
    });
    await asActor(db, admin, () => assert.rejects(remove(db, 'avatars', avatar), /Referenced track media/), 'service_role');
    const missing = `${artist}/draft/audio/missing.wav`;
    await db.query('update tracks set audio_file_path=$1 where id=$2', [missing, draft]);
    await assert.rejects(insertObject(db, 'track-audio', missing), /Referenced track media/);
  } finally { await db.close(); }
});

test('PostgreSQL: avatar policy migration fails atomically without referenced-media guard', async () => {
  const db = await database({ storagePolicies: 'none' });
  try {
    await assert.rejects(db.exec(avatarSql), /Apply 20260915065205/);
    await db.exec('rollback');
    assert.equal((await db.query("select count(*)::int n from pg_policies where schemaname='storage' and tablename='objects'")).rows[0].n, 0);
  } finally { await db.close(); }
});
