import { buyerOnboardingSteps, artistOnboardingSteps, getArtistStepIndex, getBuyerStepIndex } from "@/lib/validation/onboarding";
import { env, hasSupabaseEnv } from "@/lib/env";
import { getDemoArtistProfile, getDemoBuyerProfile } from "@/services/auth/demo-store";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { ArtistOnboardingStep, BuyerOnboardingStep, SessionUser } from "@/types/models";

export interface ArtistOnboardingValues {
  fullName: string;
  artistName: string;
  avatarUrl: string;
  bio: string;
  location: string;
  website: string;
  instagram: string;
  spotify: string;
  youtube: string;
  payoutEmail: string;
  defaultLicensingPreferences: string;
  firstTrackChoice: "upload" | "later";
}

export interface BuyerOnboardingValues {
  fullName: string;
  companyName: string;
  buyerType: string;
  industryType: string;
  billingEmail: string;
  genres: string[];
  moods: string[];
  intendedUse: string;
}

export async function getArtistOnboardingState(user: SessionUser, requestedStep?: string) {
  const profile = await getArtistProfile(user.id);
  const payload = user.onboardingData || {};
  const currentStep = resolveArtistStep(user.onboardingStep, requestedStep);

  return {
    currentStep,
    currentStepIndex: getArtistStepIndex(currentStep),
    steps: artistOnboardingSteps,
    values: {
      fullName: String(payload.fullName || user.fullName || ""),
      artistName: String(payload.artistName || profile?.artist_name || ""),
      avatarUrl: String(payload.avatarUrl || user.avatarUrl || ""),
      bio: String(payload.bio || profile?.bio || ""),
      location: String(payload.location || profile?.location || ""),
      website: String(payload.website || profile?.website || ""),
      instagram: String(payload.instagram || profile?.social_links?.instagram || ""),
      spotify: String(payload.spotify || profile?.social_links?.spotify || ""),
      youtube: String(payload.youtube || profile?.social_links?.youtube || ""),
      payoutEmail: String(payload.payoutEmail || profile?.payout_email || ""),
      defaultLicensingPreferences: String(payload.defaultLicensingPreferences || profile?.default_licensing_preferences || ""),
      firstTrackChoice: payload.firstTrackChoice === "upload" ? "upload" : "later"
    } satisfies ArtistOnboardingValues
  };
}

export async function getBuyerOnboardingState(user: SessionUser, requestedStep?: string) {
  const profile = await getBuyerProfile(user.id);
  const payload = user.onboardingData || {};
  const preferences = profile?.music_preferences || {};
  const currentStep = resolveBuyerStep(user.onboardingStep, requestedStep);

  return {
    currentStep,
    currentStepIndex: getBuyerStepIndex(currentStep),
    steps: buyerOnboardingSteps,
    values: {
      fullName: String(payload.fullName || user.fullName || ""),
      companyName: String(payload.companyName || profile?.company_name || ""),
      buyerType: String(payload.buyerType || profile?.buyer_type || ""),
      industryType: String(payload.industryType || profile?.industry_type || ""),
      billingEmail: String(payload.billingEmail || profile?.billing_email || ""),
      genres: Array.isArray(payload.genres) ? payload.genres.map(String) : Array.isArray(preferences.genres) ? preferences.genres.map(String) : [],
      moods: Array.isArray(payload.moods) ? payload.moods.map(String) : Array.isArray(preferences.moods) ? preferences.moods.map(String) : [],
      intendedUse: String(payload.intendedUse || preferences.intended_use || "")
    } satisfies BuyerOnboardingValues
  };
}

export function resolveArtistStep(currentStep?: string | null, requestedStep?: string) {
  const persistedStep = sanitizeArtistStep(currentStep);
  if (!requestedStep) {
    return persistedStep;
  }

  const requested = sanitizeArtistStep(requestedStep);
  return getArtistStepIndex(requested) <= getArtistStepIndex(persistedStep) ? requested : persistedStep;
}

export function resolveBuyerStep(currentStep?: string | null, requestedStep?: string) {
  const persistedStep = sanitizeBuyerStep(currentStep);
  if (!requestedStep) {
    return persistedStep;
  }

  const requested = sanitizeBuyerStep(requestedStep);
  return getBuyerStepIndex(requested) <= getBuyerStepIndex(persistedStep) ? requested : persistedStep;
}

function sanitizeArtistStep(step?: string | null): ArtistOnboardingStep {
  if (step === "basics" || step === "profile" || step === "licensing" || step === "first-track" || step === "complete") {
    return step;
  }
  return "basics";
}

function sanitizeBuyerStep(step?: string | null): BuyerOnboardingStep {
  if (step === "basics" || step === "profile" || step === "interests" || step === "complete") {
    return step;
  }
  return "basics";
}

async function getArtistProfile(userId: string) {
  if (!hasSupabaseEnv || env.demoMode) {
    return getDemoArtistProfile(userId);
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase.from("artist_profiles").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

async function getBuyerProfile(userId: string) {
  if (!hasSupabaseEnv || env.demoMode) {
    return getDemoBuyerProfile(userId);
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase.from("buyer_profiles").select("*").eq("user_id", userId).maybeSingle();
  return data;
}
