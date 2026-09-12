import { BuyerOnboardingFlow } from "@/components/forms/onboarding-forms";
import { getBuyerOnboardingState } from "@/services/auth/onboarding";
import { finishBuyerOnboardingAction, saveBuyerOnboardingStepAction } from "@/services/auth/actions";
import { requireOnboardingSession } from "@/services/auth/session";

export default async function BuyerOnboardingPage(
  props: {
    searchParams?: Promise<{ error?: string; step?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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
