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
      eyebrow="Artist signup"
      title="Put your music in reach."
      description="Create one account. Start with the workspace you need today."
      highlights={[
        { label: "Introduce your music", value: "Build your artist profile with a bio and links." },
        { label: "Add your music", value: "Add track details, rights holders, and license choices." },
        { label: "See what happens next", value: "Save a draft, send it for review, and see each track’s status." }
      ]}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <AuthSessionNotice user={user} continueHref={continueHref} intent="signup" />
        <AuthConfirmationNotice email={confirmationEmail} returnTo="/signup/artist" action={resendSignupConfirmationAction} />
        <SignupRoleForm
          role="artist"
          title="List music for licensing"
          description="Start with your artist identity, then build your profile and catalog."
          helper="Next, check your email if asked. Then set up your artist profile."
          returnTo="/signup/artist"
          alternateHref="/signup/buyer"
          alternateLabel="Need buyer access instead?"
          alternateActionLabel="I’m looking for music instead"
          error={searchParams?.error}
          success={searchParams?.success}
        />
      </div>
    </AuthPageShell>
  );
}
