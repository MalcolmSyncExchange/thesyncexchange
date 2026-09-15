import "server-only";

import { getTrackAssetBucket, type StorageAssetRef, type TrackAssetKind } from "@/lib/storage";
import { assetRules } from "@/lib/validation/track-submission";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import type { AppSupabaseClient } from "@/services/supabase/types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const objectName = /^\d{13}-(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{13})\.[a-z0-9]+$/;
const kinds = {
  "cover-art": { folder: "cover-art", rule: assetRules.coverArt },
  audio: { folder: "audio", rule: assetRules.audioFile },
  preview: { folder: "previews", rule: assetRules.previewFile },
  waveform: { folder: "waveforms", rule: assetRules.waveformFile }
} as const;

export const trackAssetFields = [
  { field: "coverArtPath", column: "cover_art_path", kind: "cover-art" },
  { field: "audioFilePath", column: "audio_file_path", kind: "audio" },
  { field: "previewFilePath", column: "preview_file_path", kind: "preview" },
  { field: "waveformPath", column: "waveform_path", kind: "waveform" }
] as const;

type AssetValues = Record<(typeof trackAssetFields)[number]["field"], string | undefined>;
type AssetSnapshot = Record<(typeof trackAssetFields)[number]["column"], string | null>;

export function validateTrackAssetPath(ownerId: string, kind: TrackAssetKind, asset: StorageAssetRef) {
  const { folder, rule } = kinds[kind];
  const segments = asset.path.split("/");
  if (
    !uuid.test(ownerId) || asset.bucket !== getTrackAssetBucket(kind) || /[\s\\]/.test(asset.path) ||
    segments.length !== 4 || segments[0] !== ownerId ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(segments[1]) || segments[2] !== folder ||
    !objectName.test(segments[3]) ||
    !rule.allowedExtensions.some((extension) => segments[3].endsWith(extension))
  ) {
    throw new Error(`Invalid ${rule.label.toLowerCase()} asset. Upload a file belonging to your artist account.`);
  }
}

export async function verifyTrackAssetExists(
  client: AppSupabaseClient, ownerId: string, kind: TrackAssetKind, asset: StorageAssetRef
) {
  validateTrackAssetPath(ownerId, kind, asset);
  const { data, error } = await client.storage.from(asset.bucket).info(asset.path);
  if (error || !data) {
    throw new Error(`Unable to verify ${kinds[kind].rule.label.toLowerCase()} upload. Upload the file again.`);
  }
}

export async function verifyTrackAssetReferences(
  client: AppSupabaseClient, ownerId: string, values: AssetValues, existing?: AssetSnapshot
) {
  const verified = { ...values };
  for (const { field, column, kind } of trackAssetFields) {
    const path = values[field] || "";
    if (existing && path === (existing[column] || "")) {
      // Retained references come from the authorized database snapshot, not a client cleanup list.
      verified[field] = existing[column] || "";
    } else if (path) {
      await verifyTrackAssetExists(client, ownerId, kind, { bucket: getTrackAssetBucket(kind), path });
    }
  }
  return verified;
}

export async function signAuthorizedTrackAudio(trackId: string) {
  if (!uuid.test(trackId)) throw new Error("Invalid track.");
  const sessionClient = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) throw new Error("Authentication required.");
  const { data: profile, error: roleError } = await sessionClient
    .from("user_profiles").select("role").eq("id", user.id).maybeSingle();
  if (roleError || !profile || (profile.role !== "artist" && profile.role !== "admin")) {
    throw new Error("Full audio access denied.");
  }
  const { data: track, error: trackError } = await sessionClient
    .from("tracks").select("id, artist_user_id, audio_file_path").eq("id", trackId).maybeSingle();
  if (trackError || !track || track.id !== trackId ||
    (profile.role !== "admin" && track.artist_user_id !== user.id)) {
    throw new Error("Full audio access denied.");
  }
  if (!track.audio_file_path) return null;
  const asset = { bucket: getTrackAssetBucket("audio"), path: track.audio_file_path };
  validateTrackAssetPath(track.artist_user_id, "audio", asset);
  const storageClient = await createPrivilegedSupabaseClient();
  await verifyTrackAssetExists(storageClient, track.artist_user_id, "audio", asset);
  const { data, error } = await storageClient.storage.from(asset.bucket).createSignedUrl(asset.path, 60 * 30);
  if (error || !data?.signedUrl) throw new Error("Unable to access full audio.");
  return data.signedUrl;
}
