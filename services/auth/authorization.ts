import { createServerSupabaseClient } from "@/services/supabase/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import type { UserRole } from "@/types/models";

export async function requireAccountScope(role: UserRole, expectedUserId?: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || (expectedUserId && expectedUserId !== user.id)) throw new Error("Unauthorized account scope.");
  const profile = await selectUserProfileCompat(supabase, user.id);
  if (profile.error || profile.data?.role !== role) throw new Error(`${role} access is required.`);
  return { supabase, user };
}
