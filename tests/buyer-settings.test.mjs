import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBuyerProfileUpdate,
  buildEmailUpdatePayload,
  buildPasswordUpdatePayload,
  isBuyerSettingsDirty,
  normalizeBuyerSettings,
  validateBuyerSettings,
  validateEmailChange,
  validatePasswordChange
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
