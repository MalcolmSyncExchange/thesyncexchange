import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { authAttempt, authFetch, hasPrivilegedAssurance } from "@/services/auth/security";

export const accountJson = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }
});
export async function authorizeBuyerAccountMutation(request: Request, requireAssurance = true) {
  if (request.headers.get("origin") !== new URL(env.appUrl).origin) return { response: accountJson({ error: "Same-origin account request required." }, 403) };
  try {
    const db = await createServerSupabaseClient();
    const result = await authAttempt(() => db.auth.getUser());
    const user = result.data?.user;
    if (result.error || !user?.email) return { response: accountJson({ error: "Unauthorized." }, 401) };
    const profile = await selectUserProfileCompat(db, user.id);
    if (profile.error || profile.data?.role !== "buyer") return { response: accountJson({ error: "Buyer account access required." }, 403) };
    if (requireAssurance && user.factors?.some(f => f.status === "verified") && !(await hasPrivilegedAssurance(db))) return { response: accountJson({ error: "Verify your authenticator in Account Security before continuing." }, 403) };
    return { db, user };
  } catch { return { response: accountJson({ error: "Account access is temporarily unavailable." }, 503) }; }
}
export async function readAccountJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !request.body) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 8192) { await reader.cancel(); return null; } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch { return null; } finally { reader.releaseLock(); }
}
export async function verifyAccountPassword(user: User, password: string) {
  if (!password || password.length > 1024) return false;
  const verifier = createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: authFetch }
  });
  try {
    const result = await authAttempt(() => verifier.auth.signInWithPassword({ email: user.email!, password }));
    return !result.error && result.data?.user?.id === user.id;
  } finally { await authAttempt(() => verifier.auth.signOut({ scope: "local" })); }
}
