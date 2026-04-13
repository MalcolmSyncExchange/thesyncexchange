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
  const primary = await supabase.from("user_profiles").upsert(values, { onConflict: "id" });

  if (!primary.error) {
    return primary;
  }

  if (!isMissingColumnError(primary.error, "avatar_path")) {
    return primary;
  }

  warnSchemaFallbackOnce(
    "user-profiles-avatar-path-write",
    "avatar_path column is not available yet; falling back to avatar_url-only profile writes until migration 0012 is applied.",
    primary.error
  );

  const { avatar_path, ...fallbackValues } = values;
  return supabase.from("user_profiles").upsert(fallbackValues, { onConflict: "id" });
}
