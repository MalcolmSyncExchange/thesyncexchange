import { AuthPageShell, AuthSessionNotice } from "@/components/forms/auth-form";
import { SignupRoleForm } from "@/components/forms/signup-role-form";
import { getSessionUser, resolvePostAuthRedirect } from "@/services/auth/session";

export default async function BuyerSignupPage({
  searchParams
}: {
  searchParams?: { error?: string };
}) {
  const user = await getSessionUser();
  const continueHref = user ? resolvePostAuthRedirect(user) : "/";

  return (
    <AuthPageShell
      eyebrow="Buyer account"
      title="Create your buyer account"
      description="Set up the account that will carry your company information, discovery preferences, and licensing workflow into the marketplace."
      highlights={[
        { label: "Company setup", value: "Capture company identity, buyer type, and billing context in onboarding." },
        { label: "Discovery setup", value: "Save the genres, moods, and intended-use signals that shape search." },
        { label: "Next step", value: "After signup, you’ll move directly into the buyer onboarding flow." }
      ]}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <AuthSessionNotice user={user} continueHref={continueHref} intent="signup" />
        <SignupRoleForm
          role="buyer"
          title="Sign up as a buyer"
          description="Create the account you’ll use for catalog search, favorites, licensing, and company-level settings."
          helper="This account continues into buyer onboarding so you can set company details, music interests, and search context before browsing the catalog."
          alternateHref="/signup/artist"
          alternateLabel="Looking to upload music instead?"
          alternateActionLabel="Create an artist account"
          error={searchParams?.error}
        />
      </div>
    </AuthPageShell>
  );
}
