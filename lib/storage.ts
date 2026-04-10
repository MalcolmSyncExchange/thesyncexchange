import { env, hasSupabaseEnv } from "@/lib/env";

export interface StorageAssetRef {
  bucket: string;
  path: string;
}

export type TrackAssetKind = "cover-art" | "audio" | "waveform";

export const storageBuckets = {
  avatars: env.avatarsBucket,
  coverArt: env.coverArtBucket,
  trackAudio: env.trackAudioBucket,
  trackPreviews: env.trackPreviewsBucket,
  agreements: env.agreementsBucket
} as const;

const publicBuckets = new Set<string>([storageBuckets.avatars, storageBuckets.coverArt, storageBuckets.trackPreviews]);

export function getTrackAssetBucket(kind: TrackAssetKind) {
  if (kind === "cover-art") return storageBuckets.coverArt;
  if (kind === "audio") return storageBuckets.trackAudio;
  return storageBuckets.trackPreviews;
}

export function isPublicStorageBucket(bucket: string) {
  return publicBuckets.has(bucket);
}

export function isAbsoluteAssetReference(value?: string | null) {
  if (!value) {
    return false;
  }

  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

export function buildTrackAssetPath({
  userId,
  scope,
  kind,
  fileName
}: {
  userId: string;
  scope: string;
  kind: TrackAssetKind;
  fileName: string;
}) {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() || "bin" : "bin";
  const uniqueId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  const objectName = `${Date.now()}-${uniqueId}.${extension}`;

  if (kind === "cover-art") {
    return `${userId}/${scope}/cover-art/${objectName}`;
  }

  if (kind === "audio") {
    return `${userId}/${scope}/audio/${objectName}`;
  }

  return `${userId}/${scope}/waveforms/${objectName}`;
}

export function getPublicStorageUrl(bucket: string, path?: string | null) {
  if (!path) {
    return null;
  }

  if (isAbsoluteAssetReference(path)) {
    return path;
  }

  if (!hasSupabaseEnv || !isPublicStorageBucket(bucket)) {
    return null;
  }

  const normalizedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${env.supabaseUrl}/storage/v1/object/public/${bucket}/${normalizedPath}`;
}

export function groupStorageAssetsByBucket(assets: StorageAssetRef[]) {
  const grouped = new Map<string, string[]>();

  for (const asset of assets) {
    if (!asset.bucket || !asset.path || isAbsoluteAssetReference(asset.path)) {
      continue;
    }

    const existing = grouped.get(asset.bucket) || [];
    existing.push(asset.path);
    grouped.set(asset.bucket, existing);
  }

  return grouped;
}
