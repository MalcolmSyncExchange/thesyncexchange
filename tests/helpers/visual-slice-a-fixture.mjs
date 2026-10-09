import fs from "node:fs/promises";
import path from "node:path";

const directory = path.resolve("app/visual-slice-a-fixture-local");
const template = path.resolve("tests/fixtures/visual-slice-a-page.tsx.fixture");
let created = false;

export async function createVisualSliceAFixture() {
  const host = new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:3000").hostname;
  if (process.env.SYNC_EXCHANGE_DEMO_MODE !== "true" || !["localhost", "127.0.0.1"].includes(host)) {
    throw new Error("Visual Slice A fixtures require explicit local demo mode.");
  }
  await fs.mkdir(directory); // Refuse to overwrite a real route.
  created = true;
  await fs.copyFile(template, path.join(directory, "page.tsx"));
}

export async function removeVisualSliceAFixture() {
  if (created) await fs.rm(directory, { recursive: true, force: true });
  created = false;
}
