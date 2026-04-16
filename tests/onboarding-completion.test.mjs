import test from "node:test";
import assert from "node:assert/strict";

import { inferOnboardingCompletionState } from "../services/auth/onboarding-completion.ts";

test("in-progress complete step still requires final onboarding completion timestamp", () => {
  const result = inferOnboardingCompletionState({
    role: "buyer",
    onboardingCompletedAt: null,
    onboardingStep: "complete",
    hasBuyerProfile: true
  });

  assert.equal(result, false);
});

test("completed onboarding is true once completion timestamp is present", () => {
  const result = inferOnboardingCompletionState({
    role: "buyer",
    onboardingCompletedAt: "2026-04-15T18:00:00.000Z",
    onboardingStep: "complete",
    hasBuyerProfile: true
  });

  assert.equal(result, true);
});

test("legacy buyer records without onboarding state still count as complete", () => {
  const result = inferOnboardingCompletionState({
    role: "buyer",
    onboardingCompletedAt: null,
    onboardingStep: null,
    hasBuyerProfile: true
  });

  assert.equal(result, true);
});

test("artist review step stays incomplete until finish action records completion", () => {
  const result = inferOnboardingCompletionState({
    role: "artist",
    onboardingCompletedAt: null,
    onboardingStep: "complete",
    hasArtistProfile: true
  });

  assert.equal(result, false);
});
