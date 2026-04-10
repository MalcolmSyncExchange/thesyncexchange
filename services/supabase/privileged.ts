import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { AppSupabaseClient } from "@/services/supabase/types";

export function createPrivilegedSupabaseClient(): AppSupabaseClient {
  return createAdminSupabaseClient() ?? createServerSupabaseClient();
}
