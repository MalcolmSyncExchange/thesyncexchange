import { NextResponse } from "next/server";

import { env, hasSupabaseEnv } from "@/lib/env";
import {
  buildTrackAssetPath,
  getPublicStorageUrl,
  getStorageBucketForKind,
  type StorageAssetKind,
  type TrackAssetKind
} from "@/lib/storage";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { assertStorageUploadMetadata } from "@/services/storage/assets";

const trackAssetKinds = new Set<TrackAssetKind>(["cover-art", "audio", "preview", "waveform"]);

function isTrackAssetKind(kind: StorageAssetKind | undefined): kind is TrackAssetKind {
  return Boolean(kind && trackAssetKinds.has(kind as TrackAssetKind));
}

export async function POST(request: Request) {
  if (!hasSupabaseEnv || env.demoMode) {
    return NextResponse.json({ error: "Storage uploads require live Supabase mode." }, { status: 503 });
  }

  const authSupabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await authSupabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "You must be signed in to upload files." }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role key is required for uploads." }, { status: 500 });
  }

  const payload = (await request.json().catch(() => null)) as {
    kind?: StorageAssetKind;
    scope?: string;
    fileName?: string;
    fileSize?: number;
    contentType?: string;
  } | null;

  const kind = payload?.kind;
  const scope = String(payload?.scope || "").trim();
  const fileName = String(payload?.fileName || "").trim();
  const fileSize = Number(payload?.fileSize || 0);

  if (!isTrackAssetKind(kind)) {
    return NextResponse.json({ error: "Unsupported storage asset kind." }, { status: 400 });
  }

  if (!scope) {
    return NextResponse.json({ error: "Asset scope is required for track uploads." }, { status: 400 });
  }

  try {
    assertStorageUploadMetadata({ kind, fileName, fileSize });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid upload metadata." },
      { status: 400 }
    );
  }

  const { data: profile } = await selectUserProfileCompat(supabase, user.id);
  const role = profile?.role || user.user_metadata?.role;
  if (role !== "artist" && role !== "admin") {
    return NextResponse.json({ error: "Only artist or admin accounts can upload track assets." }, { status: 403 });
  }

  const bucket = getStorageBucketForKind(kind);
  const path = buildTrackAssetPath({
    userId: user.id,
    scope,
    kind,
    fileName
  });

  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data?.token) {
    return NextResponse.json(
      { error: error?.message || "Unable to prepare upload." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    bucket,
    path,
    token: data.token,
    publicUrl: getPublicStorageUrl(bucket, path),
    contentType: payload?.contentType || null,
    size: fileSize
  });
}
