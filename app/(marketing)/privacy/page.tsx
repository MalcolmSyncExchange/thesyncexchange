import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-24">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">Legal</p>
        <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="text-muted-foreground">
          The Sync Exchange uses account, catalog, checkout, and licensing data to operate a secure sync licensing marketplace.
        </p>
      </div>
      <section className="space-y-4 text-sm leading-7 text-muted-foreground">
        <p>
          This launch copy is a navigable placeholder for the production privacy policy. Final privacy language should be reviewed and approved by counsel before public launch.
        </p>
        <p>
          Operational data may include buyer profile details, artist submission metadata, order records, generated agreement references, and security events needed to protect marketplace access.
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
