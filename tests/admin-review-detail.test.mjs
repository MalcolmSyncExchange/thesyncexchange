import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function readProjectFile(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("admin track review detail renders submission verification sections", async () => {
  const source = await readProjectFile("app/(app)/admin/tracks/[id]/page.tsx");

  assert.match(source, /<CoverArtwork coverArtUrl=\{track\.cover_art_url\}/);
  assert.match(source, /<CardTitle>Rights Holders<\/CardTitle>/);
  assert.match(source, /<CardTitle>License Options<\/CardTitle>/);
  assert.match(source, /Total Ownership/);
  assert.match(source, /No active license options are configured for buyer checkout\./);
  assert.match(source, /Rights holder ownership totals/);
});

test("admin track mapper preserves track-level license option active state", async () => {
  const source = await readProjectFile("services/admin/queries.ts");

  assert.match(source, /active: option\.active !== false && license\.active !== false/);
});
