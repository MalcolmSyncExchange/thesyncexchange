import type { AcceptedPurchase } from "@/services/licensing/purchases";
import type { GeneratedLicenseTermsSnapshot } from "./templates/sync-license-template";

// No catalog/profile/template lookups or placeholder legal parties are allowed.
export function buildAcceptedPurchaseLicense({ accepted, agreementNumber, paidAt, sessionId, intentId, payment }: {
  accepted: AcceptedPurchase; agreementNumber: string; paidAt: string; sessionId: string; intentId: string;
  payment: NonNullable<GeneratedLicenseTermsSnapshot["payment"]>;
}): GeneratedLicenseTermsSnapshot {
  const s = accepted.snapshot;
  if (!s.acceptance || !s.orderId || s.acceptance.buyerId !== s.buyer.userId || s.termsHash !== s.acceptance.termsHash ||
      !/^[a-f0-9]{64}$/.test(accepted.hash) || !s.buyer.legalName || !s.buyer.email || !s.seller.legalName || !s.terms.body) {
    throw new Error("Complete accepted purchase evidence is required for agreement generation.");
  }
  const testOnly = payment.paymentMode === "test" || !payment.commercialRightsGranted;
  const holders = [...s.rights.master.map(h => ({ ...h, pool: "Master" })), ...s.rights.publishing.map(h => ({ ...h, pool: "Composition" }))];
  const licensors = [...new Set(holders.map(h => h.party.legalName))].join("; ");
  const legalReference = `See exact accepted legal document ${s.terms.version} and complete transaction schedule below.`;
  return {
    templateVersion: s.terms.version, agreementNumber, agreementStatus: "generated", orderId: s.orderId,
    purchaseDate: paidAt, effectiveDate: paidAt,
    buyer: { userId: s.buyer.userId, legalName: s.buyer.legalName, companyName: s.buyer.entityType === "company" ? s.buyer.legalName : null, email: s.buyer.email },
    licensor: { platformName: "The Sync Exchange", entityName: licensors, displayName: `${licensors}. Seller: ${s.seller.legalName}. ${s.terms.platformRole}` },
    track: { id: s.track.id, title: s.track.title, artistName: s.seller.legalName, rightsHolders: holders.map(h => ({ name: h.party.legalName, roleType: `${h.pool}: ${h.authority}`, ownershipPercent: h.ownershipBps / 100 })) },
    license: {
      typeId: s.license.id, typeSlug: s.license.slug, typeName: s.license.name, pricePaidCents: s.amountCents, currency: s.currency,
      termsSummary: testOnly ? "Sandbox transaction record only. No commercial rights granted." : legalReference,
      territory: s.usage.territory, termLength: `${s.usage.startsAt} through ${s.usage.endsAt}`,
      permittedMedia: testOnly ? ["None. TEST transactions grant no commercial exploitation rights."] : [s.usage.use],
      exclusivity: s.license.exclusive ? "Exclusive (subject to accepted text)" : "Non-exclusive (subject to accepted text)",
      restrictions: [...s.rights.scope.restrictions, ...s.rights.scope.excludedUses.map(u => `Excluded: ${u}`), ...(testOnly ? ["This TEST artifact grants no commercial license or right to exploit the recording or composition."] : [])],
      creditRequirements: null, grantText: testOnly ? "TEST transaction only. No commercial rights arise from payment, acceptance or this artifact." : s.terms.body,
      ownershipReservation: legalReference, transferRestriction: legalReference, terminationTerms: legalReference, governingLaw: legalReference, legalReviewRequired: false
    },
    stripe: { checkoutSessionId: sessionId, paymentIntentId: intentId }, payment,
    purchase: s, purchaseHash: accepted.hash
  };
}
