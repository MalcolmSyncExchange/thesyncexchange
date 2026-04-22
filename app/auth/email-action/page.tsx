import Link from "next/link";

import { BrandLogo } from "@/components/layout/brand-assets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";

type AuthEmailFlow = "signup" | "invite" | "magiclink" | "email_change" | "recovery" | "reauthentication";

const flowCopy: Record<
  AuthEmailFlow,
  {
    eyebrow: string;
    title: string;
    body: string;
    buttonLabel: string;
  }
> = {
  signup: {
    eyebrow: "Account Verification",
    title: "Confirm Your Email",
    body: "For your security, your email confirmation only completes after you click the button below.",
    buttonLabel: "Confirm Email"
  },
  invite: {
    eyebrow: "Invitation",
    title: "Accept Your Invitation",
    body: "This invitation stays inactive until you continue from this page.",
    buttonLabel: "Accept Invitation"
  },
  magiclink: {
    eyebrow: "Secure Access",
    title: "Continue Sign-In",
    body: "Your sign-in link stays inactive until you confirm it from this page.",
    buttonLabel: "Sign In Securely"
  },
  email_change: {
    eyebrow: "Email Security",
    title: "Confirm Your New Email Address",
    body: "Your email change only completes after you continue from this page.",
    buttonLabel: "Confirm Email Change"
  },
  recovery: {
    eyebrow: "Account Recovery",
    title: "Continue Password Reset",
    body: "Your password reset link stays inactive until you confirm it from this page.",
    buttonLabel: "Reset Password"
  },
  reauthentication: {
    eyebrow: "Security Check",
    title: "Confirm This Secure Action",
    body: "This verification link stays inactive until you continue from this page.",
    buttonLabel: "Confirm Secure Action"
  }
};

function parseFlow(rawFlow?: string): AuthEmailFlow {
  if (
    rawFlow === "signup" ||
    rawFlow === "invite" ||
    rawFlow === "magiclink" ||
    rawFlow === "email_change" ||
    rawFlow === "recovery" ||
    rawFlow === "reauthentication"
  ) {
    return rawFlow;
  }

  return "signup";
}

function getAllowedConfirmationHosts() {
  const hosts = new Set<string>();

  if (env.supabaseUrl) {
    try {
      hosts.add(new URL(env.supabaseUrl).host);
    } catch {
      // Ignore invalid env in this presentation-only helper.
    }
  }

  if (env.appUrl) {
    try {
      hosts.add(new URL(env.appUrl).host);
    } catch {
      // Ignore invalid env in this presentation-only helper.
    }
  }

  return hosts;
}

function resolveConfirmationUrl(rawConfirmationUrl?: string) {
  if (!rawConfirmationUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawConfirmationUrl);
    const allowedHosts = getAllowedConfirmationHosts();
    if (!allowedHosts.has(parsed.host)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveDestinationLabel(confirmationUrl: string | null) {
  if (!confirmationUrl) {
    return "your next step in The Sync Exchange";
  }

  try {
    const redirectTo = new URL(confirmationUrl).searchParams.get("redirect_to");
    if (!redirectTo) {
      return "your next step in The Sync Exchange";
    }

    const redirectUrl = new URL(redirectTo);
    const nextPath = redirectUrl.searchParams.get("next") || redirectUrl.pathname;

    if (nextPath.startsWith("/reset-password")) {
      return "the password reset flow";
    }

    if (nextPath.startsWith("/onboarding")) {
      return "onboarding";
    }

    if (nextPath.startsWith("/admin")) {
      return "the admin workspace";
    }

    if (nextPath.startsWith("/artist")) {
      return "the artist workspace";
    }

    if (nextPath.startsWith("/buyer")) {
      return "the buyer workspace";
    }
  } catch {
    // Ignore parse issues and fall back to the generic label.
  }

  return "your next step in The Sync Exchange";
}

export default function AuthEmailActionPage({
  searchParams
}: {
  searchParams?: {
    flow?: string;
    confirmation_url?: string;
    email?: string;
    new_email?: string;
  };
}) {
  const flow = parseFlow(searchParams?.flow);
  const copy = flowCopy[flow];
  const confirmationUrl = resolveConfirmationUrl(searchParams?.confirmation_url);
  const email = searchParams?.email || "";
  const newEmail = searchParams?.new_email || "";
  const destinationLabel = resolveDestinationLabel(confirmationUrl);

  return (
    <main className="mx-auto flex min-h-[100svh] w-full max-w-5xl items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex justify-center">
          <BrandLogo className="w-[180px] sm:w-[208px]" priority />
        </div>

        <Card className="border-border/80 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{copy.eyebrow}</p>
            <CardTitle className="text-3xl tracking-tight">{copy.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-base leading-7 text-muted-foreground">{copy.body}</p>

            {email ? (
              <div className="rounded-xl border border-border/80 bg-muted/40 px-4 py-3 text-sm text-foreground">
                <span className="font-medium">Email:</span> {email}
                {newEmail ? (
                  <>
                    <br />
                    <span className="font-medium">New Email:</span> {newEmail}
                  </>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-xl border border-accent/20 bg-accent/10 px-4 py-4 text-sm leading-6 text-foreground">
              This extra step protects one-time authentication links from being consumed by automatic email scanning before you intentionally continue.
            </div>

            {confirmationUrl ? (
              <div className="space-y-3">
                <Button asChild size="lg" className="w-full rounded-full">
                  <Link href={confirmationUrl}>{copy.buttonLabel}</Link>
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  You’ll continue into <span className="font-medium text-foreground">{destinationLabel}</span>.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-4 text-sm leading-6 text-foreground">
                This verification link is incomplete or expired. Return to The Sync Exchange and request a fresh email.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
