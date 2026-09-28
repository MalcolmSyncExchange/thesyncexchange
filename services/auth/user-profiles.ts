import type { SupabaseClient } from "@supabase/supabase-js";

import { warnSchemaFallbackOnce, isMissingColumnError, isMissingRelationError, isSchemaCacheTableError } from "@/services/supabase/schema-compat";
import type { Database } from "@/types/database";

export type UserProfileCompatRow = Pick<
  Database["public"]["Tables"]["user_profiles"]["Row"],
  | "id"
  | "email"
  | "role"
  | "full_name"
  | "avatar_path"
  | "avatar_url"
  | "onboarding_started_at"
  | "onboarding_completed_at"
  | "onboarding_step"
  | "onboarding_payload"
>;

export async function selectUserProfileCompat(
  supabase: SupabaseClient<Database>,
  userId: string
) {
  const primary = await supabase
    .from("user_profiles")
    .select("id, email, role, full_name, avatar_path, avatar_url, onboarding_started_at, onboarding_completed_at, onboarding_step, onboarding_payload")
    .eq("id", userId)
    .maybeSingle();

  if (!primary.error) {
    return {
      data: primary.data as UserProfileCompatRow | null,
      error: null
    };
  }

  if (isMissingRelationError(primary.error, "user_profiles") || isSchemaCacheTableError(primary.error, "user_profiles")) {
    warnSchemaFallbackOnce(
      "user-profiles-relation-read",
      "user_profiles is not readable through Supabase right now; auth and profile hydration are falling back to auth metadata until the schema is exposed correctly.",
      primary.error
    );

    return {
      data: null,
      error: null
    };
  }

  if (!isMissingColumnError(primary.error, "avatar_path")) {
    return {
      data: null,
      error: primary.error
    };
  }

  warnSchemaFallbackOnce(
    "user-profiles-avatar-path-read",
    "avatar_path column is not available yet; falling back to avatar_url-only profile reads until migration 0012 is applied.",
    primary.error
  );

  const fallback = await supabase
    .from("user_profiles")
    .select("id, email, role, full_name, avatar_url, onboarding_started_at, onboarding_completed_at, onboarding_step, onboarding_payload")
    .eq("id", userId)
    .maybeSingle();

  return {
    data: fallback.data
      ? ({
          ...fallback.data,
          avatar_path: null
        } as UserProfileCompatRow)
      : null,
    error: fallback.error || null
  };
}

export async function upsertUserProfileCompat(
  supabase: SupabaseClient<Database>,
  values: Database["public"]["Tables"]["user_profiles"]["Insert"]
) {
  // Ordinary profile writes must never replay a cached avatar reference.
  const { avatar_path: _path, avatar_url: _url, ...ordinary } = values;
  void _path; void _url;
  if (ordinary.onboarding_payload && typeof ordinary.onboarding_payload === "object" && !Array.isArray(ordinary.onboarding_payload)) {
    ordinary.onboarding_payload = Object.fromEntries(Object.entries(ordinary.onboarding_payload).filter(([key]) => !["avatarPath", "avatarUrl", "avatar_path", "avatar_url"].includes(key)));
  }
  return supabase.from("user_profiles").upsert(ordinary, { onConflict: "id" });
}

/** Only a fresh server-uploaded path may be supplied; never accept a form path. */
export async function transitionArtistAvatar(
  supabase: SupabaseClient<Database>,
  values: Database["public"]["Tables"]["user_profiles"]["Insert"],
  expected: { path: string | null; url: string | null }
) {
  const { id, email: _email, role: _role, ...updates } = values;
  void _email; void _role;
  let query = supabase.from("user_profiles").update(updates).eq("id", id).eq("role", "artist");
  query = expected.path === null ? query.is("avatar_path", null) : query.eq("avatar_path", expected.path);
  query = expected.url === null ? query.is("avatar_url", null) : query.eq("avatar_url", expected.url);
  const result = await query.select("id").maybeSingle();
  if (result.error) return { error: result.error };
  if (!result.data) return { error: new Error("Your avatar changed while saving. Reload your profile before trying again."), definitelyNotWritten: true };
  return { error: null };
}
