import type { UserRole } from "../../types/models";

export interface AppUserIdentity {
  id: string;
  email: string;
  role: UserRole | null;
  fullName: string;
  onboardingStep?: string | null;
  onboardingStartedAt?: string | null;
  onboardingCompletedAt?: string | null;
  onboardingData?: Record<string, unknown>;
}

export function reconcileAppUserProfile(options: {
  user: AppUserIdentity;
  lookup: (userId: string) => Promise<{ data: { role: UserRole | null } | null; error: unknown }>;
  getClient: (role: UserRole | null) => Promise<any>;
}): Promise<void>;
