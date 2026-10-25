import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function clearAccountCookies() {
  const store = await cookies();
  const prefix = (() => { try { return `sb-${new URL(env.supabaseUrl || "").hostname.split(".")[0]}-auth-token`; } catch { return null; } })();
  for (const cookie of store.getAll()) {
    if (prefix && (cookie.name === prefix || cookie.name.startsWith(prefix + ".") || cookie.name === prefix + "-code-verifier" || cookie.name.startsWith(prefix + "-code-verifier."))) store.delete(cookie.name);
  }
  if (env.supabaseUrl) store.delete(`tse-recovery-${new URL(env.supabaseUrl).hostname.split(".")[0]}`);
  store.delete("sync-exchange-session");
}
