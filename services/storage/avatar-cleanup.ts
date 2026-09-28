import "server-only";

import { env, hasSupabaseEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/services/supabase/server";

// Both replacement and failed-upload cleanup pass through this live identity gate.
export async function deleteOwnAvatar(path: string) {
  if (env.demoMode || !hasSupabaseEnv) return;

  const client = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error("Authentication required for avatar cleanup.");
  const { data: profile, error: roleError } = await client
    .from("user_profiles").select("role, avatar_path, avatar_url, onboarding_payload").eq("id", user.id).maybeSingle();
  if (roleError || profile?.role !== "artist") throw new Error("Artist access required for avatar cleanup.");

  const parts = path.split("/");
  const name = /^\d{13}-(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{13})\.(?:jpg|jpeg|png|webp)$/;
  if (/[\u0000-\u0020\u007f]/.test(path) || parts.length !== 3 || parts[0] !== user.id || parts[1] !== "profile" || !name.test(parts[2])) {
    throw new Error("Avatar cleanup requires an object belonging to the current artist.");
  }

  // Ordinary application saves cannot reintroduce retired avatar references.
  // Fail closed if this read is incomplete, legacy, or still references the object.
  const payload = profile.onboarding_payload as Record<string, unknown> | null;
  if (profile.avatar_path === undefined || profile.avatar_url === undefined ||
      profile.avatar_path === path || profile.avatar_url ||
      [payload?.avatarPath, payload?.avatar_path].includes(path)) {
    throw new Error("Avatar reference is active or uncertain; cleanup deferred.");
  }

  // Keep Storage RLS active even after validating the application namespace.
  const { error } = await client.storage.from(env.avatarsBucket).remove([path]);
  if (error) throw new Error("Unable to clean up the previous avatar.");
}
