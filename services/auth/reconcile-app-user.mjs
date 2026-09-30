const ROLES = new Set(["artist", "buyer", "admin"]);

function existingRole(value) {
  return ROLES.has(value) ? value : null;
}

/** Login reconciles identity without replaying onboarding defaults over an existing profile. */
export async function reconcileAppUserProfile({ user, lookup, getClient }) {
  const found = await lookup(user.id);
  if (found.error) throw found.error;

  const persistedRole = existingRole(found.data?.role);
  const roleToPersist = persistedRole || existingRole(user.role);

  if (found.data) {
    // Only a trusted, previously resolved role may fill a missing role. Never
    // update an existing onboarding, payout, avatar, or profile field on login.
    if (!persistedRole && roleToPersist) {
      const client = await getClient(roleToPersist);
      const result = await client.from("user_profiles").update({ role: roleToPersist }).eq("id", user.id).is("role", null);
      if (result.error) throw result.error;
    }
    return;
  }

  const initial = {
    id: user.id,
    email: user.email,
    role: roleToPersist,
    full_name: user.fullName
  };
  if (user.onboardingStartedAt !== undefined) initial.onboarding_started_at = user.onboardingStartedAt;
  if (user.onboardingCompletedAt !== undefined) initial.onboarding_completed_at = user.onboardingCompletedAt;
  if (user.onboardingStep !== undefined) initial.onboarding_step = user.onboardingStep;
  if (user.onboardingData !== undefined) {
    initial.onboarding_payload = Object.fromEntries(
      Object.entries(user.onboardingData).filter(([key]) => !["payoutEmail", "avatarPath", "avatarUrl", "avatar_path", "avatar_url"].includes(key))
    );
  }

  const client = await getClient(roleToPersist);
  const result = await client.from("user_profiles").insert(initial);
  if (result.error?.code === "23505") {
    // An Auth trigger or concurrent login may have inserted the row first.
    // Observe it; never turn the duplicate into an overwriting upsert.
    const raced = await lookup(user.id);
    if (!raced.error && raced.data) return;
  }
  if (result.error) throw result.error;
}
