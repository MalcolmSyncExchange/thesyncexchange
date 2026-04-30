import test from "node:test";
import assert from "node:assert/strict";

import {
  assertAuthenticatedBuyerSettingsUser,
  buildBillingPortalReturnUrl,
  buildBuyerProfileUpdate,
  buildEmailUpdatePayload,
  buildGlobalSignOutOptions,
  buildNotificationPreferencesUpsert,
  buildPasswordUpdatePayload,
  buildTeamInviteInsert,
  isBuyerSettingsDirty,
  isNotificationPreferencesDirty,
  mapLegalOrdersForSettings,
  mapStripeInvoice,
  normalizeBuyerSettings,
  normalizeNotificationPreferences,
  validateBuyerSettings,
  validateEmailChange,
  validatePasswordChange,
  validateTeamInvite
} from "../services/buyer/settings.ts";

test("buyer settings normalizes company and billing email", () => {
  assert.deepEqual(
    normalizeBuyerSettings({
      companyName: "  Northframe Creative  ",
      billingEmail: "  Billing@Northframe.CO  "
    }),
    {
      companyName: "Northframe Creative",
      billingEmail: "billing@northframe.co"
    }
  );
});

test("buyer settings save button only enables when fields are dirty", () => {
  const initial = {
    companyName: "Northframe Creative",
    billingEmail: "billing@northframe.co"
  };

  assert.equal(
    isBuyerSettingsDirty(initial, {
      companyName: "Northframe Creative",
      billingEmail: "billing@northframe.co"
    }),
    false
  );
  assert.equal(
    isBuyerSettingsDirty(initial, {
      companyName: "Northframe Studios",
      billingEmail: "billing@northframe.co"
    }),
    true
  );
});

test("buyer profile update validation accepts production profile fields", () => {
  const result = validateBuyerSettings({
    companyName: "Northframe Studios",
    billingEmail: "accounts@northframe.co"
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, {
      companyName: "Northframe Studios",
      billingEmail: "accounts@northframe.co"
    });
  }
});

test("buyer profile update builds the Supabase persistence payload", () => {
  assert.deepEqual(
    buildBuyerProfileUpdate(
      {
        companyName: "  Northframe Studios  ",
        billingEmail: "  Accounts@Northframe.CO  "
      },
      "2026-04-30T12:00:00.000Z"
    ),
    {
      company_name: "Northframe Studios",
      billing_email: "accounts@northframe.co",
      updated_at: "2026-04-30T12:00:00.000Z"
    }
  );
});

test("password update validation requires current password and matching new password", () => {
  assert.deepEqual(
    validatePasswordChange({
      currentPassword: "",
      newPassword: "NewPassword123!",
      confirmPassword: "NewPassword123!"
    }),
    {
      ok: false,
      error: "Enter your current password."
    }
  );
  assert.deepEqual(
    validatePasswordChange({
      currentPassword: "CurrentPassword123!",
      newPassword: "NewPassword123!",
      confirmPassword: "DifferentPassword123!"
    }),
    {
      ok: false,
      error: "New passwords must match."
    }
  );
  assert.deepEqual(
    validatePasswordChange({
      currentPassword: "CurrentPassword123!",
      newPassword: "NewPassword123!",
      confirmPassword: "NewPassword123!"
    }),
    {
      ok: true,
      value: {
        currentPassword: "CurrentPassword123!",
        newPassword: "NewPassword123!"
      }
    }
  );
});

test("password update builds the Supabase auth update payload", () => {
  assert.deepEqual(buildPasswordUpdatePayload("NewPassword123!"), {
    password: "NewPassword123!"
  });
});

test("email update validation normalizes email before confirmation request", () => {
  assert.deepEqual(
    validateEmailChange({
      newEmail: "  Buyer@TheSyncExchange.COM  "
    }),
    {
      ok: true,
      value: {
        newEmail: "buyer@thesyncexchange.com"
      }
    }
  );
});

test("email update builds the Supabase auth confirmation payload", () => {
  assert.deepEqual(buildEmailUpdatePayload("  Buyer@TheSyncExchange.COM  "), {
    email: "buyer@thesyncexchange.com"
  });
});

test("logout from all sessions uses Supabase global sign out scope", () => {
  assert.deepEqual(buildGlobalSignOutOptions(), {
    scope: "global"
  });
});

test("buyer settings auth guard requires a current Supabase user", () => {
  assert.deepEqual(assertAuthenticatedBuyerSettingsUser(null), {
    ok: false,
    status: 401,
    error: "Unauthorized."
  });
  assert.deepEqual(assertAuthenticatedBuyerSettingsUser({ id: "user_123", email: "buyer@example.com" }), {
    ok: true,
    user: {
      id: "user_123",
      email: "buyer@example.com"
    }
  });
});

test("billing portal return URL points to the account settings alias", () => {
  assert.equal(buildBillingPortalReturnUrl("https://thesyncexchange.com"), "https://thesyncexchange.com/settings");
});

test("Stripe invoice mapping keeps receipt data server-safe and user-readable", () => {
  assert.deepEqual(
    mapStripeInvoice({
      id: "in_123",
      created: 1777584000,
      amount_paid: 12900,
      currency: "usd",
      status: "paid",
      hosted_invoice_url: "https://invoice.stripe.test/in_123"
    }),
    {
      id: "in_123",
      date: "2026-04-30T21:20:00.000Z",
      amountCents: 12900,
      currency: "USD",
      status: "paid",
      url: "https://invoice.stripe.test/in_123"
    }
  );
});

test("notification preferences persist enabled buyer settings while security alerts stay required", () => {
  const initial = normalizeNotificationPreferences(null);
  const current = normalizeNotificationPreferences({
    purchaseReceipts: false,
    licenseAgreementReady: true,
    platformUpdates: false,
    securityAlerts: false
  });

  assert.equal(isNotificationPreferencesDirty(initial, current), true);
  assert.deepEqual(buildNotificationPreferencesUpsert("user_123", current), {
    user_id: "user_123",
    purchase_receipts: false,
    license_agreement_ready: true,
    platform_updates: false,
    security_alerts: true
  });
});

test("team invite validation normalizes and creates a pending invite without granting access", () => {
  const validation = validateTeamInvite({
    email: " Finance@Example.COM ",
    role: "Billing"
  });

  assert.equal(validation.ok, true);
  if (validation.ok) {
    assert.deepEqual(
      buildTeamInviteInsert({
        buyerUserId: "buyer_123",
        invitedBy: "owner_123",
        invite: validation.value
      }),
      {
        buyer_user_id: "buyer_123",
        invited_by: "owner_123",
        email: "finance@example.com",
        role: "billing",
        status: "pending"
      }
    );
  }
});

test("legal settings only surface completed orders with agreement links", () => {
  assert.deepEqual(
    mapLegalOrdersForSettings([
      {
        id: "order_ready",
        created_at: "2026-04-30T12:00:00.000Z",
        agreement_ready: true,
        agreement_url: "/api/orders/order_ready/agreement",
        track: { title: "Midnight Ledger" },
        license_type: { name: "Standard Sync" }
      },
      {
        id: "order_pending",
        created_at: "2026-04-30T13:00:00.000Z",
        agreement_ready: false,
        agreement_url: null,
        track: { title: "No Agreement Yet" },
        license_type: { name: "Standard Sync" }
      }
    ]),
    [
      {
        id: "order_ready",
        title: "Midnight Ledger",
        licenseName: "Standard Sync",
        agreementUrl: "/api/orders/order_ready/agreement",
        createdAt: "2026-04-30T12:00:00.000Z"
      }
    ]
  );
});
