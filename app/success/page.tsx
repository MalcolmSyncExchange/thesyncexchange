import Link from "next/link";

import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";

export default function SuccessPage() {
  return (
    <MarketingShell>
      <main className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-border bg-card p-8 shadow-panel sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Stripe test checkout</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">Payment successful</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Your Stripe test payment completed successfully. If webhook forwarding is active, you should also see a
            <span className="font-medium text-foreground"> checkout.session.completed </span>
            event in the local logs.
          </p>
          <div className="mt-8">
            <Button asChild>
              <Link href="/test-checkout">Run the Test Again</Link>
            </Button>
          </div>
        </div>
      </main>
    </MarketingShell>
  );
}
