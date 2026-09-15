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
      eyebrow="Buyer account"
      title="Find your next sound."
      description="Create a buyer account to discover music, build a shortlist and license tracks for your projects."
      highlights={[
        { label: "Your projects", value: "Tell us a little about your company and the work you create." },
        { label: "Your taste", value: "Save your favorite genres and moods to help you start exploring." },
        { label: "Your shortlist", value: "Keep the tracks you love close, and return when you’re ready to license." }
      ]}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <AuthSessionNotice user={user} continueHref={continueHref} intent="signup" />
        <AuthConfirmationNotice email={confirmationEmail} returnTo="/signup/buyer" action={resendSignupConfirmationAction} />
        <SignupRoleForm
          role="buyer"
          title="Sign up as a buyer"
          description="One account for discovery, saved tracks and licenses."
          helper="Next, confirm your email if prompted and set up your buyer profile."
          returnTo="/signup/buyer"
          alternateHref="/signup/artist"
          alternateLabel="Looking to upload music instead?"
          alternateActionLabel="Create an Artist Account"
          error={searchParams?.error}
          success={searchParams?.success}
        />
      </div>
    </AuthPageShell>
  );
}
