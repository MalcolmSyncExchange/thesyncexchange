import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getArtistTrackPresentationStatus } from "../lib/artist-track-presentation.ts";

const status = (name, eligible = false) => ({
  status: name,
  statusLabel: { approved: "Approved", draft: "Draft", pending_review: "In review", rejected: "Changes requested", archived: "Archived" }[name],
  buyerVisibility: { eligible }
});

test("review state and Buyer visibility stay independent across the supported track lifecycle", () => {
  assert.deepEqual(getArtistTrackPresentationStatus(status("approved", true)), {
    label: "Discoverable", tone: "success", visibility: "Review approved · visible in Discover"
  });
  assert.deepEqual(getArtistTrackPresentationStatus(status("approved", false)), {
    label: "Approved", tone: "info", visibility: "Buyer visibility: Needs attention"
  });
  for (const [name, label, tone] of [
    ["draft", "Draft", "neutral"],
    ["pending_review", "In review", "info"],
    ["rejected", "Changes requested", "warning"],
    ["archived", "Archived", "neutral"]
  ]) {
    assert.deepEqual(getArtistTrackPresentationStatus(status(name)), {
      label, tone, visibility: "Buyer visibility: Not discoverable"
    });
  }
});

test("Slice B presentation adds no mutation or private-data route", async () => {
  const [catalog, detail, statusView, fixture] = await Promise.all([
    readFile(new URL("../components/artist/catalog/artist-catalog-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/artist/tracks/artist-track-detail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/artist/tracks/artist-track-status.tsx", import.meta.url), "utf8"),
    readFile(new URL("./fixtures/visual-slice-b-page.tsx.fixture", import.meta.url), "utf8")
  ]);
  for (const view of [catalog, detail, statusView]) {
    assert.doesNotMatch(view, /serviceRole|SUPABASE_SERVICE_ROLE_KEY|Full Master.*href|purchase-assets/);
  }
  assert.match(detail, /\/artist\/tracks\/\$\{track\.slug\}\/preview/);
  assert.match(detail, /PreviewAudioButton/);
  assert.doesNotMatch(detail, /previewProgress/);
  assert.match(catalog, /data\.counts\.total === 0 && !data\.query && data\.status === "all"/);
  assert.match(fixture, /env\.demoMode \|\| process\.env\.NODE_ENV !== "development"/);
  assert.doesNotMatch(fixture, /requireSession|createServiceRoleClient/);
});
