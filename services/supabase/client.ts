import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";

export function createBrowserSupabaseClient() {
  return createBrowserClient(env.supabaseUrl || "https://demo.supabase.co", env.supabaseAnonKey || "demo-anon-key");
}
