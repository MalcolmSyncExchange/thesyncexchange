import { NextResponse } from "next/server";

import { env, hasSupabaseEnv } from "@/lib/env";
import { isAbsoluteAssetReference, storageBuckets, type StorageAssetRef } from "@/lib/storage";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { AppSupabaseClient } from "@/services/supabase/types";

const cleanupBuckets = new Set<string>([storageBuckets.coverArt, storageBuckets.trackPreviews, storageBuckets.trackAudio]);

export async function POST(request: Request) {
  if (!hasSupabaseEnv || env.demoMode) {
    return NextResponse.json({ error: "Storage deletion requires live Supabase mode." }, { status: 503 });
  }

  const authSupabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await authSupabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "You must be signed in to delete files." }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role key is required for asset deletion." }, { status: 500 });
  }

  const { assets } = (await request.json().catch(() => ({ assets: [] }))) as { assets?: StorageAssetRef[] };
  const normalizedAssets = Array.isArray(assets) ? assets.filter((asset) => asset?.bucket && asset?.path) : [];

  if (!normalizedAssets.length) {
    return NextResponse.json({ deleted: 0 });
  }

  const { data: profile } = await selectUserProfileCompat(supabase, user.id);
  if (profile?.role !== "artist") {
    return NextResponse.json({ error: "Only artist accounts can clean up temporary track upload assets." }, { status: 403 });
  }

  for (const asset of normalizedAssets) {
    const validationError = validateArtistCleanupAsset(asset, user.id);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 403 });
    }

    if (await isPersistedTrackAssetReference(supabase, asset)) {
      return NextResponse.json({ error: "Stored track assets cannot be deleted through temporary upload cleanup." }, { status: 409 });
    }
  }

  const deletionError = await deleteValidatedAssets(supabase, normalizedAssets);
  if (deletionError) {
    return NextResponse.json({ error: deletionError }, { status: 500 });
  }

  return NextResponse.json({ deleted: normalizedAssets.length });
}

function validateArtistCleanupAsset(asset: StorageAssetRef, userId: string) {
  if (!cleanupBuckets.has(asset.bucket)) {
    return "Only temporary track upload assets can be deleted here.";
  }

  if (!asset.path || isAbsoluteAssetReference(asset.path) || asset.path.startsWith("/")) {
    return "Storage asset path is invalid.";
  }

  if (asset.path.includes("\\")) {
    return "Storage asset path is invalid.";
  }

  const segments = asset.path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return "Storage asset path is invalid.";
  }

  if (segments[0] !== userId) {
    return "You can only delete assets in your own storage namespace.";
  }

  if (asset.bucket === storageBuckets.coverArt && !matchesTrackAssetPath(segments, "cover-art")) {
    return "Storage asset path is invalid for cover art cleanup.";
  }

  if (asset.bucket === storageBuckets.trackAudio && !matchesTrackAssetPath(segments, "audio")) {
    return "Storage asset path is invalid for source audio cleanup.";
  }

  if (
    asset.bucket === storageBuckets.trackPreviews &&
    !matchesTrackAssetPath(segments, "previews") &&
    !matchesTrackAssetPath(segments, "waveforms")
  ) {
    return "Storage asset path is invalid for preview cleanup.";
  }

  return null;
}

function matchesTrackAssetPath(segments: string[], folder: string) {
  return segments.length >= 4 && Boolean(segments[1]) && segments[2] === folder && Boolean(segments[3]);
}

async function isPersistedTrackAssetReference(supabase: AppSupabaseClient, asset: StorageAssetRef) {
  const referencedFields =
    asset.bucket === storageBuckets.coverArt
      ? ["cover_art_path"]
      : asset.bucket === storageBuckets.trackAudio
        ? ["audio_file_path"]
        : ["preview_file_path", "waveform_path"];

  for (const field of referencedFields) {
    const { data, error } = await supabase.from("tracks").select("id").eq(field, asset.path).limit(1);
    if (error) {
      throw new Error(error.message);
    }

    if (data?.length) {
      return true;
    }
  }

  return false;
}

async function deleteValidatedAssets(supabase: AppSupabaseClient, assets: StorageAssetRef[]) {
  const grouped = new Map<string, string[]>();

  for (const asset of assets) {
    grouped.set(asset.bucket, [...(grouped.get(asset.bucket) || []), asset.path]);
  }

  for (const [bucket, paths] of grouped.entries()) {
    const uniquePaths = Array.from(new Set(paths));
    const { error } = await supabase.storage.from(bucket).remove(uniquePaths);
    if (error) {
      return error.message || "Unable to delete temporary upload assets.";
    }
  }

  return null;
}
