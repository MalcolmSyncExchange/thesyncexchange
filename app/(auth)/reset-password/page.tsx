import { redirect } from "next/navigation";

import { AuthFooterLink, AuthPageShell, AuthPanel, AuthStatusMessage } from "@/components/forms/auth-form";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reportOperationalEvent } from "@/lib/monitoring";
import { updatePasswordAction } from "@/services/auth/actions";
import { buildRecoveryConfirmPath, getResetPasswordRecoveryRoutingDecision } from "@/services/auth/auth-flow";
import { createServerSupabaseClient } from "@/services/supabase/server";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams?: { code?: string; token_hash?: string; type?: string; error?: string };
}) {
  const code = searchParams?.code || null;
  const tokenHash = searchParams?.token_hash || null;
  const type = searchParams?.type || null;
  const hasAuthParams = Boolean(code || tokenHash);
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();
  const hasSession = Boolean(session);
  const routingDecision = getResetPasswordRecoveryRoutingDecision({ hasAuthParams, hasSession });

  reportOperationalEvent("reset_password_page_requested", "Reset password page requested.", {
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    type: type || null,
    hasSession,
    sessionErrorCode: sessionError?.code || null,
    sessionErrorMessage: sessionError?.message || null,
    redirectsToConfirm: routingDecision === "confirm",
    routingDecision
  });

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
      description="Set a new password for the account and return directly to login with the updated credentials."
      highlights={[
        { label: "Protected flow", value: "This screen is intended to be reached from the verified recovery link." },
        { label: "Immediate handoff", value: "Once the password is updated, the flow returns to login." },
        { label: "Account continuity", value: "Onboarding and dashboard routing remain intact after sign-in." }
      ]}
    >
      <AuthPanel
        eyebrow="New password"
        title="Update password"
        description="Choose a secure password you’ll use for future sign-ins."
      >
        <form action={updatePasswordAction} className="space-y-5">
          <AuthStatusMessage error={searchParams?.error} />
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" required className="h-11" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" required className="h-11" />
          </div>
          <FormSubmitButton className="w-full" pendingLabel="Updating Password...">
            Update Password
          </FormSubmitButton>
          <div className="text-sm text-muted-foreground">
            <AuthFooterLink href="/login" label="Need to return?" actionLabel="Back to Login" />
          </div>
        </form>
      </AuthPanel>
    </AuthPageShell>
  );
}
