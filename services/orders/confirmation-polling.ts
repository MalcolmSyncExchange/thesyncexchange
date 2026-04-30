export const LICENSE_CONFIRMATION_POLL_INTERVAL_MS = 2500;
export const LICENSE_CONFIRMATION_POLL_TIMEOUT_MS = 15000;

export type LicenseConfirmationPollOrder = {
  order_status?: string | null;
  status?: string | null;
  agreement_url?: string | null;
  agreement_ready?: boolean | null;
  paid_at?: string | null;
  stripe_payment_intent_id?: string | null;
};

export function getOrderStatus(order: LicenseConfirmationPollOrder | null | undefined) {
  return order?.order_status || order?.status || null;
}

export function hasLicensePaymentConfirmed(order: LicenseConfirmationPollOrder | null | undefined) {
  const status = getOrderStatus(order);
  return Boolean(order?.paid_at || order?.stripe_payment_intent_id || status === "paid" || status === "fulfilled" || status === "refunded");
}

export function hasLicenseAgreementUrl(order: LicenseConfirmationPollOrder | null | undefined) {
  return Boolean(order?.agreement_ready && order?.agreement_url);
}

export function shouldPollLicenseConfirmation(order: LicenseConfirmationPollOrder | null | undefined, elapsedMs: number) {
  if (!order || elapsedMs >= LICENSE_CONFIRMATION_POLL_TIMEOUT_MS) {
    return false;
  }

  const status = getOrderStatus(order);
  if (status && status !== "pending") {
    return false;
  }

  if (hasLicensePaymentConfirmed(order) || hasLicenseAgreementUrl(order)) {
    return false;
  }

  return true;
}
