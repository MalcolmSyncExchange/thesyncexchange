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

export default async function LoginPage(
  props: {
    searchParams?: Promise<{ error?: string; success?: string; redirectTo?: string; email?: string; confirmation?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getSessionUser();
  const continueHref = user ? resolvePostLoginRedirect(user, searchParams?.redirectTo) : "/";
  const confirmationEmail = searchParams?.confirmation === "required" ? searchParams.email : undefined;

  return (
    <AuthPageShell
      eyebrow="Welcome back"
      title="Pick up where you left off."
      description="Log in to open a workspace you can use."
      highlights={[
        { label: "Artists", value: "Go back to your music, rights details, and catalog." },
        { label: "Buyers", value: "Go back to saved tracks, orders, and music search." }
      ]}
    >
      <AuthPanel
        eyebrow="Account access"
        title="Log in"
        description="Use the email and password for your account."
      >
        <form action={loginAction} className="space-y-5" data-testid="login-form">
          <input type="hidden" name="redirectTo" value={searchParams?.redirectTo || ""} />
          <AuthSessionNotice user={user} continueHref={continueHref} intent="login" />
          <AuthConfirmationNotice email={confirmationEmail} returnTo="/login" action={resendSignupConfirmationAction} />
          <AuthStatusMessage error={searchParams?.error} success={searchParams?.success} />

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="name@company.com" required className="h-11" data-testid="login-email" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Forgot Password?
              </Link>
            </div>
            <Input id="password" name="password" type="password" placeholder="••••••••" required className="h-11" data-testid="login-password" />
          </div>

          <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            If setup is not done, we’ll take you there first. If it is done, we’ll open your workspace.
          </div>

          <FormSubmitButton className="w-full" pendingLabel="Signing You In..." data-testid="login-submit">
            Log In
          </FormSubmitButton>

          <div className="text-sm text-muted-foreground">
            <AuthFooterLink href="/signup" label="Need an account?" actionLabel="Create One" />
          </div>
        </form>
      </AuthPanel>
    </AuthPageShell>
  );
}
