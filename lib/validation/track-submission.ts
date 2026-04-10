import { z } from "zod";

const acceptedArtworkExtensions = [".jpg", ".jpeg", ".png", ".webp"];
const acceptedAudioExtensions = [".mp3", ".wav", ".aiff", ".flac"];
const acceptedWaveformExtensions = [".json", ".png", ".jpg", ".jpeg", ".webp"];

export const assetRules = {
  coverArt: {
    label: "Cover art",
    maxSizeBytes: 10 * 1024 * 1024,
    allowedExtensions: acceptedArtworkExtensions
  },
  audioFile: {
    label: "Audio file",
    maxSizeBytes: 100 * 1024 * 1024,
    allowedExtensions: acceptedAudioExtensions
  },
  waveformFile: {
    label: "Waveform preview",
    maxSizeBytes: 10 * 1024 * 1024,
    allowedExtensions: acceptedWaveformExtensions
  }
} as const;

export const rightsHolderSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  roleType: z.string().min(1, "Role type is required"),
  ownershipPercent: z.coerce.number().min(0).max(100)
});

const trackSubmissionBaseSchema = z
  .object({
    title: z.string().min(2, "Track title is required"),
    description: z.string().min(20, "Add a stronger description"),
    genre: z.string().min(1, "Genre is required"),
    subgenre: z.string().min(1, "Subgenre is required"),
    moods: z.string().min(1, "Add at least one mood"),
    bpm: z.coerce.number().min(40, "BPM must be at least 40").max(220, "BPM must be below 220"),
    key: z.string().min(1, "Key is required"),
    duration: z.coerce.number().min(30, "Duration must be at least 30 seconds").max(900, "Duration must be under 15 minutes"),
    instrumental: z.boolean(),
    vocals: z.boolean(),
    explicit: z.boolean(),
    lyrics: z.string().optional(),
    releaseYear: z.coerce.number().min(1950).max(2030),
    priceDigital: z.coerce.number().min(100),
    priceBroadcast: z.coerce.number().min(100),
    priceExclusive: z.coerce.number().min(1000),
    saveMode: z.enum(["draft", "publish"]),
    rightsHolders: z.array(rightsHolderSchema).min(1, "Add at least one rights holder")
  })
  .superRefine((value, ctx) => {
    const total = value.rightsHolders.reduce((sum, holder) => sum + holder.ownershipPercent, 0);
    if (Math.abs(total - 100) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rightsHolders"],
        message: "Ownership splits must total 100%."
      });
    }

    if (value.instrumental && value.vocals) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vocals"],
        message: "A track marked instrumental cannot also be marked as having vocals."
      });
    }
  });

export const trackSubmissionClientSchema = trackSubmissionBaseSchema;

export const trackSubmissionServerSchema = trackSubmissionBaseSchema.extend({
  coverArtUrl: z
    .string()
    .min(1, "Cover art upload is required")
    .refine((value) => acceptedArtworkExtensions.some((ext) => value.toLowerCase().includes(ext)), {
      message: "Cover art upload must resolve to JPG, PNG, or WEBP."
    }),
  audioFileUrl: z
    .string()
    .min(1, "Audio upload is required")
    .refine((value) => acceptedAudioExtensions.some((ext) => value.toLowerCase().includes(ext)), {
      message: "Audio upload must resolve to MP3, WAV, AIFF, or FLAC."
    }),
  waveformPreviewUrl: z
    .string()
    .optional()
    .refine((value) => !value || acceptedWaveformExtensions.some((ext) => value.toLowerCase().includes(ext)), {
      message: "Waveform preview must be JSON or an image file."
    }),
  uploadedAssetPaths: z.array(z.string()).default([])
});

export type TrackSubmissionValues = z.infer<typeof trackSubmissionClientSchema>;
export type PersistedTrackSubmissionValues = z.infer<typeof trackSubmissionServerSchema>;

export function parseTrackSubmissionFormData(formData: FormData): PersistedTrackSubmissionValues {
  const rightsHolders = JSON.parse(String(formData.get("rightsHolders") || "[]"));
  const uploadedAssetPaths = JSON.parse(String(formData.get("uploadedAssetPaths") || "[]"));

  return trackSubmissionServerSchema.parse({
    title: String(formData.get("title") || ""),
    description: String(formData.get("description") || ""),
    genre: String(formData.get("genre") || ""),
    subgenre: String(formData.get("subgenre") || ""),
    moods: String(formData.get("moods") || ""),
    bpm: Number(formData.get("bpm") || 0),
    key: String(formData.get("key") || ""),
    duration: Number(formData.get("duration") || 0),
    instrumental: formData.get("instrumental") === "on",
    vocals: formData.get("vocals") === "on",
    explicit: formData.get("explicit") === "on",
    lyrics: String(formData.get("lyrics") || ""),
    releaseYear: Number(formData.get("releaseYear") || 0),
    coverArtUrl: String(formData.get("coverArtUrl") || ""),
    audioFileUrl: String(formData.get("audioFileUrl") || ""),
    waveformPreviewUrl: String(formData.get("waveformPreviewUrl") || ""),
    priceDigital: Number(formData.get("priceDigital") || 0),
    priceBroadcast: Number(formData.get("priceBroadcast") || 0),
    priceExclusive: Number(formData.get("priceExclusive") || 0),
    saveMode: formData.get("saveMode") === "publish" ? "publish" : "draft",
    rightsHolders,
    uploadedAssetPaths
  });
}

export function validateAssetFile(file: File | null | undefined, rule: (typeof assetRules)[keyof typeof assetRules], required = true) {
  if (!file || file.size === 0) {
    return required ? `${rule.label} is required.` : undefined;
  }

  const lowerName = file.name.toLowerCase();
  if (!rule.allowedExtensions.some((ext) => lowerName.endsWith(ext))) {
    return `${rule.label} must use one of: ${rule.allowedExtensions.join(", ")}.`;
  }

  if (file.size > rule.maxSizeBytes) {
    return `${rule.label} must be under ${Math.round(rule.maxSizeBytes / (1024 * 1024))}MB.`;
  }

  return undefined;
}
