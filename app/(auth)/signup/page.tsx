import { redirect } from "next/navigation";

import { AuthFooterLink, AuthPageShell, AuthPanel, AuthRoleCard, AuthSessionNotice } from "@/components/forms/auth-form";
import { getSessionUser, resolvePostAuthRedirect } from "@/services/auth/session";

export default async function SignUpPage({
  searchParams
}: {
  searchParams?: { role?: string };
}) {
  const user = await getSessionUser();
  const continueHref = user ? resolvePostAuthRedirect(user) : "/";

  if (searchParams?.role === "artist") {
    redirect("/signup/artist");
  }

  if (searchParams?.role === "buyer") {
    redirect("/signup/buyer");
  }

  return (
    <AuthPageShell
      eyebrow="Account creation"
      title="Choose how you’re joining The Sync Exchange"
      description="Start with the account path that matches your first workflow. Artists move into profile and catalog setup. Buyers move into company setup and discovery preferences."
      highlights={[
        { label: "Artist path", value: "Profile setup, rights context, licensing preferences, and first-track onboarding." },
        { label: "Buyer path", value: "Company setup, music interests, and a clean path into catalog discovery." },
        { label: "Progress", value: "Every new account continues directly into a persisted onboarding flow after signup." }
      ]}
    >
      <AuthPanel
        eyebrow="Get started"
        title="Create your account"
        description="Choose the experience you want to set up first. Each path has dedicated signup messaging and a role-specific onboarding flow."
      >
        <div className="space-y-4">
          <AuthSessionNotice user={user} continueHref={continueHref} intent="signup" />
          <AuthRoleCard
            href="/signup/artist"
            eyebrow="Artist account"
            title="Sign up as an artist"
            description="Build a rights-ready profile, configure licensing preferences, and move straight into your first submission."
            bullets={["Stage name and artist profile setup", "Licensing and payout configuration", "Guided path into track upload"]}
          />
          <AuthRoleCard
            href="/signup/buyer"
            eyebrow="Buyer account"
            title="Sign up as a buyer"
            description="Set up your company profile, search context, and music interests before heading into the catalog."
            bullets={["Company and billing setup", "Discovery preferences and intended use", "Immediate path into buyer onboarding"]}
          />
          <div className="pt-2 text-sm text-muted-foreground">
            <AuthFooterLink href="/login" label="Already have an account?" actionLabel="Log in" />
          </div>
        </div>
      </AuthPanel>
    </AuthPageShell>
  );
}
