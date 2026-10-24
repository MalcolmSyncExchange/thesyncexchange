import {parsePdf} from "./helpers/pdf-text.mjs";
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
  payment: {
    paymentMode: "test",
    releaseMode: "production_beta",
    livemode: false,
    commercialRightsGranted: false
  },
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
  assert.equal(snapshot.license.territory, "Not applicable — test transaction");
  assert.equal(snapshot.license.permittedMedia.length, 1);
  assert.equal(snapshot.stripe.checkoutSessionId, "cs_test_sync_exchange");
  assert.deepEqual(snapshot.payment, baseContext.payment);
  assert.equal(snapshot.license.grantText.includes("grants no"), true);
  assert.deepEqual(snapshot.license.permittedMedia, ["None. This sandbox transaction grants no media-use rights."]);
  assert.equal(snapshot.license.exclusivity, "Not applicable — test transaction");
  assert.ok(snapshot.license.restrictions[0].includes("may not be relied upon as a commercial license"));
  assert.equal(snapshot.license.territory, "Not applicable — test transaction");
  assert.equal(snapshot.license.termLength, "Not applicable — test transaction");
  assert.equal(snapshot.license.creditRequirements, null);
  assert.equal(snapshot.license.governingLaw, "Not applicable — test transaction");
  assert.equal(snapshot.license.legalReviewRequired, false);
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
  assert.match(html, /TEST — NOT A COMMERCIAL LICENSE/);
  assert.match(html, /Commercial Rights Granted/);
  assert.match(html, />No</);
  assert.doesNotMatch(html, /records the commercial terms of the purchase/);
  assert.doesNotMatch(html, /limited license expressly granted/i);
  assert.doesNotMatch(html, /transfer or resell this license/i);
  assert.doesNotMatch(html, /terminate this license/i);
  assert.doesNotMatch(html, /standard broadcast advertising/i);
  assert.doesNotMatch(html, /countersigned legal instrument/i);
});


test("agreement PDF embeds fonts and preserves all summary values and sections", async () => {
 const s=buildGeneratedLicenseTermsSnapshot({agreementNumber:"TSE-SYNC-UNICODE",context:{...baseContext,createdAt:"2026-09-05T06:12:01Z",paidAt:"2026-09-05T06:12:01Z"}});
 const pdf=await renderSyncLicenseAgreementPdf(s),parsed=await parsePdf(pdf);
 assert.match(pdf.subarray(0,8).toString(),/%PDF-1.7/);
 for(const value of ["SYNC LICENSE AGREEMENT","License Summary","Rights & Ownership","License Grant","Permitted Media","Restrictions","Ownership and Reservation of Rights","Transfer / Assignment","Termination","Governing Law","Additional Terms","Acceptance","TSE-SYNC-v1","September 5, 2026","$1,500","Nova Signal","Composer","Total Ownership: 100%"] ) assert.ok(parsed.text.includes(value),value);
 assert.doesNotMatch(parsed.text,/records the commercial terms of the purchase|limited license expressly granted|transfer or resell this license|standard broadcast advertising/);
 assert.match(pdf.toString('latin1'),/\/ToUnicode/);assert.match(pdf.toString('latin1'),/\/FontFile/);
});
test("live legacy template is classified separately and omits the test watermark",async()=>{
 const s=buildGeneratedLicenseTermsSnapshot({agreementNumber:"TSE-SYNC-LIVE",context:{...baseContext,stripeCheckoutSessionId:"cs_live_fixture",payment:{paymentMode:"live",releaseMode:"production_live",livemode:true,commercialRightsGranted:true}}});
 assert.doesNotMatch(renderSyncLicenseAgreementHtml(s),/TEST — NOT A COMMERCIAL LICENSE/);
 assert.doesNotMatch((await parsePdf(await renderSyncLicenseAgreementPdf(s))).text,/TEST - NOT A COMMERCIAL LICENSE/);
});
test("long agreements paginate without truncating last names long words or list tails and label every test page",async()=>{
 const s=buildGeneratedLicenseTermsSnapshot({agreementNumber:"TSE-SYNC-LONG",context:{...baseContext,rightsHolders:Array.from({length:30},(_,i)=>({name:`Rights Holder ${i} With Extended Legal Name `+"X".repeat(150),roleType:i%2?"Composer":"Master Owner",ownershipPercent:1}))}});
 s.license.permittedMedia=Array.from({length:25},(_,i)=>`Permitted media ${i} for synthetic pagination testing.`);
 s.license.restrictions=Array.from({length:25},(_,i)=>`Restriction ${i} for synthetic pagination testing.`);
 const parsed=await parsePdf(await renderSyncLicenseAgreementPdf(s));assert.ok(parsed.count>3);
 assert.match(parsed.text,/Rights Holder 29 With Extended Legal Name/);assert.match(parsed.text,/Permitted media 24/);assert.match(parsed.text,/Restriction 24/);
 parsed.pages.forEach((text,i)=>{assert.match(text,/TEST - NOT A COMMERCIAL LICENSE/);assert.ok(text.includes(`Page ${i+1} of ${parsed.count}`));});
});
