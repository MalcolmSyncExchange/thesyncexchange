import { BuyerOnboardingFlow } from "@/components/forms/onboarding-forms";
import { getBuyerOnboardingState } from "@/services/auth/onboarding";
import { finishBuyerOnboardingAction, saveBuyerOnboardingStepAction } from "@/services/auth/actions";
import { requireOnboardingSession } from "@/services/auth/session";

export default async function BuyerOnboardingPage({
  searchParams
}: {
  searchParams?: { error?: string; step?: string };
}) {
  const user = await requireOnboardingSession("buyer");
  const state = await getBuyerOnboardingState(user, searchParams?.step);

  return (
    <BuyerOnboardingFlow
      step={state.currentStep}
      values={state.values}
      error={searchParams?.error}
      saveAction={saveBuyerOnboardingStepAction}
      finishAction={finishBuyerOnboardingAction}
    />
  );
}
