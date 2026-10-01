"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function MarketingError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[marketing route error]", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-start justify-center gap-6 px-4 py-20 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Page error</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">We couldn’t open this page.</h1>
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
          Try again or return to Discover. Your saved purchases are not changed.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/discover">Explore music</Link>
        </Button>
      </div>
    </main>
  );
}
