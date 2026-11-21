import { authFetch } from "@/services/auth/security";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { AppSupabaseClient } from "@/services/supabase/types";

export async function createPrivilegedSupabaseClient(
  wrapFetch?: (fetcher: typeof fetch) => typeof fetch
): Promise<AppSupabaseClient> {
  return createAdminSupabaseClient(wrapFetch?.(fetch))
    ?? await createServerSupabaseClient(wrapFetch?.(authFetch));
}
