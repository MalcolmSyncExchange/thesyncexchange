import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Track Detail is read-first and preserves the explicit compatibility editor", async () => {
  const [detailRoute, detailView, editRoute] = await Promise.all([
    source("app/(app)/artist/tracks/[slug]/page.tsx"),
    source("components/artist/tracks/artist-track-detail.tsx"),
    source("app/(app)/artist/tracks/[slug]/edit/page.tsx")
  ]);

  assert.match(detailRoute, /getArtistTrackDetail/);
  assert.doesNotMatch(detailRoute, /SubmitMusicForm|AudioPlayer/);
  assert.match(detailView, /\/artist\/tracks\/\$\{track\.slug\}\/edit/);
  assert.match(editRoute, /getArtistTrackBySlug/);
  assert.match(editRoute, /SubmitMusicForm/);
  assert.match(editRoute, /Compatibility editor/);
});

test("Track Detail retains every frozen tab and truthful deferred states", async () => {
  const detailView = await source("components/artist/tracks/artist-track-detail.tsx");
  for (const tab of ["Overview", "Audio & Assets", "Rights & Splits", "Licensing", "Activity", "Analytics"]) {
    assert.match(detailView, new RegExp(tab.replace(/[&]/g, "\\&")));
  }
  assert.match(detailView, /Track activity is not available yet/);
  assert.match(detailView, /Analytics starts after instrumentation is enabled/);
  assert.match(detailView, /No zeroes are being inferred/);
  for (const fabricated of ["Preview starts", "Conversion rate", "Gross revenue", "$0 revenue"]) {
    assert.equal(detailView.includes(fabricated), false);
  }
});

test("Recording and Composition rights remain distinct and unavailable without authoritative data", async () => {
  const detailView = await source("components/artist/tracks/artist-track-detail.tsx");
  assert.match(detailView, /Recording \(Master\) rights/);
  assert.match(detailView, /Composition \(Publishing\) rights/);
  assert.match(detailView, /does not establish Recording or Composition completeness/);
  assert.match(detailView, /Not a readiness decision/);
  assert.doesNotMatch(detailView, /100% complete|Rights complete/);
});

test("Artist Track Detail and Buyer Preview both enforce an artist session and owner-scoped query", async () => {
  const [detailRoute, previewRoute, queries] = await Promise.all([
    source("app/(app)/artist/tracks/[slug]/page.tsx"),
    source("app/(app)/artist/tracks/[slug]/preview/page.tsx"),
    source("services/artist/queries.ts")
  ]);

  for (const route of [detailRoute, previewRoute]) assert.match(route, /requireSession\("artist"\)/);
  assert.match(previewRoute, /getArtistTrackBuyerPreview/);
  assert.match(queries, /requireAccountScope\("artist", userId\)/);
  assert.match(queries, /\.eq\("artist_user_id", userId\)\.eq\("slug", slug\)\.maybeSingle\(\)/);
  assert.equal((queries.match(/\.eq\("artist_user_id", userId\)/g) || []).length >= 3, true);
});

test("foreign slugs are not disclosed and preview routes cannot fall back to broad track lookup", async () => {
  const queries = await source("services/artist/queries.ts");
  const previewRoute = await source("app/(app)/artist/tracks/[slug]/preview/page.tsx");

  assert.match(queries, /if \(!trackResult\.data\) return null/);
  assert.match(previewRoute, /if \(!data\) notFound\(\)/);
  assert.doesNotMatch(queries, /\.eq\("slug", slug\)\.maybeSingle\(\)[\s\S]*serviceRole/);
  assert.doesNotMatch(previewRoute, /createServiceRoleClient|SUPABASE_SERVICE_ROLE_KEY/);
});

test("Buyer Preview is a dedicated buyer-safe rendering rather than an internal Track Detail mask", async () => {
  const previewView = await source("components/artist/tracks/artist-track-buyer-preview.tsx");
  assert.match(previewView, /Buyer Preview/);
  assert.match(previewView, /Exit Preview/);
  assert.match(previewView, /only buyer-visible track information/);
  assert.doesNotMatch(previewView, /Business|Finance|Activity|admin|moderation|email|Full Master/);
});

test("responsive tabs provide keyboard navigation and semantic relationships", async () => {
  const tabs = await source("components/ui/responsive-tabs.tsx");
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) assert.match(tabs, new RegExp(key));
  for (const attribute of ["role=\"tablist\"", "role=\"tab\"", "aria-selected", "aria-controls", "role=\"tabpanel\"", "aria-labelledby"]) {
    assert.match(tabs, new RegExp(attribute));
  }
});
