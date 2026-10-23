import { AnalyticsProvider } from "@/components/analytics/provider";
import { OnboardingInteraction } from "@/components/analytics/onboarding-interaction";
import { analyticsConfig } from "@/services/analytics/server";
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
    <AnalyticsProvider key={user.id} userId={user.id} enabled={!!analyticsConfig()}><OnboardingInteraction>
    <BuyerOnboardingFlow
      step={state.currentStep}
      values={state.values}
      error={searchParams?.error}
      saveAction={saveBuyerOnboardingStepAction}
      finishAction={finishBuyerOnboardingAction}
    />
    </OnboardingInteraction></AnalyticsProvider>
  );
}
