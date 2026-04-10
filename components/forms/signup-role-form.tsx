import Link from "next/link";

import { AuthFooterLink, AuthPanel, AuthStatusMessage } from "@/components/forms/auth-form";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction } from "@/services/auth/actions";

export function SignupRoleForm({
  role,
  title,
  description,
  helper,
  returnTo,
  alternateHref,
  alternateLabel,
  alternateActionLabel,
  error,
  success
}: {
  role: "artist" | "buyer";
  title: string;
  description: string;
  helper: string;
  returnTo: string;
  alternateHref: string;
  alternateLabel: string;
  alternateActionLabel: string;
  error?: string;
  success?: string;
}) {
  const submitLabel = role === "artist" ? "Create artist account" : "Create buyer account";

  return (
    <AuthPanel eyebrow={`${role[0].toUpperCase()}${role.slice(1)} signup`} title={title} description={description}>
      <form action={signupAction} className="space-y-5">
        <input type="hidden" name="role" value={role} />
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

        <FormSubmitButton className="w-full" pendingLabel={`${submitLabel}...`}>
          {submitLabel}
        </FormSubmitButton>

        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <AuthFooterLink href="/login" label="Already have an account?" actionLabel="Log in" />
          <span>
            {alternateLabel}{" "}
            <Link href={alternateHref} className="font-medium text-foreground underline-offset-4 hover:underline">
              {alternateActionLabel}
            </Link>
          </span>
        </div>
      </form>
    </AuthPanel>
  );
}
