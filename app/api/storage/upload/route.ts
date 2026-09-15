import { NextResponse } from "next/server";

import { env, hasSupabaseEnv } from "@/lib/env";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { uploadManagedAsset } from "@/services/storage/assets";
import type { StorageAssetKind } from "@/lib/storage";
import { consumeRateLimit, rateLimitErrorResponse } from "@/services/security/rate-limit";

const trackAssetKinds = new Set<StorageAssetKind>(["cover-art", "audio", "preview", "waveform"]);

export async function POST(request: Request) {
  if (!hasSupabaseEnv || env.demoMode) {
    return NextResponse.json({ error: "Storage uploads require live Supabase mode." }, { status: 503 });
  }

  const authSupabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await authSupabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "You must be signed in to upload files." }, { status: 401 });
  }

  const { data: profile } = await selectUserProfileCompat(authSupabase, user.id);
  const role = profile?.role;
  if (role !== "artist" && role !== "admin") {
    return NextResponse.json({ error: "Only artist or admin accounts can upload track assets." }, { status: 403 });
  }

  const admission = await consumeRateLimit("server-upload", user.id);
  const limitedResponse = rateLimitErrorResponse(admission);
  if (limitedResponse) return limitedResponse;

  const formData = await request.formData();
  const kind = String(formData.get("kind") || "") as StorageAssetKind;
  const scope = String(formData.get("scope") || "").trim();
  const file = formData.get("file");

  if (!trackAssetKinds.has(kind)) {
    return NextResponse.json({ error: "Unsupported storage asset kind." }, { status: 400 });
  }

  if (!scope) {
    return NextResponse.json({ error: "Asset scope is required for track uploads." }, { status: 400 });
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file was provided for upload." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unable to prepare uploads right now." }, { status: 503 });
  }

  try {
    const asset = await uploadManagedAsset({
      supabase,
      userId: user.id,
      kind,
      file,
      scope
    });

    return NextResponse.json(asset);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload asset." },
      { status: 400 }
    );
  }
}
