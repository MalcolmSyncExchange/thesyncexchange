import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";
import type { Database } from "@/types/database";
import type { AppSupabaseClient } from "@/services/supabase/types";

export function createAdminSupabaseClient(fetcher?: typeof fetch): AppSupabaseClient | null {
  if (!env.supabaseUrl || !serverEnv.supabaseServiceRoleKey) {
    return null;
  }

  return createClient<Database>(env.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    global: fetcher ? { fetch: fetcher } : undefined,
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }) as AppSupabaseClient;
}
