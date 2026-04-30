import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-24">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">Legal</p>
        <h1 className="text-4xl font-semibold tracking-tight">Terms Of Use</h1>
        <p className="text-muted-foreground">
          The Sync Exchange terms govern account access, marketplace participation, checkout, and use of platform-generated license records.
        </p>
      </div>
      <section className="space-y-4 text-sm leading-7 text-muted-foreground">
        <p>
          This launch copy is a navigable placeholder for the production legal document. Final terms should be reviewed and approved by counsel before public launch.
        </p>
        <p>
          Buyers, artists, and administrators are responsible for using the platform only through authorized accounts and preserving the integrity of licensing, payment, and rights-holder information.
        </p>
      </section>
      <div>
        <Button asChild variant="outline">
          <Link href="/buyer/settings">Back To Settings</Link>
        </Button>
      </div>
    </main>
  );
}
