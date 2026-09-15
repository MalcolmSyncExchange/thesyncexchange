import { SignupRoleLinks } from "@/components/forms/signup-role-links";

import { AuthFooterLink, AuthPanel, AuthStatusMessage } from "@/components/forms/auth-form";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction } from "@/services/auth/actions";

export function SignupForm({
  title,
  description,
  helper,
  returnTo,
  error,
  success
}: {
  title: string;
  description: string;
  helper: string;
  returnTo: string;
  error?: string;
  success?: string;
}) {
  return (
    <AuthPanel eyebrow="Create account" title={title} description={description}>
      <form action={signupAction} className="space-y-5">
        <input type="hidden" name="returnTo" value={returnTo} />
        <AuthStatusMessage error={error} success={success} />
        <SignupRoleLinks />

        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" autoComplete="name" placeholder="Your full name" required className="h-11" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="name@company.com" required className="h-11" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" aria-describedby="password-help" placeholder="Create a secure password" required className="h-11" />
          <p id="password-help" className="text-sm text-muted-foreground">Use a unique password. Your password manager can create one.</p>
        </div>

        <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">{helper}</div>

        <FormSubmitButton className="w-full" pendingLabel="Creating Account...">
          Create Account
        </FormSubmitButton>

        <div className="space-y-3 text-sm text-muted-foreground">
          <AuthFooterLink href="/login" label="Already have an account?" actionLabel="Log In" />

        </div>
      </form>
    </AuthPanel>
  );
}
