export type BuyerProfileRecordLike = {
  company_name?: unknown;
  buyer_type?: unknown;
  industry_type?: unknown;
  billing_email?: unknown;
  music_preferences?: unknown;
} | null;

export type BuyerProfileUpsertLike = {
  user_id: string;
  company_name: string;
  buyer_type: string;
  industry_type: string;
  billing_email: string;
  music_preferences?: unknown;
};

export function buildBuyerProfileUpsert(args: {
  userId: string;
  onboardingPayload?: Record<string, unknown> | null;
  profileUpdates?: Record<string, unknown> | null;
  existingProfile?: BuyerProfileRecordLike;
}) {
  const onboardingPayload = args.onboardingPayload || {};
  const profileUpdates = args.profileUpdates || {};
  const existingProfile = args.existingProfile || null;

  const companyName = firstNonEmptyString(
    profileUpdates.company_name,
    onboardingPayload.companyName,
    existingProfile?.company_name
  );
  const buyerType = firstNonEmptyString(
    profileUpdates.buyer_type,
    onboardingPayload.buyerType,
    existingProfile?.buyer_type
  );
  const industryType = firstNonEmptyString(
    profileUpdates.industry_type,
    onboardingPayload.industryType,
    existingProfile?.industry_type
  );
  const billingEmail = firstNonEmptyString(
    profileUpdates.billing_email,
    onboardingPayload.billingEmail,
    existingProfile?.billing_email
  );

  const missingRequiredFields = [
    !companyName ? "company_name" : null,
    !buyerType ? "buyer_type" : null,
    !industryType ? "industry_type" : null,
    !billingEmail ? "billing_email" : null
  ].filter((value): value is string => Boolean(value));

  if (missingRequiredFields.length > 0) {
    return {
      upsert: null,
      missingRequiredFields
    };
  }

  const upsert: BuyerProfileUpsertLike = {
    user_id: args.userId,
    company_name: companyName!,
    buyer_type: buyerType!,
    industry_type: industryType!,
    billing_email: billingEmail!
  };

  if (Object.prototype.hasOwnProperty.call(profileUpdates, "music_preferences")) {
    upsert.music_preferences = profileUpdates.music_preferences ?? {};
  } else if (existingProfile && Object.prototype.hasOwnProperty.call(existingProfile, "music_preferences")) {
    upsert.music_preferences = existingProfile.music_preferences ?? {};
  }

  return {
    upsert,
    missingRequiredFields
  };
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}
