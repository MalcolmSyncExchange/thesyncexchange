import type { GeneratedLicenseTermsSnapshot } from "./templates/sync-license-template";

type LicenseTermsPresetInput = {
  typeSlug: string | null;
  typeName: string;
  termsSummary: string;
  exclusive: boolean;
};

export type GeneratedLicenseOrderSnapshotContext = {
  orderId: string;
  buyerId: string;
  trackId: string;
  licenseTypeId: string | null;
  amountCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  trackTitle: string;
  artistName: string;
  buyerLegalName: string;
  buyerCompanyName: string | null;
  buyerEmail: string;
  licenseTypeName: string;
  licenseTypeSlug: string | null;
  licenseTermsSummary: string;
  licenseExclusive: boolean;
  rightsHolders: Array<{
    name: string;
    roleType: string;
    ownershipPercent: number;
  }>;
};

export function buildAgreementNumber({
  orderId,
  createdAt
}: {
  orderId: string;
  createdAt: string;
}) {
  const date = new Date(createdAt);
  const year = Number.isNaN(date.getTime()) ? "0000" : String(date.getUTCFullYear());
  const month = Number.isNaN(date.getTime()) ? "00" : String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = Number.isNaN(date.getTime()) ? "00" : String(date.getUTCDate()).padStart(2, "0");
  const compactOrderId = orderId.replace(/-/g, "").slice(0, 10).toUpperCase();
  return `TSE-SYNC-${year}${month}${day}-${compactOrderId}`;
}

export function resolveLicenseTermsPreset(input: LicenseTermsPresetInput) {
  const normalizedSlug = (input.typeSlug || "").toLowerCase();
  const shared = {
    exclusivity: input.exclusive ? "Exclusive" : "Non-Exclusive",
    ownershipReservation:
      "All right, title, and interest in and to the composition, master recording, and all related intellectual property remain with the applicable artist and rights holders except for the limited license expressly granted in this agreement.",
    transferRestriction:
      "The buyer may not assign, sublicense, transfer, or resell this license or the underlying recording without prior written approval from The Sync Exchange and the applicable rights holders.",
    terminationTerms:
      "Any material breach, non-payment reversal, chargeback, fraudulent use, or use outside the permitted scope allows The Sync Exchange and the applicable rights holders to terminate this license immediately, without waiving any other remedy.",
    governingLaw:
      "Attorney review required. Governing law, venue, and dispute-resolution language must be confirmed before production launch.",
    legalReviewRequired: true
  };

  switch (normalizedSlug) {
    case "digital-campaign":
      return {
        ...shared,
        territory: "Worldwide",
        termLength: "12 months from the effective date",
        permittedMedia: [
          "Paid social campaigns",
          "Brand-owned websites and landing pages",
          "Short-form digital advertising",
          "Organic social cutdowns tied to the licensed campaign"
        ],
        restrictions: [
          "No broadcast, theatrical, trailer, or in-product use unless separately licensed.",
          "No derivative remixing, lyric changes, or re-records without written approval.",
          "No political, defamatory, or unlawful use."
        ],
        creditRequirements: "Credit is not required for standard paid-media use unless requested in writing by the applicable rights holders.",
        grantText:
          "The Sync Exchange, on behalf of the applicable artist and rights holders, grants the buyer a non-exclusive synchronization license for the licensed recording in approved digital campaign media during the stated term and territory."
      };
    case "broadcast":
      return {
        ...shared,
        territory: "Worldwide",
        termLength: "12 months from the effective date",
        permittedMedia: [
          "Broadcast television advertising",
          "Streaming advertising placements",
          "Connected TV campaign extensions",
          "Campaign-related digital cutdowns matching the same commercial creative"
        ],
        restrictions: [
          "No theatrical trailer, film, or game use unless separately licensed.",
          "No standalone soundtrack release or audio-only exploitation.",
          "No use suggesting artist endorsement of the buyer’s brand, product, or political position."
        ],
        creditRequirements: "Credit is typically waived for standard broadcast advertising unless contractually required by a rights holder.",
        grantText:
          "The Sync Exchange, on behalf of the applicable artist and rights holders, grants the buyer a non-exclusive synchronization license for approved broadcast and streaming campaign use during the stated term and territory."
      };
    case "trailer-promo":
      return {
        ...shared,
        territory: "Worldwide",
        termLength: "12 months from the effective date",
        permittedMedia: [
          "Film, television, and series promotional trailers",
          "Broadcast or streaming promotional spots",
          "Teaser, sizzle, and launch creative directly tied to the promoted title"
        ],
        restrictions: [
          "No perpetual reuse outside the promoted title or campaign without renewal.",
          "No soundtrack release, sample pack, or music-library redistribution.",
          "No use outside the approved creative family without written approval."
        ],
        creditRequirements: "Credit, if requested, should follow the production’s customary promotional-credit standards.",
        grantText:
          "The Sync Exchange, on behalf of the applicable artist and rights holders, grants the buyer a non-exclusive synchronization license for trailer and promotional exploitation tied to the approved title or campaign."
      };
    case "exclusive-buyout":
      return {
        ...shared,
        territory: "Worldwide",
        termLength: "As recorded in this purchase record, subject to attorney review before launch",
        permittedMedia: [
          "Exclusive use within the approved media scope recorded by The Sync Exchange at purchase time",
          "Derivative campaign edits and cutdowns related to the approved placement"
        ],
        restrictions: [
          "Attorney review required before exclusive-buyout licenses are offered in production.",
          "Any scope expansion, soundtrack release, or resale remains prohibited unless separately negotiated in writing.",
          "No use beyond the purchased scope, territory, or term."
        ],
        creditRequirements: "Credit terms, if any, must be confirmed during final legal review for this exclusive tier.",
        grantText:
          "The Sync Exchange records this purchase as an exclusive synchronization license tied to the commercial scope captured at purchase time, but final legal review remains required before this tier is used in production."
      };
    default:
      return {
        ...shared,
        territory: "Worldwide",
        termLength: "12 months from the effective date unless otherwise stated in writing",
        permittedMedia: ["Approved sync use matching the purchased license tier."],
        restrictions: [
          "No use outside the purchased media scope, territory, or term.",
          "No assignment, resale, or sublicensing without written approval."
        ],
        creditRequirements: null,
        grantText:
          "The Sync Exchange, on behalf of the applicable artist and rights holders, grants the buyer the synchronization rights expressly described in the purchased license tier."
      };
  }
}

