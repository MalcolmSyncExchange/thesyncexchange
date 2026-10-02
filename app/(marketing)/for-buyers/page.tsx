import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeader } from "@/components/marketing/section-header";
import { Button } from "@/components/ui/button";

export default function ForBuyersPage() {
  return (
    <main>
      <PageHero
        eyebrow="For filmmakers, brands & creators"
        title="Find music. Understand the offer. License the track."
        description="Search and preview music. Review the rights information, price, and terms for the license offered. Choose the option that fits your project."
        actions={<Button asChild><Link href="/discover">Find music</Link></Button>}
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="A clear path from search to record"
          title="Know what you can use."
          description="Browse by sound, mood, or artist. Compare the offered license options. Before you buy, check that the terms fit your planned use."
        />
        <div className="mt-12">
          <FeatureGrid
            items={[
              { title: "1. Find it.", description: "Search by genre, mood, or artist. Listen before you choose a track." },
              { title: "2. Clear it.", description: "Review the offered license, its rights information, scope, price, and terms." },
              { title: "3. License it.", description: "After payment and fulfillment, keep your order and license record in your buyer workspace." }
            ]}
          />
        </div>
      </section>
      <CtaBand
        title="Start with a listen."
        description="Open Discover, then sign in when you want to use the live buyer catalog, save a favorite, or move toward a license."
        actions={<Button asChild><Link href="/discover">Find music</Link></Button>}
      />
    </main>
  );
}
