import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/types/database";
import type { AppSupabaseClient } from "@/services/supabase/types";

export function createAdminSupabaseClient(): AppSupabaseClient | null {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    return null;
  }

  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }) as AppSupabaseClient;
}
