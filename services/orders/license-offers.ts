import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { isBuyerCatalogEligible } from "@/lib/buyer-catalog-eligibility";
import { readBuyerSelection, type TrackLicenseOffer, type CheckoutReview } from "@/lib/licenses/selection";
import { requireSession } from "@/services/auth/session";
import { getBuyerTrackBySlug } from "@/services/buyer/queries";
import { CHECKOUT_CURRENCY } from "./checkout-pricing";
import type { BuyerTrack } from "@/types/models";

/** Input must come from the buyer-scoped catalog query, never a request body. */
export function getTrackLicenseOffers(track: BuyerTrack): TrackLicenseOffer[] {
  const offers = track.license_options.flatMap(option => {
    if (option.active !== true || option.offer_active === false) return [];
    // Hosted queries carry exact database minor units. Only demo records use dollars.
    const amountCents = option.amount_cents ?? (env.demoMode ? Math.round((option.price_override ?? option.base_price) * 100) : NaN);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || (!env.demoMode && !option.track_license_option_id)) return [];
    const data: Omit<TrackLicenseOffer, "revision"> = {
      trackId: track.id, trackLicenseOptionId: option.track_license_option_id || null,
      licenseTypeId: option.id, slug: option.slug, name: option.name,
      description: option.description, termsSummary: option.terms_summary, exclusive: option.exclusive,
      amountCents, currency: CHECKOUT_CURRENCY
    };
    return [{ ...data, revision: createHash("sha256").update(JSON.stringify(data)).digest("hex") }];
  });
  return isBuyerCatalogEligible({ status: track.status, previewAvailable: Boolean(track.audio_file_url || track.preview_file_path), activeLicenseCount: offers.length }) ? offers : [];
}

/** GET/review path: auth and catalog reads only. No orders, Stripe or analytics. */
export async function loadBuyerCheckoutReview(trackSlug: string, licenseTypeId: unknown): Promise<CheckoutReview | null> {
  const user = await requireSession("buyer");
  const selection = readBuyerSelection(licenseTypeId, env.demoMode);
  if (!selection) return null;
  const track = await getBuyerTrackBySlug(trackSlug, user.id);
  if (!track) return null;
  const offer = getTrackLicenseOffers(track).find(candidate => candidate.licenseTypeId === selection.licenseTypeId);
  return offer ? { trackId: track.id, trackSlug: track.slug, trackTitle: track.title, offer } : null;
}
