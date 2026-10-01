import Link from "next/link";

import { FeatureGrid } from "@/components/marketing/feature-grid";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeader } from "@/components/marketing/section-header";
import { Button } from "@/components/ui/button";

const buyerSteps = [
  ["1. Find it.", "Open Discover, then use the authorized buyer catalog to search and preview music."],
  ["2. Keep a shortlist.", "Create an account or log in when you want to save favorites."],
  ["3. Clear it.", "Review the rights information, availability, price, scope, and terms for the offered license."],
  ["4. License it.", "Enter the buyer and payment details needed for the purchase."],
  ["5. Keep the record.", "After payment and fulfillment, find the purchase-time license in your workspace."]
];

const artistSteps = [
  ["1. Create your workspace.", "Start with your artist identity. Team tools appear only when you need them."],
  ["2. Build your profile.", "Add the public information you want buyers to see."],
  ["3. Prepare a track.", "Add the music, details, recording rights, and composition rights. Save and exit anytime."],
  ["4. Set license options.", "Choose supported prices. Platform terms stay separate."],
  ["5. Submit for review.", "Required rights issues stay Needs Attention. Review is not a blanket legal guarantee."],
  ["6. Become ready to sell.", "The track must meet the review, legal, payee, and payout requirements that apply."]
];

export default function HowItWorksPage() {
  return (
    <main>
      <PageHero
        eyebrow="How it works"
        title="A clear path for buyers and artists."
        description="Choose your path. You will see each detail when you need it."
        actions={
          <>
            <Button asChild><Link href="#buyers">I’m finding music</Link></Button>
            <Button asChild variant="outline"><Link href="#artists">I’m listing music</Link></Button>
          </>
        }
      />
      <section id="buyers" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader eyebrow="Buyer path" title="Find, review, and license." description="Start with music. Add account and payment details only when the next step needs them." />
        <div className="mt-12"><FeatureGrid columns="two" items={buyerSteps.map(([title, description]) => ({ title, description }))} /></div>
        <Button asChild className="mt-8"><Link href="/discover">Find music</Link></Button>
      </section>
      <section id="artists" className="border-t border-border bg-card/30">
        <div className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="Artist path" title="Prepare your catalog without guessing." description="Required track steps guide the work. Save an incomplete submission and return when you are ready." />
          <div className="mt-12"><FeatureGrid columns="two" items={artistSteps.map(([title, description]) => ({ title, description }))} /></div>
          <Button asChild className="mt-8"><Link href="/signup/artist">Start your workspace</Link></Button>
        </div>
      </section>
    </main>
  );
}
