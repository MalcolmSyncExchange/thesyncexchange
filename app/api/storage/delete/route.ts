import { NextResponse } from "next/server";

import { env, hasSupabaseEnv } from "@/lib/env";
import { userOwnsStoragePath, type StorageAssetRef } from "@/lib/storage";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { deleteStorageAssetsWithServerAccess } from "@/services/storage/server";
import { createServerSupabaseClient } from "@/services/supabase/server";

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
  const isAdmin = profile?.role === "admin" || user.user_metadata?.role === "admin";

  const unauthorizedAsset = normalizedAssets.find((asset) => !isAdmin && !userOwnsStoragePath(user.id, asset.path));
  if (unauthorizedAsset) {
    return NextResponse.json({ error: "You can only delete assets in your own storage namespace." }, { status: 403 });
  }

  await deleteStorageAssetsWithServerAccess(normalizedAssets);

  return NextResponse.json({ deleted: normalizedAssets.length });
}