export function buildGeneratedLicenseTermsSnapshot({
  agreementNumber,
  context
}: {
  agreementNumber: string;
  context: GeneratedLicenseOrderSnapshotContext;
}): GeneratedLicenseTermsSnapshot {
  const preset = resolveLicenseTermsPreset({
    typeSlug: context.licenseTypeSlug,
    typeName: context.licenseTypeName,
    termsSummary: context.licenseTermsSummary,
    exclusive: context.licenseExclusive
  });
  const effectiveDate = context.paidAt || context.createdAt;

  return {
    agreementNumber,
    agreementStatus: "generated",
    orderId: context.orderId,
    purchaseDate: effectiveDate,
    effectiveDate,
    buyer: {
      userId: context.buyerId,
      legalName: context.buyerLegalName,
      companyName: context.buyerCompanyName,
      email: context.buyerEmail
    },
    licensor: {
      platformName: "The Sync Exchange",
      entityName: "The Sync Exchange",
      displayName: "The Sync Exchange, on behalf of the applicable artist and rights holders"
    },
    track: {
      id: context.trackId,
      title: context.trackTitle,
      artistName: context.artistName,
      rightsHolders: context.rightsHolders
    },
    license: {
      typeId: context.licenseTypeId,
      typeSlug: context.licenseTypeSlug,
      typeName: context.licenseTypeName,
      termsSummary: context.licenseTermsSummary,
      pricePaidCents: context.amountCents,
      currency: context.currency,
      territory: preset.territory,
      termLength: preset.termLength,
      permittedMedia: preset.permittedMedia,
      exclusivity: preset.exclusivity,
      restrictions: preset.restrictions,
      creditRequirements: preset.creditRequirements,
      grantText: preset.grantText,
      ownershipReservation: preset.ownershipReservation,
      transferRestriction: preset.transferRestriction,
      terminationTerms: preset.terminationTerms,
      governingLaw: preset.governingLaw,
      legalReviewRequired: preset.legalReviewRequired
    },
    stripe: {
      checkoutSessionId: context.stripeCheckoutSessionId,
      paymentIntentId: context.stripePaymentIntentId
    }
  };
}
