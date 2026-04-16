import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeader } from "@/components/marketing/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PricingPage() {
  return (
    <main>
      <PageHero
        eyebrow="Pricing"
        title="Structured for premium catalog supply and flexible buyer demand."
        description="Artist plans, transactional licensing, and enterprise support can evolve without changing the product foundation."
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Commercial model"
          title="Simple enough to understand, premium enough to scale."
          description="These pricing surfaces are intentionally clear placeholders for the MVP and can be refined with finance and legal review."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {[
            ["Artist Plan", "$39/mo", "Submission workflow, rights management, and buyer-ready catalog presence.", "Start Submitting"],
            ["Buyer Access", "Free to browse", "Search, shortlist, and purchase licenses only when needed.", "Browse Catalog"],
            ["Enterprise", "Custom", "Negotiated sourcing, white-glove licensing, and tailored terms.", "Contact Sales"]
          ].map(([title, price, copy, cta]) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-4xl font-semibold">{price}</p>
                <p className="text-sm leading-6 text-muted-foreground">{copy}</p>
                <Button asChild className="w-full">
                  <Link href={title === "Enterprise" ? "/contact" : title === "Buyer Access" ? "/signup/buyer" : "/signup/artist"}>{cta}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <CtaBand
        title="Need custom licensing support or higher-volume sourcing?"
        description="Enterprise pathways can accommodate bespoke pricing, higher-touch search support, and tailored rights handling."
        actions={
          <Button asChild>
            <Link href="/contact">Start a Conversation</Link>
          </Button>
        }
      />
    </main>
  );
}
