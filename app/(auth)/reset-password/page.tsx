import { AuthFooterLink, AuthPageShell, AuthPanel, AuthStatusMessage } from "@/components/forms/auth-form";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePasswordAction } from "@/services/auth/actions";

export default function ResetPasswordPage({
  searchParams
}: {
  searchParams?: { error?: string };
}) {
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
          <FormSubmitButton className="w-full" pendingLabel="Updating password...">
            Update password
          </FormSubmitButton>
          <div className="text-sm text-muted-foreground">
            <AuthFooterLink href="/login" label="Need to return?" actionLabel="Back to login" />
          </div>
        </form>
      </AuthPanel>
    </AuthPageShell>
  );
}
