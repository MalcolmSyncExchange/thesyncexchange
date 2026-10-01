import { AuthConfirmationNotice, AuthPageShell, AuthSessionNotice } from "@/components/forms/auth-form";
import { SignupRoleForm } from "@/components/forms/signup-role-form";
import { resendSignupConfirmationAction } from "@/services/auth/actions";
import { getSessionUser, resolvePostAuthRedirect } from "@/services/auth/session";

export default async function BuyerSignupPage(
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
      eyebrow="Buyer signup"
      title="Start finding music."
      description="Create one account. Start with the workspace you need today."
      highlights={[
        { label: "Your projects", value: "Tell us about your company and the work you make." },
        { label: "Your taste", value: "Save the genres and moods you like." },
        { label: "Your saved tracks", value: "Keep the tracks you love and come back when you are ready." }
      ]}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <AuthSessionNotice user={user} continueHref={continueHref} intent="signup" />
        <AuthConfirmationNotice email={confirmationEmail} returnTo="/signup/buyer" action={resendSignupConfirmationAction} />
        <SignupRoleForm
          role="buyer"
          title="Find music for a project"
          description="Start with music search, saved tracks, and license records."
          helper="Next, check your email if asked. Then set up your buyer profile."
          returnTo="/signup/buyer"
          alternateHref="/signup/artist"
          alternateLabel="Looking to upload music instead?"
          alternateActionLabel="I want to list music instead"
          error={searchParams?.error}
          success={searchParams?.success}
        />
      </div>
    </AuthPageShell>
  );
}
