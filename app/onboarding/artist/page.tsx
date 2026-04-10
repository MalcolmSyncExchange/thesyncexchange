import { ArtistOnboardingFlow } from "@/components/forms/onboarding-forms";
import { getArtistOnboardingState } from "@/services/auth/onboarding";
import { finishArtistOnboardingAction, saveArtistOnboardingStepAction } from "@/services/auth/actions";
import { requireOnboardingSession } from "@/services/auth/session";

export default async function ArtistOnboardingPage({
  searchParams
}: {
  searchParams?: { error?: string; step?: string };
}) {
  const user = await requireOnboardingSession("artist");
  const state = await getArtistOnboardingState(user, searchParams?.step);

  return (
    <ArtistOnboardingFlow
      step={state.currentStep}
      values={state.values}
      error={searchParams?.error}
      saveAction={saveArtistOnboardingStepAction}
      finishAction={finishArtistOnboardingAction}
    />
  );
}
