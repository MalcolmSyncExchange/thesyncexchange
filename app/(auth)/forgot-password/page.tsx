import { AuthPageShell, AuthPanel } from "@/components/forms/auth-form";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { forgotPasswordAction } from "@/services/auth/actions";

export default function ForgotPasswordPage({
  searchParams
}: {
  searchParams?: { error?: string; success?: string; email?: string };
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
