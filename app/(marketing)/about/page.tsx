import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeader } from "@/components/marketing/section-header";
import { Button } from "@/components/ui/button";

export default function AboutPage() {
  return (
    <main>
      <PageHero
        eyebrow="About The Sync Exchange"
        title="Music licensing has too many disconnected steps."
        description="The Sync Exchange is built to bring discovery, rights information, and licensing into one clearer path."
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="One clearer path"
          title="Built for both sides."
          description="Buyers need a simple way to find music and understand the offer. Artists need a professional way to present a catalog and prepare it for licensing."
        />
        <div className="mt-12">
          <FeatureGrid
            items={[
              { title: "Find it.", description: "Buyers can search and preview music from independent artists. Artists and rightsholders get a focused place to present their work." },
              { title: "Clear it.", description: "Rights information, availability, price, and license terms come together so buyers can understand what is offered." },
              { title: "License it.", description: "Buyers choose the offered license that fits their use and keep the purchase-time license record in their workspace." }
            ]}
          />
        </div>
        <p className="mt-10 max-w-3xl text-sm leading-7 text-muted-foreground">
          The Sync Exchange connects those needs without taking ownership of the music. Platform review helps organize the offer, but it is not a blanket legal guarantee.
        </p>
      </section>
      <CtaBand
        title="See the path from first listen to license record."
        description="Learn what buyers review and how artists prepare music for the marketplace."
        actions={<Button asChild><Link href="/how-it-works">See how it works</Link></Button>}
      />
    </main>
  );
}
