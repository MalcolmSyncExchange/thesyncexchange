import Link from "next/link";

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

        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" placeholder="Your full name" required className="h-11" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="name@company.com" required className="h-11" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" placeholder="Create a secure password" required className="h-11" />
        </div>

        <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">{helper}</div>

        <FormSubmitButton className="w-full" pendingLabel="Creating Account...">
          Create Account
        </FormSubmitButton>

        <div className="space-y-3 text-sm text-muted-foreground">
          <AuthFooterLink href="/login" label="Already have an account?" actionLabel="Log In" />
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/signup/artist" className="font-medium text-foreground underline-offset-4 hover:underline">
              Start as Artist Instead
            </Link>
            <Link href="/signup/buyer" className="font-medium text-foreground underline-offset-4 hover:underline">
              Start as Buyer Instead
            </Link>
          </div>
        </div>
      </form>
    </AuthPanel>
  );
}
