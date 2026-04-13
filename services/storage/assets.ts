import { avatarAssetRule } from "@/lib/validation/onboarding";
import { assetRules } from "@/lib/validation/track-submission";
import {
  buildAvatarAssetPath,
  buildTrackAssetPath,
  getPublicStorageUrl,
  getStorageBucketForKind,
  type StorageAssetKind,
  type StorageAssetRef
} from "@/lib/storage";
import type { AppSupabaseClient } from "@/services/supabase/types";

export interface UploadedStorageAsset extends StorageAssetRef {
  publicUrl: string | null;
  contentType: string | null;
  size: number;
}

const storageUploadRules = {
  avatar: avatarAssetRule,
  "cover-art": assetRules.coverArt,
  audio: assetRules.audioFile,
  preview: assetRules.previewFile,
  waveform: assetRules.waveformFile
} as const satisfies Record<StorageAssetKind, { label: string; maxSizeBytes: number; allowedExtensions: readonly string[] }>;

export function assertStorageUploadFile(kind: StorageAssetKind, file: File | null | undefined) {
  const rule = storageUploadRules[kind];

  if (!(file instanceof File) || file.size === 0) {
    throw new Error(`${rule.label} is required.`);
  }

  const lowerName = file.name.toLowerCase();
  if (!rule.allowedExtensions.some((extension) => lowerName.endsWith(extension))) {
    throw new Error(`${rule.label} must use one of: ${rule.allowedExtensions.join(", ")}.`);
  }

  if (file.size > rule.maxSizeBytes) {
    throw new Error(`${rule.label} must be under ${Math.round(rule.maxSizeBytes / (1024 * 1024))}MB.`);
  }
}

export async function uploadManagedAsset({
  supabase,
  userId,
  kind,
  file,
  scope
}: {
  supabase: AppSupabaseClient;
  userId: string;
  kind: StorageAssetKind;
  file: File;
  scope?: string;
}) {
  assertStorageUploadFile(kind, file);

  const bucket = getStorageBucketForKind(kind);
  const path =
    kind === "avatar"
      ? buildAvatarAssetPath({ userId, fileName: file.name })
      : buildTrackAssetPath({
          userId,
          scope: scope || "uploads",
          kind,
          fileName: file.name
        });

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    bucket,
    path,
    publicUrl: getPublicStorageUrl(bucket, path),
    contentType: file.type || null,
    size: file.size
  } satisfies UploadedStorageAsset;
}
