import test from "node:test";
import assert from "node:assert/strict";

import {
  LICENSE_CONFIRMATION_POLL_TIMEOUT_MS,
  hasLicenseAgreementUrl,
  hasLicensePaymentConfirmed,
  shouldPollLicenseConfirmation
} from "../services/orders/confirmation-polling.ts";

test("license confirmation polling continues while order is pending", () => {
  assert.equal(
    shouldPollLicenseConfirmation(
      {
        order_status: "pending",
        agreement_url: null,
        agreement_ready: false,
        paid_at: null,
        stripe_payment_intent_id: null
      },
      0
    ),
    true
  );
});

test("license confirmation polling stops when order completes", () => {
  assert.equal(
    shouldPollLicenseConfirmation(
      {
        order_status: "fulfilled",
        agreement_url: "/api/orders/order-1/agreement",
        agreement_ready: true,
        paid_at: "2026-04-30T12:00:00.000Z"
      },
      2500
    ),
    false
  );
});

test("license confirmation detects pending to complete UI conditions", () => {
  const pending = {
    order_status: "pending",
    agreement_url: null,
    agreement_ready: false
  };
  const complete = {
    order_status: "fulfilled",
    agreement_url: "/api/orders/order-1/agreement",
    agreement_ready: true,
    paid_at: "2026-04-30T12:00:00.000Z"
  };

  assert.equal(hasLicensePaymentConfirmed(pending), false);
  assert.equal(hasLicenseAgreementUrl(pending), false);
  assert.equal(hasLicensePaymentConfirmed(complete), true);
  assert.equal(hasLicenseAgreementUrl(complete), true);
});

test("license confirmation polling has a timeout guard", () => {
  assert.equal(
    shouldPollLicenseConfirmation(
      {
        order_status: "pending",
        agreement_url: null,
        agreement_ready: false
      },
      LICENSE_CONFIRMATION_POLL_TIMEOUT_MS
    ),
    false
  );
});
