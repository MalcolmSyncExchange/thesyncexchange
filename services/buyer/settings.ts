export type BuyerProfileSettingsInput = {
  companyName: string;
  billingEmail: string;
};

export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type EmailChangeInput = {
  newEmail: string;
};

export const MIN_ACCOUNT_PASSWORD_LENGTH = 8;

export function normalizeBuyerSettings(input: BuyerProfileSettingsInput): BuyerProfileSettingsInput {
  return {
    companyName: String(input.companyName || "").trim(),
    billingEmail: String(input.billingEmail || "")
      .trim()
      .toLowerCase()
  };
}

export function isBuyerSettingsDirty(initial: BuyerProfileSettingsInput, current: BuyerProfileSettingsInput) {
  const normalizedInitial = normalizeBuyerSettings(initial);
  const normalizedCurrent = normalizeBuyerSettings(current);

  return normalizedInitial.companyName !== normalizedCurrent.companyName || normalizedInitial.billingEmail !== normalizedCurrent.billingEmail;
}

export function validateBuyerSettings(input: BuyerProfileSettingsInput) {
  const normalized = normalizeBuyerSettings(input);

  if (normalized.companyName.length < 2) {
    return {
      ok: false as const,
      error: "Enter a company name."
    };
  }

  if (!isValidEmail(normalized.billingEmail)) {
    return {
      ok: false as const,
      error: "Enter a valid billing email."
    };
  }

  return {
    ok: true as const,
    value: normalized
  };
}

export function validatePasswordChange(input: PasswordChangeInput) {
  const currentPassword = String(input.currentPassword || "");
  const newPassword = String(input.newPassword || "");
  const confirmPassword = String(input.confirmPassword || "");

  if (!currentPassword) {
    return {
      ok: false as const,
      error: "Enter your current password."
    };
  }

  if (newPassword.length < MIN_ACCOUNT_PASSWORD_LENGTH) {
    return {
      ok: false as const,
      error: `New password must be at least ${MIN_ACCOUNT_PASSWORD_LENGTH} characters.`
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      ok: false as const,
      error: "New passwords must match."
    };
  }

  return {
    ok: true as const,
    value: {
      currentPassword,
      newPassword
    }
  };
}

export function validateEmailChange(input: EmailChangeInput) {
  const newEmail = String(input.newEmail || "")
    .trim()
    .toLowerCase();

  if (!isValidEmail(newEmail)) {
    return {
      ok: false as const,
      error: "Enter a valid email address."
    };
  }

  return {
    ok: true as const,
    value: {
      newEmail
    }
  };
}

export function buildBuyerProfileUpdate(value: BuyerProfileSettingsInput, updatedAt = new Date().toISOString()) {
  const normalized = normalizeBuyerSettings(value);

  return {
    company_name: normalized.companyName,
    billing_email: normalized.billingEmail,
    updated_at: updatedAt
  };
}

export function buildPasswordUpdatePayload(newPassword: string) {
  return {
    password: newPassword
  };
}

export function buildEmailUpdatePayload(newEmail: string) {
  return {
    email: newEmail.trim().toLowerCase()
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
