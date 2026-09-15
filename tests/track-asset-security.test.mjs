import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function load(path, mocks = {}) {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(code, {
    module: loadedModule, exports: loadedModule.exports, FormData, Error, console,
    require: (name) => name in mocks ? mocks[name] : require(name)
  }, { filename: path });
  return loadedModule.exports;
}

const artistA = "11111111-1111-4111-8111-111111111111";
const artistB = "22222222-2222-4222-8222-222222222222";
const trackId = "33333333-3333-4333-8333-333333333333";
const fileId = "44444444-4444-4444-8444-444444444444";
const config = { hasSupabaseEnv: true, env: {
  demoMode: false, coverArtBucket: "cover-art", trackAudioBucket: "track-audio",
  trackPreviewsBucket: "track-previews", avatarsBucket: "avatars", agreementsBucket: "agreements",
  supabaseUrl: "https://example.invalid"
} };
const storage = load("lib/storage.ts", { "@/lib/env": config });
const schema = load("lib/validation/track-submission.ts");
const pathFor = (kind, owner = artistA) => {
  const folders = { "cover-art": "cover-art", audio: "audio", preview: "previews", waveform: "waveforms" };
  const extensions = { "cover-art": "png", audio: "wav", preview: "mp3", waveform: "json" };
  return `${owner}/draft-${trackId}/${folders[kind]}/1770000000000-${fileId}.${extensions[kind]}`;
};
const snapshot = () => ({
  id: trackId, artist_user_id: artistA, title: "Test track", slug: "test-track", status: "draft",
  cover_art_path: pathFor("cover-art"), audio_file_path: pathFor("audio"),
  preview_file_path: pathFor("preview"), waveform_path: pathFor("waveform")
});

function harness(options = {}) {
  const events = [];
  const current = options.track === undefined ? snapshot() : options.track;
  const user = options.user === undefined ? { id: artistA, email: "artist@example.invalid" } : options.user;
  const role = options.role === undefined ? "artist" : options.role;
  const client = {
    auth: { getUser: async () => { events.push({ op: "auth" }); return { data: { user }, error: options.authError }; } },
    from(table) {
      let operation = "select", values;
      const filters = {};
      const result = () => {
        events.push({ table, op: operation, values, filters: { ...filters } });
        if (options.failTable === table && operation !== "select") return { data: null, error: { message: "Synthetic mutation failure" } };
        if (table === "user_profiles") return { data: role ? { role } : null, error: options.roleError };
        if (table === "tracks") return {
          data: operation === "insert" ? { id: trackId } : filters.slug ? null : current,
          error: options.trackError
        };
        if (table === "license_types") return { data: ["digital-campaign", "broadcast", "exclusive-buyout"].map((slug) => ({ id: slug, slug })), error: null };
        return { data: [], error: null };
      };
      const q = {
        select() { return q; }, eq(key, value) { filters[key] = value; return q; }, in() { return q; },
        insert(value) { operation = "insert"; values = value; return q; },
        update(value) { operation = "update"; values = value; return q; },
        delete() { operation = "delete"; return q; },
        single: async () => result(), maybeSingle: async () => result(),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); }
      };
      return q;
    },
    storage: { from(bucket) { return {
      async info(path) { events.push({ op: "info", bucket, path }); return { data: options.missingObject ? null : { id: fileId }, error: options.infoError }; },
      async createSignedUrl(path) { events.push({ op: "sign", bucket, path }); return { data: { signedUrl: "https://example.invalid/signed" }, error: options.signError }; },
      async remove(paths) { events.push({ op: "remove", bucket, paths }); return { error: null }; }
    }; } }
  };
  const mocks = {
    "server-only": {}, "@/lib/storage": storage, "@/lib/validation/track-submission": schema,
    "@/services/supabase/server": { createServerSupabaseClient: async () => client },
    "@/services/supabase/privileged": { createPrivilegedSupabaseClient: async () => { events.push({ op: "privileged" }); return client; } }
  };
  const assets = load("services/storage/track-assets.ts", mocks);
  const server = load("services/storage/server.ts", { ...mocks, "@/services/storage/track-assets": assets });
  let parsed = 0;
  const actions = load("services/tracks/actions.ts", {
    ...mocks, "@/lib/env": options.demo ? { ...config, env: { ...config.env, demoMode: true } } : config,
    "@/lib/utils": { slugify: () => "test-track" }, "next/cache": { revalidatePath() {} },
    "@/services/storage/track-assets": assets, "@/services/storage/server": server,
    "@/services/supabase/admin": { createAdminSupabaseClient: () => client },
    "@/services/auth/user-profiles": { selectUserProfileCompat: async () => ({ data: role ? { role } : null, error: options.roleError }) },
    "@/lib/validation/track-submission": { ...schema, parseTrackSubmissionFormData(data) { parsed++; return schema.parseTrackSubmissionFormData(data); } }
  });
  return { assets, actions, server, client, events, parsed: () => parsed };
}

