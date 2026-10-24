"use server";

import { isDedicatedStagingIdentity } from "@/lib/health/payment-readiness";
import { buildAuthCallbackRedirectUrl } from "@/services/auth/auth-flow";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { env, getDeploymentTarget, hasSupabaseEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { getSessionUser, resolvePostLoginRedirect } from "@/services/auth/session";
import { authAttempt, authFetch, AUTH_UNAVAILABLE_MESSAGE, hasPrivilegedAssurance, isValidAuthEmail } from "@/services/auth/security";

export type SecurityActionState = { error?: string; success?: string; factorId?: string; qrCode?: string; secret?: string };
async function account() {
  if (!hasSupabaseEnv || env.demoMode) throw new Error(AUTH_UNAVAILABLE_MESSAGE);
  const db = await createServerSupabaseClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user?.email) throw new Error(AUTH_UNAVAILABLE_MESSAGE);
  const profile = await selectUserProfileCompat(db, data.user.id);
  if (profile.error || !profile.data) throw new Error(AUTH_UNAVAILABLE_MESSAGE);
  return { db, user: data.user, role: profile.data.role };
}
export async function enrollTotpAction(): Promise<SecurityActionState> {
  try {
    const { db, role } = await account();
    if (role !== "admin") return { error: "Only administrators can configure privileged authentication here." };
    const factors = await db.auth.mfa.listFactors();
    if (factors.error) return { error: AUTH_UNAVAILABLE_MESSAGE };
    if (factors.data.all.some(f => f.status === "verified")) return { error: "Use your existing authenticator to verify this session." };
    // Explicitly restarting setup replaces only this account's unfinished TOTP setup.
    for (const f of factors.data.all.filter(f => f.factor_type === "totp" && f.status === "unverified")) {
      const removed = await db.auth.mfa.unenroll({ factorId: f.id });
      if (removed.error) return { error: AUTH_UNAVAILABLE_MESSAGE };
    }
    const result = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: "The Sync Exchange Admin" });
    if (result.error) return { error: AUTH_UNAVAILABLE_MESSAGE };
    return { factorId: result.data.id, qrCode: result.data.totp.qr_code, secret: result.data.totp.secret };
  } catch { return { error: AUTH_UNAVAILABLE_MESSAGE }; }
}
export async function verifyTotpAction(_previous: SecurityActionState, form: FormData): Promise<SecurityActionState> {
  const factorId = String(form.get("factorId") || "");
  const code = String(form.get("code") || "").trim();
  const next = String(form.get("next") || "");
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(factorId) || !/^\d{6}$/.test(code)) return { error: "Enter the six-digit code from your authenticator." };
  try {
    const { db } = await account();
    const factors = await db.auth.mfa.listFactors();
    if (factors.error || !factors.data.all.some(f => f.id === factorId && f.factor_type === "totp")) return { error: "This authenticator is unavailable. Reload to check your account." };
    const challenge = await db.auth.mfa.challenge({ factorId });
    if (challenge.error) return { error: "Verification is unavailable. Try a fresh code shortly." };
    const verified = await db.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
    if (verified.error || !(await hasPrivilegedAssurance(db))) return { error: "That code is invalid or expired. Use a fresh code and try again." };
  } catch { return { error: AUTH_UNAVAILABLE_MESSAGE }; }
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(next === "/reset-password" ? next : resolvePostLoginRedirect(user, next));
}
export async function updateAccountEmailAction(_previous: SecurityActionState, form: FormData): Promise<SecurityActionState> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("currentPassword") || "");
  if (!isValidAuthEmail(email) || !password || password.length > 1024) return { error: "Enter a valid new email and your current password." };
  try {
    const { db, user, role } = await account();
    if ((role === "admin" || user.factors?.some(f => f.status === "verified")) && !(await hasPrivilegedAssurance(db))) return { error: "Verify your authenticator before changing account access." };
    // Verify the password in an isolated nonpersistent client. Reauthenticating the
    // SSR client would downgrade the session's MFA and replace its cookies.
    const verifier = createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: authFetch }
    });
    const checked = await authAttempt(() => verifier.auth.signInWithPassword({ email: user.email!, password }));
    try {
      if (checked.error || checked.data?.user?.id !== user.id) return { error: "We could not verify your current password." };
    } finally { await authAttempt(() => verifier.auth.signOut({ scope: "local" })); }
    const target = getDeploymentTarget();
    const emailRedirectTo = buildAuthCallbackRedirectUrl({
      appUrl: env.appUrl,
      deploymentTarget: target,
      dedicatedStagingIdentityVerified: isDedicatedStagingIdentity({
        ...process.env, NEXT_PUBLIC_APP_URL: env.appUrl,
        NEXT_PUBLIC_SUPABASE_URL: env.supabaseUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: env.supabaseAnonKey
      }, target),
      nextPath: "/account/security"
    });
    const result = await authAttempt(() => db.auth.updateUser({ email }, { emailRedirectTo }));
    // Account-dependent duplicate responses intentionally receive the same notice.
    if (result.error && !["email_exists", "user_already_exists"].includes(result.error.code || "")) return { error: AUTH_UNAVAILABLE_MESSAGE };
    return { success: "If this address can be used, check your current and new inboxes to confirm the change. Your current email remains active until confirmation." };
  } catch { return { error: AUTH_UNAVAILABLE_MESSAGE }; }
}
