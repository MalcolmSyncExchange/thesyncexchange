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
  assert.doesNotMatch(source, /Music to start with|Independent artists\. Distinctive tracks\./);
  assert.doesNotMatch(styles, /\.feature|\.photo/);
  assert.match(styles, /min-height: clamp\(680px, 76vh, 780px\)/);
  assert.match(styles, /animation-timeline: scroll\(root block\)/);
  assert.match(styles, /@media\(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(source, /license posture|operational readiness|institutional polish/i);
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
