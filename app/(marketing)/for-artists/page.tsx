import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeader } from "@/components/marketing/section-header";
import { Button } from "@/components/ui/button";

export default function ForArtistsPage() {
  return (
    <main>
      <PageHero
        eyebrow="For artists & rightsholders"
        title="Make your music easy to find and ready to license."
        description="Build your public profile, add your catalog, provide recording and composition details, and set supported license prices."
        actions={<Button asChild><Link href="/signup/artist">Start your artist workspace</Link></Button>}
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Your music. Your offer."
          title="Give buyers a clear path from listen to license."
          description="Artist Desk keeps your public profile, catalog, rights information, and license activity in one focused workspace. You choose what you offer. Listing does not promise placements or income."
        />
        <div className="mt-12">
          <FeatureGrid
            items={[
              { title: "1. Be found.", description: "Build a public artist profile and add your catalog." },
              { title: "2. Make the rights clear.", description: "Provide recording and composition information separately. Save a draft and return when needed." },
              { title: "3. Set license options.", description: "Choose supported offer prices. Platform terms stay separate from your settings." }
            ]}
          />
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">Build your catalog before payout setup.</h2>
          <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">Create your profile, prepare music, and submit for review first. Payee and payout setup must be complete before a track can be purchased.</p>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">Your artist identity, business, contracting party, and payee are separate. A manager or label relationship does not grant workspace access or prove ownership.</p>
        </div>
      </section>
      <CtaBand
        title="Prepare your music one clear step at a time."
        description="See the artist journey, then start a workspace when you are ready."
        actions={<Button asChild><Link href="/how-it-works#artists">See the artist journey</Link></Button>}
      />
    </main>
  );
}
