import type { SupabaseClient } from "@supabase/supabase-js";

export const LOGIN_FAILED_MESSAGE = "We could not sign you in. Check your email and password, or confirm your email before trying again.";
export const SIGNUP_CHECK_EMAIL_MESSAGE = "Check your email for the next step. If you already have an account, log in or request a password reset.";
export const AUTH_UNAVAILABLE_MESSAGE = "Account access is temporarily unavailable. Please try again shortly.";
export const PASSWORD_REQUIREMENTS_MESSAGE = "Use at least 12 characters and no more than 72 bytes for your new password.";
export const MFA_REQUIRED_MESSAGE = "Verify your authenticator in Account Security before continuing.";
export const isValidAuthEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const isValidNewPassword = (password: string) => password.length >= 12 && new TextEncoder().encode(password).length <= 72;
export const isDuplicateSignup = (error: { code?: string } | null | undefined) => ["user_already_exists", "email_exists"].includes(error?.code || "");
export function safeAuthError(error: { code?: string } | null | undefined, fallback = AUTH_UNAVAILABLE_MESSAGE) {
  if (["weak_password", "password_too_short", "password_too_long"].includes(error?.code || "")) return PASSWORD_REQUIREMENTS_MESSAGE;
  return fallback;
}
// Error text may contain email addresses, tokens or provider details. Never return it to a URL or log it.
export async function authAttempt<T>(operation: () => Promise<T>): Promise<T | { data: null; error: { code: string } }> {
  try { return await operation(); } catch { return { data: null, error: { code: "auth_transport_unavailable" } }; }
}
// getUser validates the bearer token with Auth. The fresh factor list prevents trusting editable metadata or stale session.user.
export async function hasPrivilegedAssurance(client: Pick<SupabaseClient, "auth" | "rpc">): Promise<boolean> {
  try {
    const verified = await client.auth.getUser();
    if (verified.error || !verified.data.user?.factors?.some(f => f.status === "verified")) return false;
    const level = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (level.error || level.data.currentLevel !== "aal2") return false;
    const active = await client.rpc("auth_session_is_active");
    return !active.error && active.data === true;
  } catch { return false; }
}
export async function assertPrivilegedAssurance(client: Pick<SupabaseClient, "auth" | "rpc">) {
  if (!(await hasPrivilegedAssurance(client))) throw new Error(MFA_REQUIRED_MESSAGE);
  const capability=await client.rpc("sec_has_capability",{p_cap:"full_admin"});
  if(capability.error||capability.data!==true)throw new Error("Full operational Admin access is required.");
}
// Bound auth traffic only. Application DB, payment and Storage fetch behavior is unchanged.
export const authFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!new URL(url).pathname.startsWith("/auth/v1/")) return fetch(input, init);
  const timeout = AbortSignal.timeout(10_000);
  const inherited = init?.signal || (input instanceof Request ? input.signal : undefined);
  return fetch(input, { ...init, signal: inherited ? AbortSignal.any([inherited, timeout]) : timeout });
};
