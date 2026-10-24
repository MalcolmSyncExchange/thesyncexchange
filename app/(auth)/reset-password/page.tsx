import { redirect } from "next/navigation";

import { AuthFooterLink, AuthPageShell, AuthPanel, AuthStatusMessage } from "@/components/forms/auth-form";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { env, hasSupabaseEnv } from "@/lib/env";
import { authAttempt } from "@/services/auth/security";
import { reportOperationalEvent } from "@/lib/monitoring";
import { updatePasswordAction } from "@/services/auth/actions";
import { buildRecoveryConfirmPath, getResetPasswordRecoveryRoutingDecision } from "@/services/auth/auth-flow";
import { createServerSupabaseClient } from "@/services/supabase/server";

export default async function ResetPasswordPage(
  props: {
    searchParams?: Promise<{ code?: string; token_hash?: string; type?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const code = searchParams?.code || null;
  const tokenHash = searchParams?.token_hash || null;
  const type = searchParams?.type || null;
  const hasAuthParams = Boolean(code || tokenHash);
  const verified = hasSupabaseEnv && !env.demoMode
    ? await authAttempt(async () => (await createServerSupabaseClient()).auth.getUser())
    : { data: null, error: null };
  const hasSession = Boolean(verified.data?.user) && !verified.error;
  const sessionError = verified.error;
  const routingDecision = getResetPasswordRecoveryRoutingDecision({ hasAuthParams, hasSession });

  reportOperationalEvent("reset_password_page_requested", "Reset password page requested.", {
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    type: type || null,
    hasSession,
    sessionErrorCode: sessionError?.code || null,
    redirectsToConfirm: routingDecision === "confirm",
    routingDecision
  });

  if (hasAuthParams && hasSession) redirect("/reset-password");

  if (routingDecision === "confirm") {
    reportOperationalEvent("reset_password_page_confirm_redirect", "Reset password page routed one-time recovery parameters through confirmation.", {
      hasCode: Boolean(code),
      hasTokenHash: Boolean(tokenHash),
      hasSession,
      routingDecision
    });
    redirect(
      buildRecoveryConfirmPath({
        code,
        tokenHash,
        type: tokenHash ? type || "recovery" : type,
        nextPath: "/reset-password"
      })
    );
  }

  reportOperationalEvent("reset_password_page_rendering_form", "Reset password page is rendering the password update form.", {
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    hasSession,
    redirectsToConfirm: false,
    routingDecision
  });

  return (
    <AuthPageShell
      eyebrow="Password update"
      title="Create a new password"
      description="Make a new password for your account. Then return to login."
      highlights={[
        { label: "Safe link", value: "Open this page from the reset link in your email." },
        { label: "One more step", value: "After you save the password, go back to login." },
        { label: "Your work stays saved", value: "Your account setup and workspace stay the same." }
      ]}
    >
      <AuthPanel
        eyebrow="New password"
        title="Update password"
        description="Choose a secure password you’ll use for future sign-ins."
      >
        {!hasSession && !(env.demoMode && !hasSupabaseEnv) ? <div className="space-y-4"><AuthStatusMessage error="Your reset session is missing or expired. Request a fresh link to continue." /><a href="/forgot-password" className="underline">Request a new reset link</a></div> : <form action={updatePasswordAction} className="space-y-5">
          <AuthStatusMessage error={searchParams?.error} />
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required className="h-11" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" minLength={12} maxLength={72} autoComplete="new-password" required className="h-11" />
          </div>
          <FormSubmitButton className="w-full" pendingLabel="Updating Password...">
            Update Password
          </FormSubmitButton>
          <div className="text-sm text-muted-foreground">
            <AuthFooterLink href="/login" label="Need to return?" actionLabel="Back to Login" />
          </div>
        </form>}
      </AuthPanel>
    </AuthPageShell>
  );
}
