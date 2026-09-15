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
      title="Create your Sync Exchange account"
      description="Find music for your next project or prepare your catalog for licensing."
      highlights={[
        { label: "Simple start", value: "Create the account first, then move directly into onboarding." },
        { label: "Role-aware onboarding", value: "Artists and buyers continue into distinct setup flows after account creation." },
        { label: "Your workspace", value: "Return to your saved tracks or submissions whenever you need them." }
      ]}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <AuthSessionNotice user={user} continueHref={continueHref} intent="signup" />
        <AuthConfirmationNotice email={confirmationEmail} returnTo="/signup" action={resendSignupConfirmationAction} />
        <SignupForm
          title="Get started"
          description="Choose your path below, or create an account and decide during setup."
          helper="After signup, confirm your email if prompted, then complete your profile."
          returnTo="/signup"
          error={searchParams?.error}
          success={searchParams?.success}
        />
      </div>
    </AuthPageShell>
  );
}
