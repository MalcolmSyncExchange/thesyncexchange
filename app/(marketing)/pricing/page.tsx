import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeader } from "@/components/marketing/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const pricingAreas = [
  {
    title: "Buyer access",
    heading: "Browse before you buy.",
    description: "Open Discover first. The live catalog requires an authorized buyer account. License prices are separate."
  },
  {
    title: "Music licenses",
    heading: "A price for each offered license.",
    description: "See the price and terms with the offer. Final license pricing must come from the approved live offer."
  },
  {
    title: "Artist access",
    heading: "Final plan pricing is pending.",
    description: "Artist plans, platform fees, and transaction fees still need business approval."
  }
];

export default function PricingPage() {
  return (
    <main>
      <PageHero
        eyebrow="Pricing"
        title="See each cost before you commit."
        description="A music license price is separate from any platform charge. This page keeps those costs easy to tell apart."
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Pricing decisions still awaiting approval"
          title="Know which cost is which."
          description="No price or fee shown here is final until the business model and authoritative license offers are approved."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {pricingAreas.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <p className="text-sm font-medium text-muted-foreground">{item.title}</p>
                <CardTitle>{item.heading}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <CtaBand
        title="Have a pricing question?"
        description="Tell us whether you are asking about buyer access, an artist plan, a license, or a larger team."
        actions={<Button asChild><Link href="/contact">Ask about pricing</Link></Button>}
      />
    </main>
  );
}
