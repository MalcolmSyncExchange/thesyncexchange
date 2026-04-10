import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/lib/env";
import type { Database } from "@/types/database";
import type { AppSupabaseClient } from "@/services/supabase/types";

export function createServerSupabaseClient(): AppSupabaseClient {
  const cookieStore = cookies();

  return createServerClient<Database>(env.supabaseUrl || "https://demo.supabase.co", env.supabaseAnonKey || "demo-anon-key", {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        cookieStore.set({ name, value, ...(options as object) });
      },
      remove(name: string, options: Record<string, unknown>) {
        cookieStore.set({ name, value: "", ...(options as object) });
      }
    }
  }) as unknown as AppSupabaseClient;
}
