import { AuthConfirmationNotice, AuthPageShell, AuthSessionNotice } from "@/components/forms/auth-form";
import { SignupForm } from "@/components/forms/signup-form";
import { resendSignupConfirmationAction } from "@/services/auth/actions";
import { getSessionUser, resolvePostAuthRedirect } from "@/services/auth/session";

export default async function SignUpPage(
  props: {
    searchParams?: Promise<{ error?: string; success?: string; email?: string; confirmation?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getSessionUser();
  const continueHref = user ? resolvePostAuthRedirect(user) : "/";
  const confirmationEmail = searchParams?.confirmation === "required" ? searchParams.email : undefined;

  return (
    <AuthPageShell
      compact
      eyebrow="Account creation"
      title="Your next chapter starts here."
      description="Find music for your next project. Or bring your own music to the catalog."
      highlights={[
        { label: "Create your account", value: "Start with your name, email and a password." },
        { label: "Make it your workspace", value: "Set up the details that matter for your music or your projects." },
        { label: "Pick up where you left off", value: "Your saved tracks and submissions stay together in your account." }
      ]}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <AuthSessionNotice user={user} continueHref={continueHref} intent="signup" />
        <AuthConfirmationNotice email={confirmationEmail} returnTo="/signup" action={resendSignupConfirmationAction} />
        <SignupForm
          title="Get started"
          description="Choose your path, or decide during setup."
          helper="After signup, confirm your email if prompted, then complete your profile."
          returnTo="/signup"
          error={searchParams?.error}
          success={searchParams?.success}
        />
      </div>
    </AuthPageShell>
  );
}
