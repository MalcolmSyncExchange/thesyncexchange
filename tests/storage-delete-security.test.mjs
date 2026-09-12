import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const deleteRouteSource = readFileSync(new URL("../app/api/storage/delete/route.ts", import.meta.url), "utf8");
const postFunctionSource =
  deleteRouteSource.match(/export async function POST[\s\S]*?\nfunction validateArtistCleanupAsset/)?.[0] || "";
const validationFunctionSource =
  deleteRouteSource.match(/function validateArtistCleanupAsset[\s\S]*?\nfunction matchesTrackAssetPath/)?.[0] || "";
const referenceFunctionSource =
  deleteRouteSource.match(/async function isPersistedTrackAssetReference[\s\S]*?\nasync function deleteValidatedAssets/)?.[0] || "";
const deleteFunctionSource = deleteRouteSource.match(/async function deleteValidatedAssets[\s\S]*$/)?.[0] || "";

function indexOfOrFail(source, pattern, label) {
  const index = typeof pattern === "string" ? source.indexOf(pattern) : source.search(pattern);
  assert.notEqual(index, -1, `${label} was not found`);
  return index;
}

test("storage delete requires authentication and an artist role before cleanup", () => {
  const authIndex = indexOfOrFail(postFunctionSource, /if \(!user\?\.id\)/, "authentication guard");
  const roleIndex = indexOfOrFail(postFunctionSource, /profile\?\.role !== "artist"/, "artist role guard");
  const deleteIndex = indexOfOrFail(postFunctionSource, "deleteValidatedAssets", "storage deletion");

  assert.ok(authIndex < roleIndex, "authentication should be checked before role authorization");
  assert.ok(roleIndex < deleteIndex, "artist role authorization should happen before deletion");
  assert.doesNotMatch(postFunctionSource, /profile\?\.role === "admin"|isAdmin/);
});

test("storage delete allows only track upload buckets and rejects agreements avatars and arbitrary buckets", () => {
  assert.match(deleteRouteSource, /storageBuckets\.coverArt/);
  assert.match(deleteRouteSource, /storageBuckets\.trackPreviews/);
  assert.match(deleteRouteSource, /storageBuckets\.trackAudio/);
  assert.match(validationFunctionSource, /!cleanupBuckets\.has\(asset\.bucket\)/);
  assert.doesNotMatch(deleteRouteSource, /cleanupBuckets[\s\S]*storageBuckets\.agreements/);
  assert.doesNotMatch(deleteRouteSource, /cleanupBuckets[\s\S]*storageBuckets\.avatars/);
});

test("storage delete validates owner namespace and malformed paths before privileged deletion", () => {
  assert.match(validationFunctionSource, /isAbsoluteAssetReference\(asset\.path\)/);
  assert.match(validationFunctionSource, /asset\.path\.startsWith\("\/"\)/);
  assert.ok(validationFunctionSource.includes('asset.path.includes("\\\\")'));
  assert.match(validationFunctionSource, /segment === "\." \|\| segment === "\.\."/);
  assert.match(validationFunctionSource, /segments\[0\] !== userId/);
  assert.match(validationFunctionSource, /matchesTrackAssetPath\(segments, "cover-art"\)/);
  assert.match(validationFunctionSource, /matchesTrackAssetPath\(segments, "audio"\)/);
  assert.match(validationFunctionSource, /matchesTrackAssetPath\(segments, "previews"\)/);
  assert.match(validationFunctionSource, /matchesTrackAssetPath\(segments, "waveforms"\)/);
});

test("storage delete blocks persisted track assets before removing objects", () => {
  assert.match(referenceFunctionSource, /"cover_art_path"/);
  assert.match(referenceFunctionSource, /"audio_file_path"/);
  assert.match(referenceFunctionSource, /"preview_file_path", "waveform_path"/);
  assert.match(postFunctionSource, /if \(await isPersistedTrackAssetReference\(supabase, asset\)\)/);

  const validationIndex = indexOfOrFail(postFunctionSource, "validateArtistCleanupAsset", "path validation");
  const referenceIndex = indexOfOrFail(postFunctionSource, "isPersistedTrackAssetReference", "DB reference check");
  const deleteIndex = indexOfOrFail(postFunctionSource, "deleteValidatedAssets", "storage deletion");

  assert.ok(validationIndex < referenceIndex, "path validation should happen before DB reference checks");
  assert.ok(referenceIndex < deleteIndex, "DB reference checks should happen before deletion");
});

test("storage delete handles privileged storage deletion failures without a false success", () => {
  assert.match(deleteFunctionSource, /supabase\.storage\.from\(bucket\)\.remove\(uniquePaths\)/);
  assert.match(deleteFunctionSource, /if \(error\) \{/);
  assert.match(postFunctionSource, /const deletionError = await deleteValidatedAssets/);
  assert.match(postFunctionSource, /return NextResponse\.json\(\{ error: deletionError \}, \{ status: 500 \}\)/);
});

test("storage delete does not use metadata role authorization fallbacks", () => {
  assert.doesNotMatch(deleteRouteSource, /user_metadata\?\.role|user_metadata\.role/);
  assert.doesNotMatch(deleteRouteSource, /app_metadata\?\.role|app_metadata\.role/);
});
