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
        eyebrow="For Buyers"
        title="Find tracks that are creatively strong and operationally clear."
        description="The buyer experience is tuned for supervisors, agencies, and producers who need fast, high-trust decision support."
        actions={
          <Button asChild>
            <Link href="/signup/buyer">Create Buyer Account</Link>
          </Button>
        }
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Buyer value"
          title="Search and licensing built for teams under deadline."
          description="The product surfaces the signals that matter early so buyers can compare creative fit and operational readiness at the same time."
        />
        <div className="mt-12">
          <FeatureGrid
            columns="two"
            items={[
              { title: "Premium discovery", description: "Search by genre, mood, tempo, vocal profile, explicitness, and license posture." },
              { title: "Rights confidence", description: "Track detail pages surface available license types and contributor context up front." },
              { title: "Fast purchasing", description: "Stripe-backed checkout, order lifecycle tracking, and agreement delivery keep the licensing flow operational." },
              { title: "Institutional polish", description: "Dashboards, saved tracks, and order history support repeat buyers and internal stakeholders." }
            ]}
          />
        </div>
      </section>
      <CtaBand
        title="Move from search to shortlist to license with less friction."
        description="The marketplace is positioned for music supervisors, agencies, brands, and screen teams that value speed with clarity."
        actions={
          <Button asChild>
            <Link href="/signup/buyer">Start as a Buyer</Link>
          </Button>
        }
      />
    </main>
  );
}