function form(overrides = {}) {
  const values = {
    title: "Test track", description: "A synthetic track for isolated security tests.", genre: "Electronic",
    subgenre: "Ambient", moods: "Calm", bpm: "120", key: "Am", duration: "180", releaseYear: "2026",
    priceDigital: "1200", priceBroadcast: "4800", priceExclusive: "18000", saveMode: "publish",
    rightsHolders: JSON.stringify([{ name: "Owner", email: "artist@example.invalid", roleType: "owner", ownershipPercent: 100 }]),
    coverArtPath: pathFor("cover-art"), audioFilePath: pathFor("audio"),
    previewFilePath: pathFor("preview"), waveformPath: pathFor("waveform"),
    uploadedAssets: JSON.stringify([
      { bucket: "track-audio", path: pathFor("audio", artistB) },
      { bucket: "cover-art", path: pathFor("cover-art", artistB) }
    ]), trackId, existingSlug: "test-track", ...overrides
  };
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
const noDelete = (h) => assert.equal(h.events.filter((event) => event.op === "remove").length, 0);
const noWrite = (h) => assert.equal(h.events.filter((event) => ["insert", "update", "delete"].includes(event.op)).length, 0);

for (const options of [{ user: null }, { role: "buyer" }, { role: "admin" }, { role: null }, { authError: {} }, { roleError: {} }, { demo: true }]) {
  test(`both actions reject untrusted authorization before parsing/cleanup: ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    for (const action of [h.actions.submitTrackAction, h.actions.updateTrackAction]) {
      assert.equal((await action({}, form({ uploadedAssets: "malformed" }))).success, false);
    }
    assert.equal(h.parsed(), 0); noWrite(h); noDelete(h);
  });
}

for (const track of [null, { ...snapshot(), artist_user_id: artistB }]) {
  test(`missing/foreign update denies before parsing or related reads: ${track?.artist_user_id || "missing"}`, async () => {
    const h = harness({ track });
    assert.equal((await h.actions.updateTrackAction({}, form())).success, false);
    assert.equal(h.parsed(), 0); noWrite(h); noDelete(h);
    assert.ok(!h.events.some((event) => ["rights_holders", "track_license_options"].includes(event.table)));
  });
}

for (const [field, kind] of [["audioFilePath", "audio"], ["coverArtPath", "cover-art"], ["previewFilePath", "preview"], ["waveformPath", "waveform"]]) {
  test(`foreign ${field} is rejected on create/update without deletion`, async () => {
    for (const actionName of ["submitTrackAction", "updateTrackAction"]) {
      const h = harness();
      assert.equal((await h.actions[actionName]({}, form({ [field]: pathFor(kind, artistB) }))).success, false);
      noWrite(h); noDelete(h);
    }
  });
}

test("strict path/bucket validation rejects malformed inputs before storage access", async () => {
  const h = harness(), path = pathFor("audio");
  const paths = ["", `https://example.invalid/${path}`, `/${path}`, path.replace("/audio/", "\\audio/"),
    path.replace("/audio/", "/./"), path.replace("/audio/", "/../"), path.replace("/audio/", "//"),
    path.replace("/audio/", "/previews/"), path.replace("draft-", "%2e%2e"), `${path}?x=1`, `${path}\n`,
    path.replace(artistA, `${artistA}extra`), path.replace(".wav", ".exe")];
  for (const bad of paths) await assert.rejects(h.assets.verifyTrackAssetExists(h.client, artistA, "audio", { bucket: "track-audio", path: bad }));
  for (const bucket of ["cover-art", "track-previews", "avatars", "agreements"]) {
    await assert.rejects(h.assets.verifyTrackAssetExists(h.client, artistA, "audio", { bucket, path }));
  }
  assert.equal(h.events.length, 0);
});

