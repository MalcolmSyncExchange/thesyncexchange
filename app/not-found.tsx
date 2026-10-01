import Link from "next/link";

import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <MarketingShell>
      <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-start justify-center gap-6 px-4 py-20 sm:px-6 lg:px-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">404</p>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">This page is not here.</h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            Find music in Discover or use the logo to go home.
          </p>
        </div>
        <Button asChild><Link href="/discover">Explore music</Link></Button>
      </main>
    </MarketingShell>
  );
}
