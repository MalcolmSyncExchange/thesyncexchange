"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function OnboardingError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full rounded-lg border border-border bg-card/95 p-8 shadow-panel sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            Setup issue
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">We hit a problem loading this onboarding step</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            Your progress should still be preserved. Try reloading this step first. If the issue continues, return to login and resume the flow from there.
          </p>
          <div className="mt-8 rounded-lg border border-border bg-background/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Error details</p>
            <p className="mt-3 break-words text-sm text-muted-foreground">{error.message || "Unexpected onboarding error."}</p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Try This Step Again
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Return to Login</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
