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
        eyebrow="For Artists"
        title="Present music like a premium rights-ready asset."
        description="The artist workflow is designed to help serious creators package tracks for real sync opportunities."
        actions={
          <Button asChild>
            <Link href="/signup/artist">Create Artist Account</Link>
          </Button>
        }
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Artist value"
          title="The platform is shaped around professional submission standards."
          description="Metadata discipline, rights visibility, and premium presentation help your music arrive with more credibility."
        />
        <div className="mt-12">
          <FeatureGrid
            columns="two"
            items={[
              { title: "Submission quality", description: "Capture titles, moods, BPM, lyrics, splits, and pricing in one intentional workflow." },
              { title: "Rights clarity", description: "Manage collaborators, percentages, and approval states before a buyer ever asks the question." },
              { title: "Commercial credibility", description: "Public artist pages and catalog presentation feel polished enough for agency and studio buyers." },
              { title: "Revenue readiness", description: "Payout settings, order history, and license configuration live alongside the music itself." }
            ]}
          />
        </div>
      </section>
      <CtaBand
        title="Get your catalog into a licensing environment built for trust."
        description="Start with structured submissions, cleaner splits, and a presentation designed for serious buyers."
        actions={
          <Button asChild>
            <Link href="/signup/artist">Start as an Artist</Link>
          </Button>
        }
      />
    </main>
  );
}
