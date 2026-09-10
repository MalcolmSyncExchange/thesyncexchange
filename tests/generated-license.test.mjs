import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgreementNumber,
  SYNC_LICENSE_TEMPLATE_VERSION,
  buildGeneratedLicenseTermsSnapshot,
  resolveLicenseTermsPreset
} from "../lib/licenses/generated-license-snapshot.ts";
import {
  formatAgreementDate,
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

  assert.equal(snapshot.templateVersion, SYNC_LICENSE_TEMPLATE_VERSION);
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

test("agreement dates format in UTC without raw ISO timestamps", () => {
  assert.equal(formatAgreementDate("2026-09-05T06:12:01+00:00"), "September 5, 2026");
  assert.equal(formatAgreementDate("not-a-date"), "not-a-date");
});

test("agreement HTML includes the snapshotted agreement number and buyer display", () => {
  const snapshot = buildGeneratedLicenseTermsSnapshot({
    agreementNumber: "TSE-SYNC-20260429-ABCDEF1234",
    context: {
      ...baseContext,
      createdAt: "2026-09-05T06:12:01+00:00",
      paidAt: "2026-09-05T06:12:01+00:00"
    }
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

test("agreement PDF includes production document sections and formatted summary values", () => {
  const snapshot = buildGeneratedLicenseTermsSnapshot({
    agreementNumber: "TSE-SYNC-20260429-ABCDEF1234",
    context: {
      ...baseContext,
      createdAt: "2026-09-05T06:12:01+00:00",
      paidAt: "2026-09-05T06:12:01+00:00"
    }
  });
  const pdfText = renderSyncLicenseAgreementPdf(snapshot).toString("utf8");

  assert.match(pdfText, /THE SYNC EXCHANGE/);
  assert.match(pdfText, /SYNC LICENSE AGREEMENT/);
  assert.match(pdfText, /License Summary/);
  assert.match(pdfText, /Rights & Ownership/);
  assert.match(pdfText, /License Grant/);
  assert.match(pdfText, /Permitted Media/);
  assert.match(pdfText, /Restrictions/);
  assert.match(pdfText, /Ownership and Reservation of Rights/);
  assert.match(pdfText, /Transfer \/ Assignment/);
  assert.match(pdfText, /Termination/);
  assert.match(pdfText, /Governing Law/);
  assert.match(pdfText, /Additional Terms/);
  assert.match(pdfText, /Acceptance/);
  assert.match(pdfText, /TSE-SYNC-v1/);
  assert.match(pdfText, /September 5, 2026/);
  assert.match(pdfText, /\$1,500/);
  assert.match(pdfText, /Nova Signal/);
  assert.match(pdfText, /Composer/);
  assert.match(pdfText, /Total Ownership: 100%/);
  assert.doesNotMatch(pdfText, /2026-09-05T06:12:01/);
});

test("agreement PDF paginates long agreements and adds page numbering", () => {
  const snapshot = buildGeneratedLicenseTermsSnapshot({
    agreementNumber: "TSE-SYNC-20260429-LONGDOC123",
    context: {
      ...baseContext,
      licenseTermsSummary: "Long-form campaign license.",
      rightsHolders: Array.from({ length: 12 }, (_, index) => ({
        name: `Rights Holder ${index + 1} With Extended Legal Name`,
        roleType: index % 2 === 0 ? "Composer" : "Master Owner",
        ownershipPercent: Number((100 / 12).toFixed(2))
      }))
    }
  });
  snapshot.license.permittedMedia = Array.from({ length: 20 }, (_, index) => `Permitted media item ${index + 1} for extended campaign testing.`);
  snapshot.license.restrictions = Array.from({ length: 20 }, (_, index) => `Restriction item ${index + 1} for extended agreement pagination testing.`);

  const pdfText = renderSyncLicenseAgreementPdf(snapshot).toString("utf8");

  assert.match(pdfText, /\/Type \/Pages \/Count [2-9]/);
  assert.match(pdfText, /Page 1 of/);
  assert.match(pdfText, /TSE-SYNC-20260429-LONGDOC123/);
});

test("agreement PDF explicitly paints every page white before document content", () => {
  const snapshot = buildGeneratedLicenseTermsSnapshot({
    agreementNumber: "TSE-SYNC-20260429-WHITEPAGE",
    context: {
      ...baseContext,
      licenseTermsSummary: "Long-form campaign license.",
      rightsHolders: Array.from({ length: 10 }, (_, index) => ({
        name: `Rights Holder ${index + 1}`,
        roleType: index % 2 === 0 ? "Composer" : "Master Owner",
        ownershipPercent: 10
      }))
    }
  });
  snapshot.license.permittedMedia = Array.from({ length: 18 }, (_, index) => `Permitted media item ${index + 1}.`);
  snapshot.license.restrictions = Array.from({ length: 18 }, (_, index) => `Restriction item ${index + 1}.`);

  const pdfText = renderSyncLicenseAgreementPdf(snapshot).toString("utf8");
  const pageCountMatch = pdfText.match(/\/Type \/Pages \/Count (\d+)/);
  const contentStreams = [...pdfText.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((match) => match[1]);
  const whiteBackgroundPrefix = [
    "q",
    "1 1 1 rg",
    "0 0 612 792 re",
    "f",
    "Q"
  ].join("\n");
  const firstFillCommand = contentStreams[0]?.match(/([0-9.]+ [0-9.]+ [0-9.]+ rg)\n0 0 612 792 re\nf/)?.[1];

  assert.ok(pageCountMatch);
  assert.equal(contentStreams.length, Number(pageCountMatch[1]));
  assert.ok(contentStreams.length > 1);
  contentStreams.forEach((stream) => {
    assert.ok(stream.startsWith(whiteBackgroundPrefix));
  });
  assert.equal(firstFillCommand, "1 1 1 rg");
  assert.match(contentStreams[0], /BT\n0 0 0 rg\n\/F2 21 Tf/);
  assert.match(contentStreams[0], /q\n0.97 0.98 0.99 rg\n[0-9.]+ [0-9.]+ [0-9.]+ 50 re f/);
  assert.doesNotMatch(pdfText, /\/Group/);
  assert.doesNotMatch(pdfText, /\/Transparency/);
});
