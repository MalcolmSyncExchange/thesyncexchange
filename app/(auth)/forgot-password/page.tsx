import { AuthFooterLink, AuthPageShell, AuthPanel, AuthStatusMessage } from "@/components/forms/auth-form";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/services/auth/actions";

export default function ForgotPasswordPage({
  searchParams
}: {
  searchParams?: { error?: string; success?: string };
}) {
  return (
    <AuthPageShell
      eyebrow="Password recovery"
      title="Reset account access"
      description="Send a secure recovery link to the email address associated with the workspace. The reset link will bring the user back into a safe password update flow."
      highlights={[
        { label: "Secure recovery", value: "Password resets are handled through Supabase email verification." },
        { label: "Clear next step", value: "The recovery link routes back into a guided password reset screen." },
        { label: "No dead ends", value: "After the password update, the account returns cleanly to login." }
      ]}
    >
      <AuthPanel
        eyebrow="Reset password"
        title="Send recovery instructions"
        description="Enter the account email and we’ll send a secure reset link."
      >
        <form action={forgotPasswordAction} className="space-y-5">
          <AuthStatusMessage error={searchParams?.error} success={searchParams?.success} />
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="name@company.com" required className="h-11" />
          </div>
          <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            If the account exists, the reset email will arrive with a secure link back into the password update flow.
          </div>
          <FormSubmitButton className="w-full" pendingLabel="Sending instructions...">
            Send reset instructions
          </FormSubmitButton>
          <div className="text-sm text-muted-foreground">
            <AuthFooterLink href="/login" label="Remembered your password?" actionLabel="Back to login" />
          </div>
        </form>
      </AuthPanel>
    </AuthPageShell>
  );
}
