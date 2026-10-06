import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getBuyerCatalogEligibility, isBuyerCatalogEligible } from "../lib/buyer-catalog-eligibility.ts";

const eligibility = (overrides = {}) => ({ status: "approved", previewAvailable: true, activeLicenseCount: 1, ...overrides });

test("buyer catalog eligibility has one truthful canonical derivation", () => {
  assert.equal(isBuyerCatalogEligible(eligibility()), true);
  assert.equal(getBuyerCatalogEligibility(eligibility()).label, "Discoverable");
  assert.equal(isBuyerCatalogEligible(eligibility({ previewAvailable: false })), false);
  assert.deepEqual(getBuyerCatalogEligibility(eligibility({ previewAvailable: false })).blockers, ["preview"]);
  assert.equal(isBuyerCatalogEligible(eligibility({ activeLicenseCount: 0 })), false);
  assert.deepEqual(getBuyerCatalogEligibility(eligibility({ activeLicenseCount: 0 })).blockers, ["license"]);
  assert.equal(getBuyerCatalogEligibility(eligibility({ status: "pending_review" })).label, "In review");
  assert.equal(getBuyerCatalogEligibility(eligibility({ status: "rejected" })).label, "Needs attention");
  assert.equal(getBuyerCatalogEligibility(eligibility({ status: "draft" })).label, "Not discoverable");
});

test("artist and buyer query layers share the canonical eligibility function", async () => {
  const [artistContract, buyerQuery] = await Promise.all([
    readFile(new URL("../services/artist/catalog-contract.ts", import.meta.url), "utf8"),
    readFile(new URL("../services/buyer/queries.ts", import.meta.url), "utf8")
  ]);
  assert.match(artistContract, /getBuyerCatalogEligibility/);
  assert.match(buyerQuery, /isBuyerCatalogEligible/);
  assert.doesNotMatch(buyerQuery, /Boolean\(track\.preview_file_path\)\s*&&\s*track\.license_options\.length/);
});

test("artist track lookup is owner scoped and no longer signs Full Master audio", async () => {
  const source = await readFile(new URL("../services/artist/queries.ts", import.meta.url), "utf8");
  assert.match(source, /\.eq\("artist_user_id", userId\)\.eq\("slug", slug\)\.maybeSingle\(\)/);
  assert.doesNotMatch(source, /withTrackAudioAccess/);
  assert.doesNotMatch(source, /signAuthorizedTrackAudio/);
});

test("catalog and detail projections expose readiness while keeping source paths out of returned DTOs", async () => {
  const source = await readFile(new URL("../services/artist/catalog-contract.ts", import.meta.url), "utf8");
  assert.match(source, /fullMasterStored: Boolean\(track\.audio_file_path\)/);
  assert.match(source, /buyerPreviewReady: Boolean\(track\.audio_file_url\)/);
  assert.match(source, /Current records do not yet separate Recording and Composition rights/);
  assert.doesNotMatch(source, /audioFilePath:/);
  assert.doesNotMatch(source, /previewFilePath:/);
  assert.doesNotMatch(source, /rightsHolderEmail/);
});

test("Artist Catalog is operational, truthful, and no longer renders buyer marketplace cards", async () => {
  const [page, view] = await Promise.all([
    readFile(new URL("../app/(app)/artist/catalog/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/artist/catalog/artist-catalog-view.tsx", import.meta.url), "utf8")
  ]);
  assert.match(page, /getArtistCatalogPage/);
  assert.doesNotMatch(page, /CatalogBrowser/);
  for (const label of ["Discoverable", "In review", "Draft", "Assets", "Rights", "Licenses", "Updated"]) assert.match(view, new RegExp(label));
  for (const fabricated of ["gross license value", "Preview starts", "Revenue"]) assert.equal(view.includes(fabricated), false);
  assert.match(view, /Current records do not yet separate|Legacy records/);
});
