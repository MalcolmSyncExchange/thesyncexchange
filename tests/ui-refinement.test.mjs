import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("homepage uses the latest approved messaging overlay", () => {
  const source = read("components/marketing/homepage.tsx");
  const styles = read("components/marketing/homepage.module.css");

  assert.match(source, /Music Licensing Marketplace/);
  assert.match(source, /titleCaseEyebrow/);
  assert.match(styles, /\.titleCaseEyebrow \{ text-transform: none; \}/);
  assert.match(source, /Find it\. Clear it\. License it\./);
  assert.match(source, /Know what is offered before you move forward/);
  assert.match(source, /heroMedia/);
  assert.match(source, /sizes="100vw"/);
  assert.match(source, /sync-sound-sculpture-hero\.webp/);
  assert.match(source, /sync-sound-sculpture-hero-mobile\.webp/);
  assert.match(source, /sync-sound-sculpture-hero-mobile-400\.webp/);
  assert.match(source, /media="\(max-width: 700px\)"/);
  assert.doesNotMatch(source, /Music to start with|Independent artists\. Distinctive tracks\./);
  assert.doesNotMatch(styles, /\.feature|\.photo/);
  assert.match(styles, /min-height: clamp\(680px, 76vh, 780px\)/);
  assert.match(styles, /animation-timeline: scroll\(root block\)/);
  assert.match(styles, /@media\(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /scale\(1\.008\)/);
  assert.match(styles, /scale\(1\.018\)/);
  assert.doesNotMatch(source, /license posture|operational readiness|institutional polish/i);
});

test("homepage hero uses the native ultrawide quality asset", () => {
  const heroPath = path.join(root, "public/images/sync-sound-sculpture-hero.webp");
  const hero = fs.readFileSync(heroPath);

  assert.equal(hero.toString("ascii", 0, 4), "RIFF");
  assert.equal(hero.toString("ascii", 8, 12), "WEBP");
  assert.equal(hero.readUInt16LE(26) & 0x3fff, 1942);
  assert.equal(hero.readUInt16LE(28) & 0x3fff, 809);
  assert.ok(hero.byteLength >= 200_000);
  assert.equal(fs.existsSync(path.join(root, "public/images/sync-sound-sculpture.webp")), false);
});

test("homepage hero uses a separate native mobile crop", () => {
  const heroPath = path.join(root, "public/images/sync-sound-sculpture-hero-mobile.webp");
  const hero = fs.readFileSync(heroPath);

  assert.equal(hero.toString("ascii", 0, 4), "RIFF");
  assert.equal(hero.toString("ascii", 8, 12), "WEBP");
  assert.equal(hero.readUInt16LE(26) & 0x3fff, 800);
  assert.equal(hero.readUInt16LE(28) & 0x3fff, 809);
  assert.ok(hero.byteLength >= 95_000);

  const compactPath = path.join(root, "public/images/sync-sound-sculpture-hero-mobile-400.webp");
  const compact = fs.readFileSync(compactPath);
  assert.equal(compact.readUInt16LE(26) & 0x3fff, 400);
  assert.equal(compact.readUInt16LE(28) & 0x3fff, 404);
  assert.ok(compact.byteLength < hero.byteLength);
});

test("homepage hero can request the high-quality optimized image tier", () => {
  const config = read("next.config.mjs");
  const source = read("components/marketing/homepage.tsx");

  assert.match(config, /qualities: \[75, 90\]/);
  assert.match(source, /quality=\{90\}/);
  assert.match(source, /fetchPriority="high"/);
  assert.doesNotMatch(source, /\bpriority\b/);
});

test("cursor glow diameter is half of the approved baseline", () => {
  const source = read("components/layout/brand-cursor.module.css");

  assert.match(source, /width: 140px; height: 140px; left: -70px; top: -70px/);
  assert.doesNotMatch(source, /width: 280px|height: 280px/);
});

test("theme choice uses one persistent key across the root application", () => {
  const provider = read("components/layout/theme-provider.tsx");
  const rootLayout = read("app/layout.tsx");

  assert.match(provider, /storageKey="theme"/);
  assert.match(provider, /attribute="class"/);
  assert.match(rootLayout, /<ThemeProvider>/);
});

test("shared controls expose pointer and focus cues", () => {
  const globalCss = read("app/globals.css");
  const button = read("components/ui/button.tsx");
  const select = read("components/ui/select.tsx");

  assert.match(globalCss, /:focus-visible/);
  assert.match(globalCss, /cursor: pointer/);
  assert.match(button, /cursor-pointer/);
  assert.match(select, /cursor-pointer/);
  assert.match(select, /focus-visible:ring-2/);
});

test("About explains the approved problem, product path, and both sides", () => {
  const source = read("app/(marketing)/about/page.tsx");

  for (const label of ["Music licensing has too many disconnected steps", "Find it.", "Clear it.", "License it.", "Built for both sides"]) {
    assert.match(source, new RegExp(label));
  }
});
