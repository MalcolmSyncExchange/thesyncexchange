import type Stripe from "stripe";

import type { AppSupabaseClient } from "@/services/supabase/types";

export const CHECKOUT_CURRENCY = "USD";

export type TrustedCheckoutOrder = {
  id: string;
  buyer_user_id: string;
  track_id: string;
  license_type_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  stripe_checkout_session_id?: string | null;
};

type TrackRow = {
  id: string;
  title: string | null;
  slug: string | null;
  status: string | null;
};

type LicenseTypeRow = {
  id: string;
  name: string | null;
  slug?: string | null;
  active: boolean | null;
  default_price_cents: number | null;
};

type LicenseOptionRow = {
  track_id: string;
  license_type_id: string;
  active: boolean | null;
  price_cents: number | null;
  license_types?: LicenseTypeRow | LicenseTypeRow[] | null;
};

export type TrustedCheckoutDetails = {
  order: TrustedCheckoutOrder;
  track: TrackRow;
  licenseOption: LicenseOptionRow;
  licenseType: LicenseTypeRow;
  amountCents: number;
  currency: typeof CHECKOUT_CURRENCY;
  trackTitle: string;
  trackSlug: string;
  licenseName: string;
};

export function normalizeRelatedRow<T>(row: T | T[] | null | undefined): T | null {
  if (Array.isArray(row)) {
    return row[0] || null;
  }

  return row || null;
}

export function resolveTrustedCheckoutDetails({
  order,
  track,
  licenseOption,
  licenseType
}: {
  order: TrustedCheckoutOrder;
  track: TrackRow | null;
  licenseOption: LicenseOptionRow | null;
  licenseType: LicenseTypeRow | null;
}): TrustedCheckoutDetails {
  if (!track || track.id !== order.track_id) {
    throw new Error("The selected track is no longer available for checkout.");
  }

  if (track.status !== "approved") {
    throw new Error("This track is no longer approved for checkout.");
  }

  if (!licenseOption || licenseOption.track_id !== order.track_id || licenseOption.license_type_id !== order.license_type_id) {
    throw new Error("This license option is no longer available for checkout.");
  }

  if (licenseOption.active === false) {
    throw new Error("This license option is no longer active for checkout.");
  }

  if (!licenseType || licenseType.id !== order.license_type_id) {
    throw new Error("This license type is no longer available for checkout.");
  }

  if (licenseType.active === false) {
    throw new Error("This license type is no longer active for checkout.");
  }

  const amountCents = Number(licenseOption.price_cents ?? licenseType.default_price_cents ?? 0);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("This license option does not have a valid checkout price.");
  }

  return {
    order,
    track,
    licenseOption,
    licenseType,
    amountCents,
    currency: CHECKOUT_CURRENCY,
    trackTitle: track.title || "The Sync Exchange License",
    trackSlug: track.slug || "catalog",
    licenseName: licenseType.name || "License"
  };
}

export function getStoredOrderPricingMismatch(details: Pick<TrustedCheckoutDetails, "order" | "amountCents" | "currency">) {
  const storedAmountCents = Number(details.order.amount_cents);
  const storedCurrency = String(details.order.currency || "").toUpperCase();

  return {
    amountMismatch: storedAmountCents !== details.amountCents,
    currencyMismatch: storedCurrency !== details.currency,
    storedAmountCents,
    storedCurrency,
    trustedAmountCents: details.amountCents,
    trustedCurrency: details.currency
  };
}

export function assertStripeSessionMatchesTrustedCheckout(
  details: Pick<TrustedCheckoutDetails, "order" | "amountCents" | "currency">,
  session: Stripe.Checkout.Session
) {
  const sessionOrderId = session.client_reference_id || session.metadata?.orderId || null;
  if (!sessionOrderId) {
    throw new Error("Stripe checkout session is missing an order reference.");
  }

  if (sessionOrderId !== details.order.id) {
    throw new Error("Checkout session does not belong to the requested order.");
  }

  if (details.order.stripe_checkout_session_id && details.order.stripe_checkout_session_id !== session.id) {
    throw new Error("Checkout session does not match the order's active checkout session.");
  }

  if (session.metadata?.buyerUserId && session.metadata.buyerUserId !== details.order.buyer_user_id) {
    throw new Error("Checkout session buyer does not match the order buyer.");
  }

  if (session.metadata?.trackId && session.metadata.trackId !== details.order.track_id) {
    throw new Error("Checkout session track does not match the order track.");
  }

  if (session.metadata?.licenseTypeId && session.metadata.licenseTypeId !== details.order.license_type_id) {
    throw new Error("Checkout session license type does not match the order license type.");
  }

  if (session.payment_status === "paid") {
    if (session.amount_total !== details.amountCents) {
      throw new Error("Stripe paid amount does not match the trusted license price.");
    }

    if (String(session.currency || "").toUpperCase() !== details.currency) {
      throw new Error("Stripe paid currency does not match the trusted license currency.");
    }
  }
}

export async function loadTrustedCheckoutDetails(
  supabase: AppSupabaseClient,
  orderId: string
): Promise<TrustedCheckoutDetails | null> {
  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .select(
      `
        id,
        buyer_user_id,
        track_id,
        license_type_id,
        amount_cents,
        currency,
        status,
        stripe_checkout_session_id,
        tracks (
          id,
          title,
          slug,
          status
        ),
        license_types (
          id,
          name,
          slug,
          active,
          default_price_cents
        )
      `
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    throw new Error(orderError.message);
  }

  if (!orderRow) {
    return null;
  }

  const order = orderRow as unknown as TrustedCheckoutOrder & {
    tracks?: TrackRow | TrackRow[] | null;
    license_types?: LicenseTypeRow | LicenseTypeRow[] | null;
  };

  const { data: licenseOptionRow, error: licenseOptionError } = await supabase
    .from("track_license_options")
    .select(
      `
        track_id,
        license_type_id,
        active,
        price_cents,
        license_types (
          id,
          name,
          slug,
          active,
          default_price_cents
        )
      `
    )
    .eq("track_id", order.track_id)
    .eq("license_type_id", order.license_type_id)
    .maybeSingle();

  if (licenseOptionError) {
    throw new Error(licenseOptionError.message);
  }

  const licenseOption = licenseOptionRow as unknown as LicenseOptionRow | null;
  const joinedLicenseType = normalizeRelatedRow(licenseOption?.license_types);
  const orderLicenseType = normalizeRelatedRow(order.license_types);

  return resolveTrustedCheckoutDetails({
    order,
    track: normalizeRelatedRow(order.tracks),
    licenseOption,
    licenseType: joinedLicenseType || orderLicenseType
  });
}
