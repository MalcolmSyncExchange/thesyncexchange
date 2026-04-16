import type { UserRole } from "@/types/models";

export function inferOnboardingCompletionState({
  role,
  onboardingCompletedAt,
  onboardingStep,
  hasArtistProfile,
  hasBuyerProfile
}: {
  role: UserRole | null;
  onboardingCompletedAt?: string | null;
  onboardingStep?: string | null;
  hasArtistProfile?: boolean;
  hasBuyerProfile?: boolean;
}) {
  if (role === "admin") {
    return true;
  }

  if (!role) {
    return false;
  }

  if (onboardingCompletedAt) {
    return true;
  }

  if (onboardingStep) {
    return false;
  }

  if (role === "artist") {
    return Boolean(hasArtistProfile);
  }

  return Boolean(hasBuyerProfile);
}
