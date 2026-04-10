import Link from "next/link";

import {
  AuthConfirmationNotice,
  AuthFooterLink,
  AuthPageShell,
  AuthPanel,
  AuthSessionNotice,
  AuthStatusMessage
} from "@/components/forms/auth-form";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, resendSignupConfirmationAction } from "@/services/auth/actions";
import { getSessionUser, resolvePostLoginRedirect } from "@/services/auth/session";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: { error?: string; success?: string; redirectTo?: string; email?: string; confirmation?: string };
}) {
  const user = await getSessionUser();
  const continueHref = user ? resolvePostLoginRedirect(user, searchParams?.redirectTo) : "/";
  const confirmationEmail = searchParams?.confirmation === "required" ? searchParams.email : undefined;

  return (
    <AuthPageShell
      eyebrow="Account access"
      title="Sign in to your workspace"
      description="Access your artist, buyer, or admin workspace with the email and password already associated with your account. We’ll route you to the right place after sign-in."
      highlights={[
        { label: "Artists", value: "Resume submissions, rights setup, and catalog management." },
        { label: "Buyers", value: "Return to saved tracks, recent orders, and live catalog search." },
        { label: "Admins", value: "Step back into moderation, compliance, and platform operations." }
      ]}
    >
      <AuthPanel
        eyebrow="Log in"
        title="Welcome back"
        description="Use your existing account credentials. New accounts should start from the account creation flow."
      >
        <form action={loginAction} className="space-y-5">
          <input type="hidden" name="redirectTo" value={searchParams?.redirectTo || ""} />
          <AuthSessionNotice user={user} continueHref={continueHref} intent="login" />
          <AuthConfirmationNotice email={confirmationEmail} returnTo="/login" action={resendSignupConfirmationAction} />
          <AuthStatusMessage error={searchParams?.error} success={searchParams?.success} />

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="name@company.com" required className="h-11" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Forgot password?
              </Link>
            </div>
            <Input id="password" name="password" type="password" placeholder="••••••••" required className="h-11" />
          </div>

          <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            Sign in once and the platform will send you to onboarding if setup is incomplete, or straight into the correct workspace if you’re already configured.
          </div>

          <FormSubmitButton className="w-full" pendingLabel="Signing you in...">
            Log in
          </FormSubmitButton>

          <div className="text-sm text-muted-foreground">
            <AuthFooterLink href="/signup" label="Need an account?" actionLabel="Create one" />
          </div>
        </form>
      </AuthPanel>
    </AuthPageShell>
  );
}
