import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgreementNumber,
  buildGeneratedLicenseTermsSnapshot,
  resolveLicenseTermsPreset
} from "../lib/licenses/generated-license-snapshot.ts";
import {
  renderSyncLicenseAgreementHtml,
  renderSyncLicenseAgreementPdf
} from "../lib/licenses/templates/sync-license-template.ts";

const baseContext = {
  orderId: "56372f0f-6e27-4ff5-aada-9756f9faa5e0",
  buyerId: "buyer-123",
  trackId: "track-456",
  licenseTypeId: "license-789",
  amountCents: 150000,
  currency: "USD",
  createdAt: "2026-04-29T12:00:00.000Z",
  paidAt: "2026-04-29T12:05:00.000Z",
  stripeCheckoutSessionId: "cs_test_sync_exchange",
  stripePaymentIntentId: "pi_test_sync_exchange",
  trackTitle: "Midnight Run",
  artistName: "Nova Signal",
  buyerLegalName: "Jordan Banks",
  buyerCompanyName: "North Frame Studios",
  buyerEmail: "licensing@northframe.example",
  licenseTypeName: "Broadcast Campaign",
  licenseTypeSlug: "broadcast",
  licenseTermsSummary: "Broadcast sync placement for campaign use.",
  licenseExclusive: false,
  rightsHolders: [
    {
      name: "Nova Signal",
      roleType: "Composer",
      ownershipPercent: 50
    },
    {
      name: "Pulse Harbor",
      roleType: "Master Owner",
      ownershipPercent: 50
    }
  ]
};

test("agreement number is deterministic per order and purchase date", () => {
  const agreementNumber = buildAgreementNumber({
    orderId: baseContext.orderId,
    createdAt: baseContext.createdAt
  });

  assert.equal(agreementNumber, "TSE-SYNC-20260429-56372F0F6E");
});

test("broadcast license preset records production-facing media rules", () => {
  const preset = resolveLicenseTermsPreset({
    typeSlug: "broadcast",
    typeName: "Broadcast Campaign",
    termsSummary: "Broadcast sync placement for campaign use.",
    exclusive: false
  });

  assert.equal(preset.territory, "Worldwide");
  assert.equal(preset.termLength, "12 months from the effective date");
  assert.equal(preset.exclusivity, "Non-Exclusive");
  assert.ok(preset.permittedMedia.includes("Broadcast television advertising"));
  assert.ok(preset.restrictions.some((item) => item.includes("No theatrical trailer")));
  assert.equal(preset.legalReviewRequired, true);
});

test("terms snapshot freezes the buyer, track, license, and Stripe purchase details", () => {
  const agreementNumber = buildAgreementNumber({
    orderId: baseContext.orderId,
    createdAt: baseContext.createdAt
  });
  const snapshot = buildGeneratedLicenseTermsSnapshot({
    agreementNumber,
    context: baseContext
  });

  assert.equal(snapshot.agreementNumber, agreementNumber);
  assert.equal(snapshot.orderId, baseContext.orderId);
  assert.equal(snapshot.purchaseDate, baseContext.paidAt);
  assert.equal(snapshot.buyer.companyName, "North Frame Studios");
  assert.equal(snapshot.track.title, "Midnight Run");
  assert.equal(snapshot.license.typeSlug, "broadcast");
  assert.equal(snapshot.license.pricePaidCents, 150000);
  assert.equal(snapshot.license.currency, "USD");
  assert.equal(snapshot.license.territory, "Worldwide");
  assert.ok(snapshot.license.permittedMedia.length > 1);
  assert.equal(snapshot.stripe.checkoutSessionId, "cs_test_sync_exchange");
});

test("agreement HTML includes the snapshotted agreement number and buyer display", () => {
  const snapshot = buildGeneratedLicenseTermsSnapshot({
    agreementNumber: "TSE-SYNC-20260429-ABCDEF1234",
    context: baseContext
  });
  const html = renderSyncLicenseAgreementHtml(snapshot);

  assert.match(html, /TSE-SYNC-20260429-ABCDEF1234/);
  assert.match(html, /North Frame Studios \(Jordan Banks\)/);
  assert.match(html, /Broadcast Campaign/);
  assert.match(html, /The Sync Exchange, on behalf of the applicable artist and rights holders/);
});

test("agreement PDF renderer returns a valid PDF payload", () => {
  const snapshot = buildGeneratedLicenseTermsSnapshot({
    agreementNumber: "TSE-SYNC-20260429-ABCDEF1234",
    context: baseContext
  });
  const pdf = renderSyncLicenseAgreementPdf(snapshot);
  const prefix = Buffer.from(pdf).subarray(0, 8).toString("utf8");

  assert.ok(pdf.byteLength > 500);
  assert.equal(prefix, "%PDF-1.4");
});
