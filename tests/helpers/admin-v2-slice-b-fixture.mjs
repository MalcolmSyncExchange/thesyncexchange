import fs from "node:fs/promises";
import path from "node:path";

const directory = path.resolve("app/v2-admin-slice-b-fixture-local");
const template = path.resolve("tests/fixtures/admin-v2-slice-b-page.tsx.fixture");
let created = false;

export async function createAdminV2SliceBFixture() {
  const host = new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:3000").hostname;
  if (process.env.SYNC_EXCHANGE_DEMO_MODE !== "true" || !["localhost", "127.0.0.1"].includes(host)) {
    throw new Error("Admin V2 Slice B fixture requires explicit localhost demo mode.");
  }
  await fs.mkdir(directory);
  created = true;
  await fs.copyFile(template, path.join(directory, "page.tsx"));
}

export async function removeAdminV2SliceBFixture() {
  if (created) await fs.rm(directory, { recursive: true, force: true });
  created = false;
}
