import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import {
  getPublicStorageUrl,
  groupStorageAssetsByBucket,
  isAbsoluteAssetReference,
  storageBuckets,
  type StorageAssetRef
} from "@/lib/storage";
import type { Track } from "@/types/models";

export async function createSignedStorageUrl(asset: StorageAssetRef | null, expiresInSeconds = 900) {
  if (!asset?.path) {
    return null;
  }

  if (isAbsoluteAssetReference(asset.path)) {
    return asset.path;
  }

  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.storage.from(asset.bucket).createSignedUrl(asset.path, expiresInSeconds);

  if (error) {
    throw new Error(error.message);
  }

  return data.signedUrl;
}

export async function deleteStorageAssetsWithServerAccess(assets: StorageAssetRef[]) {
  if (!assets.length) {
    return;
  }

  const supabase = createPrivilegedSupabaseClient();
  const grouped = groupStorageAssetsByBucket(assets);

  await Promise.all(
    Array.from(grouped.entries()).map(async ([bucket, paths]) => {
      const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
      if (!uniquePaths.length) {
        return;
      }

      const { error } = await supabase.storage.from(bucket).remove(uniquePaths);
      if (error) {
        console.warn("[storage cleanup] remove failed", {
          bucket,
          pathCount: uniquePaths.length,
          message: error.message
        });
      }
    })
  );
}

export async function withTrackAudioAccess<T extends Pick<Track, "audio_file_path" | "preview_file_path" | "audio_file_url">>(
  track: T,
  access: "preview" | "full"
) {
  const previewUrl = getPublicStorageUrl(storageBuckets.trackPreviews, track.preview_file_path);

  if (access === "preview") {
    return {
      ...track,
      audio_file_url: previewUrl
    };
  }

  if (!track.audio_file_path) {
    return {
      ...track,
      audio_file_url: previewUrl
    };
  }

  return {
    ...track,
    audio_file_url: await createSignedStorageUrl(
      { bucket: storageBuckets.trackAudio, path: track.audio_file_path },
      60 * 30
    ).catch(() => null)
  };
}
