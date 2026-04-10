"use client";

import {
  buildTrackAssetPath,
  getPublicStorageUrl,
  getTrackAssetBucket,
  groupStorageAssetsByBucket,
  type StorageAssetRef,
  type TrackAssetKind
} from "@/lib/storage";
import { createBrowserSupabaseClient } from "@/services/supabase/client";

export interface UploadedAsset extends StorageAssetRef {
  publicUrl: string | null;
}

export async function uploadTrackAsset({
  file,
  userId,
  kind,
  scope
}: {
  file: File;
  userId: string;
  kind: TrackAssetKind;
  scope: string;
}): Promise<UploadedAsset> {
  const supabase = createBrowserSupabaseClient();
  const bucket = getTrackAssetBucket(kind);
  const path = buildTrackAssetPath({
    userId,
    scope,
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
    publicUrl: getPublicStorageUrl(bucket, path)
  };
}

export async function deleteTrackAssets(assets: StorageAssetRef[]) {
  if (!assets.length) {
    return;
  }

  const supabase = createBrowserSupabaseClient();
  const grouped = groupStorageAssetsByBucket(assets);

  await Promise.all(
    Array.from(grouped.entries()).map(([bucket, paths]) => supabase.storage.from(bucket).remove(paths))
  );
}
