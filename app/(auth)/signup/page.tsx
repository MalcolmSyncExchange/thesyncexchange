import { AuthConfirmationNotice, AuthPageShell, AuthSessionNotice } from "@/components/forms/auth-form";
import { SignupForm } from "@/components/forms/signup-form";
import { resendSignupConfirmationAction } from "@/services/auth/actions";
import { getSessionUser, resolvePostAuthRedirect } from "@/services/auth/session";

export default async function SignUpPage({
  searchParams
}: {
  searchParams?: { error?: string; success?: string; email?: string; confirmation?: string };
}) {
  const user = await getSessionUser();
  const continueHref = user ? resolvePostAuthRedirect(user) : "/";
  const confirmationEmail = searchParams?.confirmation === "required" ? searchParams.email : undefined;

  return (
    <AuthPageShell
      eyebrow="Account creation"
      title="Create your Sync Exchange account"
      description="Start with a clean account setup, then continue into onboarding to choose your workflow, complete profile details, and enter the right workspace."
      highlights={[
        { label: "Simple start", value: "Create the account first, then move directly into onboarding." },
        { label: "Role-aware onboarding", value: "Artists and buyers continue into distinct setup flows after account creation." },
        { label: "Supabase auth", value: "Email and password authentication is handled through your Supabase project." }
      ]}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <AuthSessionNotice user={user} continueHref={continueHref} intent="signup" />
        <AuthConfirmationNotice email={confirmationEmail} returnTo="/signup" action={resendSignupConfirmationAction} />
        <SignupForm
          title="Get started"
          description="Create your account with email and password. You’ll choose or confirm your role in onboarding immediately after signup."
          helper="If you already know you’re joining as an artist or buyer, you can use the dedicated routes below. Otherwise, create the account here and choose inside onboarding."
          returnTo="/signup"
          error={searchParams?.error}
          success={searchParams?.success}
        />
      </div>
    </AuthPageShell>
  );
}
