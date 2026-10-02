import { AuthPageShell, AuthPanel } from "@/components/forms/auth-form";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { forgotPasswordAction } from "@/services/auth/actions";

export default async function ForgotPasswordPage(
  props: {
    searchParams?: Promise<{ error?: string; success?: string; email?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  return (
    <AuthPageShell
      eyebrow="Password recovery"
      title="Reset your password"
      description="Enter your account email. We’ll send you a safe link to make a new password."
      highlights={[
        { label: "Check your email", value: "We’ll send a reset link to your account email." },
        { label: "Make a new password", value: "The link opens a safe password reset page." },
        { label: "Log in again", value: "After the update, you can return to login." }
      ]}
    >
      <AuthPanel
        eyebrow="Reset password"
        title="Send a reset link"
        description="Enter your account email."
      >
        <ForgotPasswordForm
          action={forgotPasswordAction}
          initialEmail={searchParams?.email}
          initialError={searchParams?.error}
          initialSuccess={searchParams?.success}
        />
      </AuthPanel>
    </AuthPageShell>
  );
}
