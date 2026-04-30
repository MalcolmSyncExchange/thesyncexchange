import Link from "next/link";
import { notFound } from "next/navigation";

import { TestCheckoutButton } from "@/components/checkout/test-checkout-button";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Badge } from "@/components/ui/badge";
import { getDeploymentTarget } from "@/lib/env";

export default function TestCheckoutPage() {
  if (getDeploymentTarget() === "production") {
    notFound();
  }

  return (
    <MarketingShell>
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-border bg-card p-8 shadow-panel sm:p-10">
          <Badge variant="outline">Stripe test checkout</Badge>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight">Verify the payment flow end to end.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            This page starts a simple Stripe test-mode checkout for a single $25 test license. Use a Stripe test card to confirm redirects and webhook delivery locally.
          </p>
          <div className="mt-8">
            <TestCheckoutButton />
          </div>
          <div className="mt-8 rounded-md border border-border bg-background/80 p-5 text-sm text-muted-foreground">
            Test card: <span className="font-medium text-foreground">4242 4242 4242 4242</span>
            <br />
            Use any future expiry date, any three-digit CVC, and any ZIP code.
          </div>
          <div className="mt-6 text-sm text-muted-foreground">
            Need the current auth flow instead?{" "}
            <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Log In
            </Link>
          </div>
        </div>
      </main>
    </MarketingShell>
  );
}
