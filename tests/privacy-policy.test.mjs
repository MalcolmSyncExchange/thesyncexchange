import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function readProjectFile(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("/privacy route contains the production Privacy Policy heading and support contact", async () => {
  const source = await readProjectFile("app/(marketing)/privacy/page.tsx");

  assert.match(source, /title:\s*"Privacy Policy \| The Sync Exchange"/);
  assert.match(source, /description:\s*"Learn how The Sync Exchange collects, uses, protects, and shares information across its music licensing marketplace\."/);
  assert.match(source, /<h1[^>]*>Privacy Policy<\/h1>/);
  assert.match(source, /Last Updated: April 30, 2026/);
  assert.match(source, /Support@thesyncexchange\.com/);
  assert.match(source, /mailto:\$\{supportEmail\}/);
});

test("/privacy route does not contain the old placeholder copy", async () => {
  const source = await readProjectFile("app/(marketing)/privacy/page.tsx");

  assert.doesNotMatch(source, /launch copy is a navigable placeholder/i);
  assert.doesNotMatch(source, /Back To Settings/);
  assert.doesNotMatch(source, /The Sync Exchange uses account, catalog, checkout/);
});

test("global footer includes a Privacy Policy link to /privacy", async () => {
  const source = await readProjectFile("components/layout/site-footer.tsx");

  assert.match(source, /href:\s*"\/privacy"/);
  assert.match(source, /label:\s*"Privacy Policy"/);
});

test("buyer settings Legal section includes a Privacy Policy link", async () => {
  const source = await readProjectFile("components/buyer/buyer-settings-form.tsx");

  assert.match(source, /<CardTitle>Legal<\/CardTitle>/);
  assert.match(source, /<Link href="\/privacy">Privacy Policy<\/Link>/);
});
