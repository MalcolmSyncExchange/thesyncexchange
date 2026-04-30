import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";
import type { Database } from "@/types/database";
import type { AppSupabaseClient } from "@/services/supabase/types";

export function createAdminSupabaseClient(): AppSupabaseClient | null {
  if (!env.supabaseUrl || !serverEnv.supabaseServiceRoleKey) {
    return null;
  }

  return createClient<Database>(env.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }) as AppSupabaseClient;
}
