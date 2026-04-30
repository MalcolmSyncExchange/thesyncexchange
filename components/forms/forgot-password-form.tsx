"use client";

import { useFormState } from "react-dom";

import { AuthFooterLink, AuthStatusMessage } from "@/components/forms/auth-form";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ForgotPasswordActionState } from "@/services/auth/auth-flow";

type ForgotPasswordAction = (
  previousState: ForgotPasswordActionState,
  formData: FormData
) => Promise<ForgotPasswordActionState>;

export function ForgotPasswordForm({
  action,
  initialEmail,
  initialError,
  initialSuccess
}: {
  action: ForgotPasswordAction;
  initialEmail?: string;
  initialError?: string;
  initialSuccess?: string;
}) {
  const [state, formAction] = useFormState(action, {
    status: initialError ? "error" : initialSuccess ? "success" : "idle",
    message: initialError || initialSuccess || "",
    email: initialEmail || ""
  } satisfies ForgotPasswordActionState);

  return (
    <form action={formAction} className="space-y-5">
      <AuthStatusMessage
        error={state.status === "error" ? state.message : undefined}
        success={state.status === "success" ? state.message : undefined}
      />
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="name@company.com"
          defaultValue={state.email || ""}
          required
          className="h-11"
        />
      </div>
      <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
        If the account exists and email delivery is configured correctly, the reset email will arrive with a secure link back into the password update flow.
      </div>
      <FormSubmitButton className="w-full" pendingLabel="Sending Instructions...">
        Send Reset Instructions
      </FormSubmitButton>
      <div className="text-sm text-muted-foreground">
        <AuthFooterLink href="/login" label="Remembered your password?" actionLabel="Back to Login" />
      </div>
    </form>
  );
}
