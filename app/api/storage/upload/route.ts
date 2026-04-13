import { NextResponse } from "next/server";

import { env, hasSupabaseEnv } from "@/lib/env";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { uploadManagedAsset } from "@/services/storage/assets";
import type { StorageAssetKind } from "@/lib/storage";

const trackAssetKinds = new Set<StorageAssetKind>(["cover-art", "audio", "preview", "waveform"]);

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

  const { data: profile } = await selectUserProfileCompat(supabase, user.id);
  const role = profile?.role || user.user_metadata?.role;
  if (role !== "artist" && role !== "admin") {
    return NextResponse.json({ error: "Only artist or admin accounts can upload track assets." }, { status: 403 });
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
