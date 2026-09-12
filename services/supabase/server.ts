import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/lib/env";
import type { Database } from "@/types/database";
import type { AppSupabaseClient } from "@/services/supabase/types";

export async function createServerSupabaseClient(): Promise<AppSupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl || "https://demo.supabase.co", env.supabaseAnonKey || "demo-anon-key", {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot mutate cookies; Server Actions and Route Handlers can.
        }
      }
    }
  }) as unknown as AppSupabaseClient;
}
