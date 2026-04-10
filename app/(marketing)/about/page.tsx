import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeader } from "@/components/marketing/section-header";
import { Button } from "@/components/ui/button";

export default function AboutPage() {
  return (
    <main>
      <PageHero
        eyebrow="About"
        title="Built to make premium sync licensing feel more precise."
        description="The Sync Exchange is positioned as a disciplined marketplace where creative quality and operational clarity matter equally."
      />
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Positioning"
          title="A marketplace standard built around trust."
          description="The product vision centers on trusted catalog supply, clean rights data, and a licensing flow that respects how real buyers work under deadline."
        />
        <div className="mt-10 space-y-6 text-base leading-8 text-muted-foreground">
          <p>
            This MVP establishes the public-facing foundation first: brand credibility, clear value articulation, and a premium entry point for artists and buyers.
          </p>
          <p>
            From there, the platform expands into artist operations, buyer discovery, and administrative review with the same design language and product discipline.
          </p>
        </div>
      </section>
      <CtaBand
        title="The next phase is execution."
        description="Start the conversation around artist intake, buyer access, or the operating model behind the marketplace."
        actions={
          <Button asChild>
            <Link href="/contact">Contact The Sync Exchange</Link>
          </Button>
        }
      />
    </main>
  );
}
