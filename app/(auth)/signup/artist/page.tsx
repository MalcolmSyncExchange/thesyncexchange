import { AuthConfirmationNotice, AuthPageShell, AuthSessionNotice } from "@/components/forms/auth-form";
import { SignupRoleForm } from "@/components/forms/signup-role-form";
import { resendSignupConfirmationAction } from "@/services/auth/actions";
import { getSessionUser, resolvePostAuthRedirect } from "@/services/auth/session";

export default async function ArtistSignupPage(
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
      eyebrow="Artist account"
      title="Your next release starts here."
      description="Create an artist account to prepare your catalog, manage rights and follow your submissions."
      highlights={[
        { label: "Introduce your music", value: "Build your artist profile with a bio and links." },
        { label: "Prepare your catalog", value: "Add track details, rights holders and licensing preferences." },
        { label: "Follow your progress", value: "Save a draft, submit for review and see where each track stands." }
      ]}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <AuthSessionNotice user={user} continueHref={continueHref} intent="signup" />
        <AuthConfirmationNotice email={confirmationEmail} returnTo="/signup/artist" action={resendSignupConfirmationAction} />
        <SignupRoleForm
          role="artist"
          title="Sign up as an artist"
          description="One account for your music, submissions and rights."
          helper="Next, confirm your email if prompted and set up your artist profile."
          returnTo="/signup/artist"
          alternateHref="/signup/buyer"
          alternateLabel="Need buyer access instead?"
          alternateActionLabel="Create a Buyer Account"
          error={searchParams?.error}
          success={searchParams?.success}
        />
      </div>
    </AuthPageShell>
  );
}
