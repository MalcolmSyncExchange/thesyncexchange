import { AuthPageShell, AuthSessionNotice } from "@/components/forms/auth-form";
import { SignupRoleForm } from "@/components/forms/signup-role-form";
import { getSessionUser, resolvePostAuthRedirect } from "@/services/auth/session";

export default async function ArtistSignupPage({
  searchParams
}: {
  searchParams?: { error?: string };
}) {
  const user = await getSessionUser();
  const continueHref = user ? resolvePostAuthRedirect(user) : "/";

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
        <SignupRoleForm
          role="artist"
          title="Sign up as an artist"
          description="Create the account you’ll use to manage submissions, rights information, and artist-facing catalog operations."
          helper="This account leads straight into artist onboarding, where you’ll configure your profile, licensing setup, and first-track workflow."
          alternateHref="/signup/buyer"
          alternateLabel="Need buyer access instead?"
          alternateActionLabel="Create a buyer account"
          error={searchParams?.error}
        />
      </div>
    </AuthPageShell>
  );
}
