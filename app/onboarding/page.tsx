import { redirect } from "next/navigation";

import { OnboardingRoleSelection } from "@/components/forms/onboarding-forms";
import { selectOnboardingRoleAction } from "@/services/auth/actions";
import { getSessionUser, resolveOnboardingPath, resolveRoleRedirect } from "@/services/auth/session";

export default async function OnboardingEntryPage({
  searchParams
}: {
  searchParams?: { error?: string };
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login?redirectTo=/onboarding");
  }

  if (user.role === "admin") {
    redirect("/dashboard/admin");
  }

  if ((user.role === "artist" || user.role === "buyer") && user.onboardingComplete) {
    redirect(resolveRoleRedirect(user.role));
  }

  if (user.role === "artist" || user.role === "buyer") {
    redirect(resolveOnboardingPath(user.role));
  }

  return <OnboardingRoleSelection error={searchParams?.error} action={selectOnboardingRoleAction} />;
}
