import { AnalyticsProvider } from "@/components/analytics/provider";
import { OnboardingInteraction } from "@/components/analytics/onboarding-interaction";
import { analyticsConfig } from "@/services/analytics/server";
import { ArtistOnboardingFlow } from "@/components/forms/onboarding-forms";
import { getArtistOnboardingState } from "@/services/auth/onboarding";
import { finishArtistOnboardingAction, saveArtistOnboardingStepAction } from "@/services/auth/actions";
import { requireOnboardingSession } from "@/services/auth/session";

export default async function ArtistOnboardingPage(
  props: {
    searchParams?: Promise<{ error?: string; step?: string; cleanup?: string; saved?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await requireOnboardingSession("artist");
  const state = await getArtistOnboardingState(user, searchParams?.step);

  return (
    <AnalyticsProvider key={user.id} userId={user.id} enabled={!!analyticsConfig()}><OnboardingInteraction>
    <ArtistOnboardingFlow
      step={state.currentStep}
      values={state.values}
      error={searchParams?.error}
      saved={searchParams?.saved === "1"}
      cleanupPending={searchParams?.cleanup === "pending"}
      saveAction={saveArtistOnboardingStepAction}
      finishAction={finishArtistOnboardingAction}
    />
    </OnboardingInteraction></AnalyticsProvider>
  );
}
