import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { env, hasSupabaseEnv } from "@/lib/env";
import { AuthPageShell, AuthPanel, AuthStatusMessage } from "@/components/forms/auth-form";
import { AdminAuthenticator, EmailSecurityForm } from "@/components/forms/account-security-form";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { logoutAction } from "@/services/auth/actions";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { hasPrivilegedAssurance, authAttempt } from "@/services/auth/security";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account Security | The Sync Exchange", referrer: "no-referrer", robots: { index: false, follow: false } };
export default async function AccountSecurityPage({ searchParams }: { searchParams?: Promise<{ mfa?: string; next?: string }> }) {
  const params = await searchParams;
  if (!hasSupabaseEnv || env.demoMode) return <AuthPanel title="Account security" description="Live account security requires configured Supabase authentication."><Link href="/login">Back to login</Link></AuthPanel>;
  const db = await createServerSupabaseClient();
  const result = await authAttempt(() => db.auth.getUser());
  if (result.error || !result.data?.user) redirect("/login?redirectTo=/account/security");
  const user = result.data.user;
  const profile = await selectUserProfileCompat(db, user.id);
  const role = profile.error ? null : profile.data?.role;
  const factors = await authAttempt(() => db.auth.mfa.listFactors());
  const totp = factors.data?.totp.find(f => f.status === "verified");
  const elevated = await hasPrivilegedAssurance(db);
  return <AuthPageShell eyebrow="Account access" title="Account security" description="Keep your email, password and privileged access secure." highlights={[{ label: "Your identity", value: "Only your authenticated account can change these settings." }, { label: "Admin protection", value: "An authenticator is required before privileged access." }]}>
    <div className="space-y-6">
      <AuthPanel title="Email and password" description={`Signed in as ${user.email}`}>
        <EmailSecurityForm /><p className="mt-5 text-sm"><Link className="underline" href="/forgot-password">Request a password reset</Link></p>
      </AuthPanel>
      {role === "admin" || totp ? <AuthPanel title="Authenticator verification" description={elevated ? "This session has verified multi-factor access." : "Verify your authenticator to continue. Admin access stays blocked until verification succeeds."}>
        {elevated && params?.next !== "/reset-password" ? <AuthStatusMessage success="Authenticator verified for this session." /> : <AdminAuthenticator factorId={totp?.id} next={params?.next} canEnroll={role === "admin" && !factors.error} />}
        {factors.error ? <AuthStatusMessage error="Authenticator status is unavailable. Reload before trying again." /> : null}
      </AuthPanel> : null}
      <div className="flex flex-wrap items-center gap-4"><Link href={role === "admin" && !elevated ? "/account/security" : "/dashboard"} className="text-sm underline">{role === "admin" && !elevated ? "Refresh security status" : "Continue to workspace"}</Link><form action={logoutAction}><FormSubmitButton variant="outline" pendingLabel="Signing out...">Log out</FormSubmitButton></form></div>
    </div>
  </AuthPageShell>;
}
