import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import {
  getPublicStorageUrl,
  isAbsoluteAssetReference,
  storageBuckets,
  type StorageAssetRef
} from "@/lib/storage";
import type { Track } from "@/types/models";
import { signAuthorizedTrackAudio } from "@/services/storage/track-assets";

export async function createSignedStorageUrl(asset: StorageAssetRef | null, expiresInSeconds = 900) {
  if (!asset?.path) {
    return null;
  }

  if (isAbsoluteAssetReference(asset.path)) {
    return asset.path;
  }

  const supabase = await createPrivilegedSupabaseClient();
  const { data, error } = await supabase.storage.from(asset.bucket).createSignedUrl(asset.path, expiresInSeconds);

  if (error) {
    throw new Error(error.message);
  }

  return data.signedUrl;
}

export async function withTrackAudioAccess<T extends Pick<Track, "id" | "audio_file_path" | "preview_file_path" | "audio_file_url">>(
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
    audio_file_url: await signAuthorizedTrackAudio(track.id).catch(() => null)
  };
}
