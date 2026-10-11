/** A category is reusable; an offer belongs to one track. Neither is an order. */
export interface LicenseTypeDefinition {
  licenseTypeId: string;
  slug: string;
  name: string;
  description: string;
  termsSummary: string;
  exclusive: boolean;
}

export interface TrackLicenseOffer extends LicenseTypeDefinition {
  trackId: string;
  trackLicenseOptionId: string | null; // Demo data has no persisted option row.
  amountCents: number;
  currency: "USD";
  revision: string;
}

/** Untrusted navigation intent. Prices, eligibility and rights are never inputs. */
export interface BuyerLicenseSelection { licenseTypeId: string }
export interface CheckoutReview {
  trackId: string;
  trackSlug: string;
  trackTitle: string;
  offer: TrackLicenseOffer;
}
/** Input to the existing payment mutation, not a persisted checkout attempt. */
export interface CheckoutAttemptIntent extends BuyerLicenseSelection {
  trackId: string;
  reviewedOfferRevision: string;
}

export function formatOfferPrice(offer: Pick<TrackLicenseOffer, "amountCents" | "currency">) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: offer.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(offer.amountCents / 100);
}

export function readBuyerSelection(value: unknown, demo = false): BuyerLicenseSelection | null {
  if (typeof value !== "string") return null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuid.test(value) || (demo && /^lt-[1-9][0-9]*$/.test(value)) ? { licenseTypeId: value } : null;
}

export function licenseDetailHref(slug: string, licenseTypeId?: string | null, unavailable = false) {
  const params = new URLSearchParams();
  if (licenseTypeId) params.set("licenseTypeId", licenseTypeId);
  if (unavailable) params.set("selection", "unavailable");
  const query = params.toString();
  return `/buyer/catalog/${encodeURIComponent(slug)}${query ? `?${query}` : ""}#licenses`;
}

export function checkoutReviewHref(slug: string, licenseTypeId: string, changed = false) {
  const params = new URLSearchParams({ licenseTypeId });
  if (changed) params.set("review", "changed");
  return `/buyer/checkout/${encodeURIComponent(slug)}?${params}`;
}

// Session-only comparison hint, never a price reservation or authorization.
// Store only offer identifiers and a digest; no user data, amounts, terms or URLs.
export function rememberViewedOffer(storage: Pick<Storage, "setItem">, offer: TrackLicenseOffer) {
  try { storage.setItem(`tse:license-offer:${offer.trackId}`, JSON.stringify({ licenseTypeId: offer.licenseTypeId, revision: offer.revision })); } catch { /* Browsing works without storage. */ }
}
export function previousOfferRevision(storage: Pick<Storage, "getItem">, offer: TrackLicenseOffer): string | null {
  try {
    const value = JSON.parse(storage.getItem(`tse:license-offer:${offer.trackId}`) || "null");
    return value?.licenseTypeId === offer.licenseTypeId && /^[a-f0-9]{64}$/.test(value?.revision) ? value.revision : null;
  } catch { return null; }
}