test("malformed client asset JSON fails without cleanup, even for an authorized artist", async () => {
  for (const actionName of ["submitTrackAction", "updateTrackAction"]) {
    const h = harness();
    assert.equal((await h.actions[actionName]({}, form({ uploadedAssets: "not json" }))).success, false);
    noWrite(h); noDelete(h);
  }
});

test("missing update identifiers and database read failures never reach cleanup or parsing", async () => {
  for (const options of [{}, { trackError: {} }]) {
    const h = harness(options);
    assert.equal((await h.actions.updateTrackAction({}, form(options.trackError ? {} : { trackId: "" }))).success, false);
    assert.equal(h.parsed(), 0); noWrite(h); noDelete(h);
  }
});

test("retaining a legacy foreign reference does not authorize signing or deletion", async () => {
  const h = harness({ track: { ...snapshot(), audio_file_path: pathFor("audio", artistB) } });
  const data = form(); data.delete("audioFilePath");
  assert.equal((await h.actions.updateTrackAction({}, data)).success, true);
  assert.equal(h.events.filter((event) => event.op === "info").length, 0);
  await assert.rejects(h.assets.signAuthorizedTrackAudio(trackId));
  noDelete(h);
  assert.ok(!h.events.some((event) => event.op === "sign"));
});

test("actual application-generated path layout passes for all four asset kinds", () => {
  const h = harness();
  for (const [kind, fileName] of [["audio", "test.wav"], ["cover-art", "art.png"], ["preview", "preview.mp3"], ["waveform", "wave.json"]]) {
    for (const scope of [`draft-${trackId}`, trackId, "uploads"]) {
      const path = storage.buildTrackAssetPath({ userId: artistA, scope, kind, fileName });
      assert.doesNotThrow(() => h.assets.validateTrackAssetPath(artistA, kind, { path, bucket: storage.getTrackAssetBucket(kind) }));
    }
  }
});

