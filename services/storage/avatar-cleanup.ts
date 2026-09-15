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
    .from("user_profiles").select("role").eq("id", user.id).maybeSingle();
  if (roleError || profile?.role !== "artist") throw new Error("Artist access required for avatar cleanup.");

  const parts = path.split("/");
  const name = /^\d{13}-(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{13})\.(?:jpg|jpeg|png|webp)$/;
  if (parts.length !== 3 || parts[0] !== user.id || parts[1] !== "profile" || !name.test(parts[2])) {
    throw new Error("Avatar cleanup requires an object belonging to the current artist.");
  }

  // Keep Storage RLS active even after validating the application namespace.
  const { error } = await client.storage.from(env.avatarsBucket).remove([path]);
  if (error) throw new Error("Unable to clean up the previous avatar.");
}
