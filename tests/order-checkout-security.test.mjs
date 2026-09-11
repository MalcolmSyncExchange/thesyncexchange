import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CHECKOUT_CURRENCY,
  assertStripeSessionMatchesTrustedCheckout,
  getStoredOrderPricingMismatch,
  resolveTrustedCheckoutDetails
} from "../services/orders/checkout-pricing.ts";

const order = {
  id: "order-123",
  buyer_user_id: "buyer-123",
  track_id: "track-123",
  license_type_id: "license-123",
  amount_cents: 1,
  currency: "USD",
  status: "pending",
  stripe_checkout_session_id: "cs_expected"
};

const track = {
  id: "track-123",
  title: "Midnight Ledger",
  slug: "midnight-ledger",
  status: "approved"
};

const licenseType = {
  id: "license-123",
  name: "Broadcast",
  slug: "broadcast",
  active: true,
  default_price_cents: 480000
};

const licenseOption = {
  track_id: "track-123",
  license_type_id: "license-123",
  active: true,
  price_cents: 520000,
  license_types: licenseType
};

function checkoutSession(overrides = {}) {
  return {
    id: "cs_expected",
    client_reference_id: "order-123",
    metadata: {
      orderId: "order-123",
      buyerUserId: "buyer-123",
      trackId: "track-123",
      licenseTypeId: "license-123"
    },
    payment_status: "paid",
    amount_total: 520000,
    currency: "usd",
    ...overrides
  };
}

test("trusted checkout price is derived from active database license option, not stored order amount", () => {
  const details = resolveTrustedCheckoutDetails({
    order,
    track,
    licenseOption,
    licenseType
  });

  assert.equal(details.amountCents, 520000);
  assert.equal(details.currency, CHECKOUT_CURRENCY);
  assert.equal(details.trackTitle, "Midnight Ledger");
  assert.equal(details.licenseName, "Broadcast");
});

test("stored pending order price mismatch is detectable before checkout", () => {
  const details = resolveTrustedCheckoutDetails({
    order,
    track,
    licenseOption,
    licenseType
  });

  assert.deepEqual(getStoredOrderPricingMismatch(details), {
    amountMismatch: true,
    currencyMismatch: false,
    storedAmountCents: 1,
    storedCurrency: "USD",
    trustedAmountCents: 520000,
    trustedCurrency: "USD"
  });
});

test("checkout rejects inactive tracks and license options", () => {
  assert.throws(
    () =>
      resolveTrustedCheckoutDetails({
        order,
        track: { ...track, status: "pending_review" },
        licenseOption,
        licenseType
      }),
    /no longer approved/
  );

  assert.throws(
    () =>
      resolveTrustedCheckoutDetails({
        order,
        track,
        licenseOption: { ...licenseOption, active: false },
        licenseType
      }),
    /no longer active/
  );
});

test("webhook fulfillment rejects paid sessions with manipulated amount or currency", () => {
  const details = resolveTrustedCheckoutDetails({
    order,
    track,
    licenseOption,
    licenseType
  });

  assert.doesNotThrow(() => assertStripeSessionMatchesTrustedCheckout(details, checkoutSession()));
  assert.throws(
    () => assertStripeSessionMatchesTrustedCheckout(details, checkoutSession({ amount_total: 1 })),
    /paid amount does not match/
  );
  assert.throws(
    () => assertStripeSessionMatchesTrustedCheckout(details, checkoutSession({ currency: "eur" })),
    /paid currency does not match/
  );
});

test("correct Stripe amount and currency remain eligible for normal fulfillment", () => {
  const details = resolveTrustedCheckoutDetails({
    order,
    track,
    licenseOption,
    licenseType
  });

  assert.doesNotThrow(() =>
    assertStripeSessionMatchesTrustedCheckout(
      details,
      checkoutSession({
        payment_status: "paid",
        amount_total: details.amountCents,
        currency: details.currency.toLowerCase()
      })
    )
  );
});

test("webhook fulfillment rejects sessions that do not match the active order", () => {
  const details = resolveTrustedCheckoutDetails({
    order,
    track,
    licenseOption,
    licenseType
  });

  assert.throws(
    () => assertStripeSessionMatchesTrustedCheckout(details, checkoutSession({ id: "cs_old" })),
    /active checkout session/
  );
  assert.throws(
    () =>
      assertStripeSessionMatchesTrustedCheckout(
        details,
        checkoutSession({
          metadata: {
            orderId: "order-123",
            buyerUserId: "other-buyer",
            trackId: "track-123",
            licenseTypeId: "license-123"
          }
        })
      ),
    /buyer does not match/
  );
});

test("order write lockdown migration removes direct buyer inserts", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0017_lock_down_order_writes.sql", import.meta.url), "utf8");

  assert.match(sql, /drop policy if exists "Buyers can create pending orders for themselves" on public\.orders;/);
  assert.match(sql, /revoke insert on table public\.orders from authenticated;/);
  assert.match(sql, /revoke update on table public\.orders from authenticated;/);
  assert.doesNotMatch(sql, /create policy "Buyers can create pending orders for themselves"/);
});

test("Stripe webhook sync preserves event dedupe before fulfillment validation", () => {
  const source = readFileSync(new URL("../services/stripe/server.ts", import.meta.url), "utf8");

  assert.ok(
    source.indexOf("hasProcessedOrderDedupeKey") < source.indexOf("loadTrustedCheckoutDetails"),
    "webhook event dedupe should run before trusted checkout validation"
  );
  assert.match(source, /dedupeKey:\s*webhookEventId \|\| null/);
});