for (const options of [{ missingObject: true }, { infoError: {} }]) {
  test(`object verification fails closed: ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    assert.equal((await h.actions.submitTrackAction({}, form())).success, false);
    noWrite(h); noDelete(h);
  });
}

test("legitimate create verifies all four objects and ignores forged cleanup authority", async () => {
  const h = harness();
  assert.equal((await h.actions.submitTrackAction({}, form())).success, true);
  assert.equal(h.events.filter((event) => event.op === "info").length, 4);
  const firstWrite = h.events.findIndex((event) => event.op === "insert");
  assert.ok(h.events.slice(firstWrite).every((event) => event.op !== "info"));
  noDelete(h);
});

test("update retains omitted existing paths from database and checks only replacements", async () => {
  const h = harness(), data = form();
  for (const field of ["coverArtPath", "audioFilePath", "previewFilePath", "waveformPath"]) data.delete(field);
  const replacement = pathFor("audio").replace("1770000000000", "1770000000001");
  data.set("audioFilePath", replacement);
  assert.equal((await h.actions.updateTrackAction({}, data)).success, true);
  assert.equal(h.events.filter((event) => event.op === "info").length, 1);
  const update = h.events.find((event) => event.table === "tracks" && event.op === "update");
  assert.equal(update.values.cover_art_path, snapshot().cover_art_path);
  assert.equal(update.values.audio_file_path, replacement); noDelete(h);
});

for (const failTable of ["tracks", "rights_holders", "track_license_options"]) {
  test(`failed create/update (${failTable}) never removes claimed or superseded storage objects`, async () => {
    for (const actionName of ["submitTrackAction", "updateTrackAction"]) {
      const h = harness({ failTable });
      assert.equal((await h.actions[actionName]({}, form())).success, false); noDelete(h);
    }
  });
}

for (const options of [
  { user: null }, { role: "buyer" }, { role: null }, { authError: {} }, { roleError: {} },
  { track: { ...snapshot(), artist_user_id: artistB } },
  { track: { ...snapshot(), audio_file_path: pathFor("audio", artistB) } },
  { track: { ...snapshot(), audio_file_path: "https://example.invalid/foreign.wav" } },
  { track: { ...snapshot(), id: artistB } }, { trackError: {} }, { missingObject: true }, { infoError: {} }
]) {
  test(`private audio signing fails closed: ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    await assert.rejects(h.assets.signAuthorizedTrackAudio(trackId));
    assert.ok(!h.events.some((event) => event.op === "sign"));
  });
}

for (const role of ["artist", "admin"]) {
  test(`canonical ${role} can sign current authorized full audio without trusting caller paths`, async () => {
    const h = harness({ role, user: { id: role === "admin" ? artistB : artistA } });
    const result = await h.server.withTrackAudioAccess({ ...snapshot(), audio_file_path: pathFor("audio", artistB) }, "full");
    assert.equal(result.audio_file_url, "https://example.invalid/signed");
    const signed = h.events.find((event) => event.op === "sign");
    assert.equal(signed.path, snapshot().audio_file_path);
    assert.ok(h.events.findIndex((event) => event.table === "tracks") < h.events.findIndex((event) => event.op === "privileged"));
  });
}

test("even admin cannot sign a track with a foreign owner namespace", async () => {
  const h = harness({ role: "admin", track: { ...snapshot(), audio_file_path: pathFor("audio", artistB) } });
  await assert.rejects(h.assets.signAuthorizedTrackAudio(trackId));
  assert.ok(!h.events.some((event) => event.op === "privileged" || event.op === "sign"));
});

test("preview access, generic agreement signing and avatar cleanup are unchanged", async () => {
  const h = harness({ user: null });
  const preview = await h.server.withTrackAudioAccess(snapshot(), "preview");
  assert.ok(preview.audio_file_url.includes("/public/track-previews/"));
  assert.equal(h.events.length, 0);
  assert.equal(await h.server.createSignedStorageUrl({ bucket: "agreements", path: "order/license.pdf" }), "https://example.invalid/signed");
  await h.server.deleteStorageAssetsWithServerAccess([{ bucket: "avatars", path: "owner/profile/old.png" }]);
  assert.ok(h.events.some((event) => event.op === "remove" && event.bucket === "avatars"));
});

test("track actions contain no storage deletion path; signing uses only canonical database role", () => {
  const actions = source("services/tracks/actions.ts"), assets = source("services/storage/track-assets.ts");
  assert.doesNotMatch(actions, /cleanupUploadedAssets|buildSupersededTrackAssets|deleteStorageAssetsWithServerAccess|\.storage\s*\.|\.uploadedAssets/);
  assert.match(assets, /import "server-only"/);
  assert.doesNotMatch(assets + actions, /user_metadata|app_metadata/);
  assert.match(assets, /from\("user_profiles"\)\.select\("role"\)/);
});
