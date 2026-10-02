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
      eyebrow="One person. One account."
      title="What do you want to do first?"
      description="Choose a starting point. You can use the same account for other authorized workspaces later."
      highlights={[
        { label: "Find music for a project", value: "Start with a buyer workspace and open the protected music catalog." },
        { label: "List music for licensing", value: "Start with an artist workspace and prepare your public profile and catalog." },
        { label: "Access stays protected", value: "This choice starts the right setup. It does not grant workspace access." }
      ]}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <AuthSessionNotice user={user} continueHref={continueHref} intent="signup" />
        <AuthConfirmationNotice email={confirmationEmail} returnTo="/signup" action={resendSignupConfirmationAction} />
        <SignupForm
          title="Create your account"
          description="Choose what you want to do first."
          helper="This choice starts the right setup. It does not grant workspace access."
          returnTo="/signup"
          error={searchParams?.error}
          success={searchParams?.success}
        />
      </div>
    </AuthPageShell>
  );
}
