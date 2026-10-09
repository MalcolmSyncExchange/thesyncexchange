import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("first-use panels use only existing authorized empty state and real routes", async () => {
  const [artist, catalog, discovery, purchases, buyerDashboard] = await Promise.all([
    source("components/artist/artist-dashboard.tsx"),
    source("components/artist/catalog/artist-catalog-view.tsx"),
    source("components/catalog/buyer-catalog-browser.tsx"),
    source("components/orders/purchase-workspace.tsx"),
    source("app/(app)/buyer/dashboard/page.tsx"),
  ]);
  assert.match(artist, /summary\.total === 0 && tracks\.length === 0/);
  assert.match(catalog, /data\.counts\.total === 0 && !data\.query && data\.status === "all"/);
  assert.match(discovery, /if \(tracks\.length === 0\)/);
  assert.match(purchases, /!data\.items\.length && !filtered && !data\.nextCursor/);
  assert.match(buyerDashboard, /catalogCount === 0 && favorites\.length === 0 && orders\.length === 0/);
  for (const component of [artist, catalog, discovery, purchases, buyerDashboard]) {
    assert.match(component, /FirstUseState/);
    assert.doesNotMatch(component, /sample (track|purchase)|fake (track|purchase|metric)/i);
  }
  assert.match(artist, /href="\/artist\/submit"/);
  assert.match(catalog, /href="\/artist\/submit"/);
  assert.match(purchases, /href="\/buyer\/catalog"/);
});

test("filtered empty remains separate and protected routes keep server role gates", async () => {
  const [catalog, discovery, purchases, artistPage, buyerPage, buyerDashboard] = await Promise.all([
    source("components/artist/catalog/artist-catalog-view.tsx"),
    source("components/catalog/buyer-catalog-browser.tsx"),
    source("components/orders/purchase-workspace.tsx"),
    source("app/(app)/artist/catalog/page.tsx"),
    source("app/(app)/buyer/catalog/page.tsx"),
    source("app/(app)/buyer/dashboard/page.tsx"),
  ]);
  assert.match(catalog, /No tracks match this view/);
  assert.match(discovery, /No tracks match your search/);
  assert.match(discovery, /Reset search and filters/);
  assert.match(purchases, /No purchases match this view/);
  assert.match(purchases, /Clear filters/);
  assert.match(artistPage, /requireSession\("artist"\)/);
  assert.match(buyerPage, /requireSession\("buyer"\)/);
  assert.match(buyerDashboard, /requireSession\("buyer"\)/);
});

test("first-use system has responsive layouts, focus, and semantic steps", async () => {
  const [view, css] = await Promise.all([
    source("components/ui/first-use-state.tsx"),
    source("components/ui/first-use-state.module.css"),
  ]);
  assert.match(view, /<section/);
  assert.match(view, /<h2>/);
  assert.match(view, /<ol>/);
  assert.match(css, /max-width: 760px/);
  assert.match(css, /max-width: 500px/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /:focus-visible/);
});
