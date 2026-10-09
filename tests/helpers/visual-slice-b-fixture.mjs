import fs from "node:fs/promises";
import path from "node:path";

const route = path.resolve("app/visual-slice-b-fixture-local");
const artwork = path.resolve("public/visual-slice-b-fixture-local");
const source = path.resolve("tests/fixtures/visual-slice-b-page.tsx.fixture");
const approvedArtwork = "/Users/malcolmw/.codex/visualizations/2026/09/15/01a0a3ae-ce76-79f1-945c-a89443f1fd83/beta-product-phase-2/prototype/public/assets/artwork/midnight-run.png";
let created = false;

export async function createVisualSliceBFixture() {
  const host = new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:3000").hostname;
  if (process.env.SYNC_EXCHANGE_DEMO_MODE !== "true" || !["localhost", "127.0.0.1"].includes(host)) {
    throw new Error("Visual Slice B fixtures require explicit localhost demo mode.");
  }
  await fs.mkdir(route); // Refuse to overwrite a real route.
  created = true;
  await fs.mkdir(artwork);
  await fs.copyFile(source, path.join(route, "page.tsx"));
  await fs.copyFile(approvedArtwork, path.join(artwork, "midnight-run.png"));
}

export async function removeVisualSliceBFixture() {
  if (created) {
    await fs.rm(route, { recursive: true, force: true });
    await fs.rm(artwork, { recursive: true, force: true });
  }
  created = false;
}
