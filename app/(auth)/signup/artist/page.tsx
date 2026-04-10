import { AuthConfirmationNotice, AuthPageShell, AuthSessionNotice } from "@/components/forms/auth-form";
import { SignupRoleForm } from "@/components/forms/signup-role-form";
import { resendSignupConfirmationAction } from "@/services/auth/actions";
import { getSessionUser, resolvePostAuthRedirect } from "@/services/auth/session";

export default async function ArtistSignupPage({
  searchParams
}: {
  searchParams?: { error?: string; success?: string; email?: string; confirmation?: string };
}) {
  const user = await getSessionUser();
  const continueHref = user ? resolvePostAuthRedirect(user) : "/";
  const confirmationEmail = searchParams?.confirmation === "required" ? searchParams.email : undefined;

  return (
    <AuthPageShell
      eyebrow="Artist account"
      title="Create your artist account"
      description="Start with a dedicated artist account, then continue directly into stage-name setup, professional profile details, licensing preferences, and your first track prompt."
      highlights={[
        { label: "Profile setup", value: "Capture your full name, artist identity, bio, and public-facing details." },
        { label: "Licensing context", value: "Add payout and licensing preferences before your first submission goes live." },
        { label: "Next step", value: "After signup, you’ll move immediately into guided artist onboarding." }
      ]}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <AuthSessionNotice user={user} continueHref={continueHref} intent="signup" />
        <AuthConfirmationNotice email={confirmationEmail} returnTo="/signup/artist" action={resendSignupConfirmationAction} />
        <SignupRoleForm
          role="artist"
          title="Sign up as an artist"
          description="Create the account you’ll use to manage submissions, rights information, and artist-facing catalog operations."
          helper="This account leads straight into artist onboarding, where you’ll configure your profile, licensing setup, and first-track workflow."
          returnTo="/signup/artist"
          alternateHref="/signup/buyer"
          alternateLabel="Need buyer access instead?"
          alternateActionLabel="Create a buyer account"
          error={searchParams?.error}
          success={searchParams?.success}
        />
      </div>
    </AuthPageShell>
  );
}
