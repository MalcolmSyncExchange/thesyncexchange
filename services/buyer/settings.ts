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

export type BuyerNotificationPreferences = {
  purchaseReceipts: boolean;
  licenseAgreementReady: boolean;
  platformUpdates: boolean;
  securityAlerts: boolean;
};

export type BuyerTeamInviteInput = {
  email: string;
  role: "admin" | "member" | "billing";
};

export type BuyerSettingsAuthUser = {
  id?: string | null;
  email?: string | null;
};

export const MIN_ACCOUNT_PASSWORD_LENGTH = 8;
export const defaultBuyerNotificationPreferences: BuyerNotificationPreferences = {
  purchaseReceipts: true,
  licenseAgreementReady: true,
  platformUpdates: true,
  securityAlerts: true
};

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

export function buildGlobalSignOutOptions() {
  return {
    scope: "global" as const
  };
}

export function assertAuthenticatedBuyerSettingsUser(user: BuyerSettingsAuthUser | null | undefined) {
  if (!user?.id) {
    return {
      ok: false as const,
      status: 401,
      error: "Unauthorized."
    };
  }

  return {
    ok: true as const,
    user: {
      id: user.id,
      email: user.email || null
    }
  };
}

export function normalizeNotificationPreferences(input: Partial<BuyerNotificationPreferences> | null | undefined): BuyerNotificationPreferences {
  return {
    purchaseReceipts: input?.purchaseReceipts ?? defaultBuyerNotificationPreferences.purchaseReceipts,
    licenseAgreementReady: input?.licenseAgreementReady ?? defaultBuyerNotificationPreferences.licenseAgreementReady,
    platformUpdates: input?.platformUpdates ?? defaultBuyerNotificationPreferences.platformUpdates,
    securityAlerts: true
  };
}

export function isNotificationPreferencesDirty(initial: BuyerNotificationPreferences, current: BuyerNotificationPreferences) {
  const normalizedInitial = normalizeNotificationPreferences(initial);
  const normalizedCurrent = normalizeNotificationPreferences(current);

  return (
    normalizedInitial.purchaseReceipts !== normalizedCurrent.purchaseReceipts ||
    normalizedInitial.licenseAgreementReady !== normalizedCurrent.licenseAgreementReady ||
    normalizedInitial.platformUpdates !== normalizedCurrent.platformUpdates
  );
}

export function buildNotificationPreferencesUpsert(userId: string, input: Partial<BuyerNotificationPreferences>) {
  const normalized = normalizeNotificationPreferences(input);

  return {
    user_id: userId,
    purchase_receipts: normalized.purchaseReceipts,
    license_agreement_ready: normalized.licenseAgreementReady,
    platform_updates: normalized.platformUpdates,
    security_alerts: true
  };
}

export function mapNotificationPreferencesRow(
  row:
    | {
        purchase_receipts?: boolean | null;
        license_agreement_ready?: boolean | null;
        platform_updates?: boolean | null;
        security_alerts?: boolean | null;
      }
    | null
    | undefined
) {
  return normalizeNotificationPreferences({
    purchaseReceipts: row?.purchase_receipts ?? undefined,
    licenseAgreementReady: row?.license_agreement_ready ?? undefined,
    platformUpdates: row?.platform_updates ?? undefined,
    securityAlerts: row?.security_alerts ?? undefined
  });
}

export function validateTeamInvite(input: { email?: string | null; role?: string | null }) {
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  const role = String(input.role || "").toLowerCase();

  if (!isValidEmail(email)) {
    return {
      ok: false as const,
      error: "Enter a valid team member email."
    };
  }

  if (!["admin", "member", "billing"].includes(role)) {
    return {
      ok: false as const,
      error: "Choose a valid team role."
    };
  }

  return {
    ok: true as const,
    value: {
      email,
      role: role as BuyerTeamInviteInput["role"]
    }
  };
}

export function buildTeamInviteInsert({
  buyerUserId,
  invitedBy,
  invite
}: {
  buyerUserId: string;
  invitedBy: string;
  invite: BuyerTeamInviteInput;
}) {
  return {
    buyer_user_id: buyerUserId,
    invited_by: invitedBy,
    email: invite.email.trim().toLowerCase(),
    role: invite.role,
    status: "pending"
  };
}

export function buildBillingPortalReturnUrl(appUrl: string) {
  return new URL("/settings", appUrl).toString();
}

export function mapStripeInvoice(invoice: {
  id: string;
  created: number;
  amount_paid?: number | null;
  amount_due?: number | null;
  currency?: string | null;
  status?: string | null;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
}) {
  return {
    id: invoice.id,
    date: new Date(invoice.created * 1000).toISOString(),
    amountCents: Number(invoice.amount_paid ?? invoice.amount_due ?? 0),
    currency: String(invoice.currency || "usd").toUpperCase(),
    status: invoice.status || "unknown",
    url: invoice.hosted_invoice_url || invoice.invoice_pdf || null
  };
}

export function mapLegalOrdersForSettings(
  orders: Array<{
    id: string;
    created_at?: string | null;
    agreement_ready?: boolean | null;
    agreement_url?: string | null;
    track?: { title?: string | null } | null;
    license_type?: { name?: string | null } | null;
  }>
) {
  return orders
    .filter((order) => order.agreement_ready && order.agreement_url)
    .slice(0, 5)
    .map((order) => ({
      id: order.id,
      title: order.track?.title || "Licensed Track",
      licenseName: order.license_type?.name || "License",
      agreementUrl: order.agreement_url as string,
      createdAt: order.created_at || ""
    }));
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
