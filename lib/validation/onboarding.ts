import { z } from "zod";

import type { ArtistOnboardingStep, BuyerOnboardingStep } from "@/types/models";

const acceptedAvatarExtensions = [".jpg", ".jpeg", ".png", ".webp"];

export const avatarAssetRule = {
  label: "Profile image",
  maxSizeBytes: 10 * 1024 * 1024,
  allowedExtensions: acceptedAvatarExtensions
} as const;

const optionalUrlField = z.string().trim().max(2048, "Keep links under 2048 characters.")
  .refine((value) => {
    if (!value) return true;
    try { const url = new URL(value); return /^https?:$/.test(url.protocol) && Boolean(url.hostname) && !/\s/.test(value); }
    catch { return false; }
  }, "Enter a valid full http:// or https:// URL.").optional();
const optionalTextField = z.string().trim().optional().transform((value) => value || "");
const optionalArtistText = z.string().trim().max(3000, "Keep preferences under 3000 characters.").optional();

export const artistSaveStepSchema = z.enum(["basics", "profile", "licensing", "first-track"], {
  errorMap: () => ({ message: "Choose a supported onboarding step and reload before saving." })
});

export function assertArtistStepTransition(step: string, currentStep?: string | null, completed = false) {
  const checked = artistSaveStepSchema.parse(step);
  if (completed) throw new Error("Onboarding is already complete. Open your artist workspace.");
  if (!artistOnboardingSteps.some((item) => item.id === (currentStep || "basics")) ||
      getArtistStepIndex(checked) > getArtistStepIndex(currentStep || "basics")) {
    throw new Error("Complete the previous onboarding step before continuing.");
  }
  return checked;
}

export const artistOnboardingSteps: Array<{ id: ArtistOnboardingStep; label: string; summary: string }> = [
  { id: "basics", label: "Account basics", summary: "Identity, stage name, and profile media" },
  { id: "profile", label: "Professional profile", summary: "Bio, location, and public-facing context" },
  { id: "licensing", label: "Licensing setup", summary: "Payout and default licensing preferences" },
  { id: "first-track", label: "First track", summary: "Choose the handoff into submission or dashboard" },
  { id: "complete", label: "Complete", summary: "Review the setup and move into real work" }
];

export const buyerOnboardingSteps: Array<{ id: BuyerOnboardingStep; label: string; summary: string }> = [
  { id: "basics", label: "Account basics", summary: "Buyer identity and company anchor" },
  { id: "profile", label: "Buyer profile", summary: "Operational role, industry, and billing context" },
  { id: "interests", label: "Music interests", summary: "Genres, moods, and intended-use signals" },
  { id: "complete", label: "Complete", summary: "Review the setup and move into discovery" }
];

export const buyerGenreOptions = ["Electronic", "Pop", "Indie Pop", "Hip-Hop", "Cinematic", "Folk", "Rock", "Ambient"];
export const buyerMoodOptions = ["Driving", "Warm", "Hopeful", "Dark", "Tense", "Bright", "Emotive", "Confident"];
export const buyerTypeOptions = ["Music Supervisor", "Producer", "Creative Director", "Brand Marketer", "Editor"];
export const industryTypeOptions = ["Advertising", "Film & TV", "Gaming", "Branded Content", "Streaming", "Agency"];

export const artistBasicsSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120, "Keep your full name under 120 characters."),
  artistName: z.string().trim().min(2, "Enter your artist or stage name.").max(120, "Keep your artist name under 120 characters.")
});

export const artistProfileSchema = z.object({
  bio: z.string().trim().min(24, "Add a short bio that helps buyers understand your sound.").max(5000, "Keep your bio under 5000 characters."),
  location: z.string().trim().min(2, "Enter your location.").max(120, "Keep your location under 120 characters."),
  website: optionalUrlField,
  instagram: z.string().trim().max(120, "Keep your Instagram handle under 120 characters.").optional(),
  spotify: optionalUrlField,
  youtube: optionalUrlField
});

export const artistLicensingSchema = z.object({
  payoutEmail: z.string().trim().email("Enter a valid payout email.").max(254, "Keep your payout email under 254 characters."),
  defaultLicensingPreferences: optionalArtistText
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
    artistName: formData.get("artistName")
  });
}

export function parseArtistProfile(formData: FormData) {
  return artistProfileSchema.parse({
    bio: formData.get("bio"),
    location: formData.get("location"),
    website: formData.get("website") ?? undefined,
    instagram: formData.get("instagram") ?? undefined,
    spotify: formData.get("spotify") ?? undefined,
    youtube: formData.get("youtube") ?? undefined
  });
}

export function parseArtistLicensing(formData: FormData) {
  return artistLicensingSchema.parse({
    payoutEmail: formData.get("payoutEmail"),
    defaultLicensingPreferences: formData.get("defaultLicensingPreferences") ?? undefined
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

export const artistCompletionSchema = artistBasicsSchema.merge(artistProfileSchema)
  .merge(artistLicensingSchema).merge(artistFirstTrackSchema);
export function validateArtistCompletion(values: unknown) { return artistCompletionSchema.parse(values); }

export function parseArtistOnboardingVersion(value: unknown) {
  return z.string().max(40).datetime({ offset: true, message: "Reload onboarding before saving this step." }).parse(value);
}
