import { z } from "zod";

import type { ArtistOnboardingStep, BuyerOnboardingStep } from "@/types/models";

const optionalUrlField = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || "")
  .refine((value) => !value || /^https?:\/\//.test(value), "Use a full URL that starts with http:// or https://.");

const optionalTextField = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || "");

export const artistOnboardingSteps: Array<{ id: ArtistOnboardingStep; label: string }> = [
  { id: "basics", label: "Account basics" },
  { id: "profile", label: "Professional profile" },
  { id: "licensing", label: "Licensing setup" },
  { id: "first-track", label: "First track" },
  { id: "complete", label: "Complete" }
];

export const buyerOnboardingSteps: Array<{ id: BuyerOnboardingStep; label: string }> = [
  { id: "basics", label: "Account basics" },
  { id: "profile", label: "Buyer profile" },
  { id: "interests", label: "Music interests" },
  { id: "complete", label: "Complete" }
];

export const buyerGenreOptions = ["Electronic", "Pop", "Indie Pop", "Hip-Hop", "Cinematic", "Folk", "Rock", "Ambient"];
export const buyerMoodOptions = ["Driving", "Warm", "Hopeful", "Dark", "Tense", "Bright", "Emotive", "Confident"];
export const buyerTypeOptions = ["Music Supervisor", "Producer", "Creative Director", "Brand Marketer", "Editor"];
export const industryTypeOptions = ["Advertising", "Film & TV", "Gaming", "Branded Content", "Streaming", "Agency"];

export const artistBasicsSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name."),
  artistName: z.string().trim().min(2, "Enter your artist or stage name."),
  avatarUrl: optionalUrlField
});

export const artistProfileSchema = z.object({
  bio: z.string().trim().min(24, "Add a short bio that helps buyers understand your sound."),
  location: z.string().trim().min(2, "Enter your location."),
  website: optionalUrlField,
  instagram: optionalTextField,
  spotify: optionalUrlField,
  youtube: optionalUrlField
});

export const artistLicensingSchema = z.object({
  payoutEmail: z.string().trim().email("Enter a valid payout email."),
  defaultLicensingPreferences: optionalTextField
});

export const artistFirstTrackSchema = z.object({
  firstTrackChoice: z.enum(["upload", "later"], {
    required_error: "Choose whether you want to upload your first track now or later."
  })
});

export const buyerBasicsSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name."),
  companyName: z.string().trim().min(2, "Enter your company name.")
});

export const buyerProfileSchema = z.object({
  buyerType: z.string().trim().min(2, "Select the role you play on the buying side."),
  industryType: z.string().trim().min(2, "Select your industry type."),
  billingEmail: z.string().trim().email("Enter a valid billing email.")
});

export const buyerInterestsSchema = z.object({
  genres: z.array(z.string()).min(1, "Choose at least one genre."),
  moods: z.array(z.string()).min(1, "Choose at least one mood."),
  intendedUse: optionalTextField
});

export function parseArtistBasics(formData: FormData) {
  return artistBasicsSchema.parse({
    fullName: formData.get("fullName"),
    artistName: formData.get("artistName"),
    avatarUrl: formData.get("avatarUrl")
  });
}

export function parseArtistProfile(formData: FormData) {
  return artistProfileSchema.parse({
    bio: formData.get("bio"),
    location: formData.get("location"),
    website: formData.get("website"),
    instagram: formData.get("instagram"),
    spotify: formData.get("spotify"),
    youtube: formData.get("youtube")
  });
}

export function parseArtistLicensing(formData: FormData) {
  return artistLicensingSchema.parse({
    payoutEmail: formData.get("payoutEmail"),
    defaultLicensingPreferences: formData.get("defaultLicensingPreferences")
  });
}

export function parseArtistFirstTrack(formData: FormData) {
  return artistFirstTrackSchema.parse({
    firstTrackChoice: formData.get("firstTrackChoice")
  });
}

export function parseBuyerBasics(formData: FormData) {
  return buyerBasicsSchema.parse({
    fullName: formData.get("fullName"),
    companyName: formData.get("companyName")
  });
}

export function parseBuyerProfile(formData: FormData) {
  return buyerProfileSchema.parse({
    buyerType: formData.get("buyerType"),
    industryType: formData.get("industryType"),
    billingEmail: formData.get("billingEmail")
  });
}

export function parseBuyerInterests(formData: FormData) {
  return buyerInterestsSchema.parse({
    genres: formData.getAll("genres").map(String),
    moods: formData.getAll("moods").map(String),
    intendedUse: formData.get("intendedUse")
  });
}

export function getArtistStepIndex(step: string | null | undefined) {
  const index = artistOnboardingSteps.findIndex((item) => item.id === step);
  return index === -1 ? 0 : index;
}

export function getBuyerStepIndex(step: string | null | undefined) {
  const index = buyerOnboardingSteps.findIndex((item) => item.id === step);
  return index === -1 ? 0 : index;
}

export function getNextArtistStep(step: ArtistOnboardingStep): ArtistOnboardingStep {
  const index = getArtistStepIndex(step);
  return artistOnboardingSteps[Math.min(index + 1, artistOnboardingSteps.length - 1)].id;
}

export function getNextBuyerStep(step: BuyerOnboardingStep): BuyerOnboardingStep {
  const index = getBuyerStepIndex(step);
  return buyerOnboardingSteps[Math.min(index + 1, buyerOnboardingSteps.length - 1)].id;
}

export function getPreviousArtistStep(step: ArtistOnboardingStep) {
  const index = getArtistStepIndex(step);
  return artistOnboardingSteps[Math.max(index - 1, 0)].id;
}

export function getPreviousBuyerStep(step: BuyerOnboardingStep) {
  const index = getBuyerStepIndex(step);
  return buyerOnboardingSteps[Math.max(index - 1, 0)].id;
}

export function getValidationErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message || "Please review the highlighted fields and try again.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
