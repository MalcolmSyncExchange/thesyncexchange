import Link from "next/link";
import { ShieldCheck, Sparkles, Zap } from "lucide-react";

import { CtaBand } from "@/components/marketing/cta-band";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeader } from "@/components/marketing/section-header";
import { Button } from "@/components/ui/button";

export default function HowItWorksPage() {
  return (
    <main>
      <PageHero
        eyebrow="How It Works"
        title="A cleaner path from submission to signed license."
        description="Each side of the marketplace gets a focused workflow built for real sync operations."
        actions={
          <>
            <Button asChild>
              <Link href="/for-artists">For Artists</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/for-buyers">For Buyers</Link>
            </Button>
          </>
        }
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Three stages"
          title="The marketplace is designed to reduce friction before it reaches a deal desk."
          description="Submission discipline, review controls, and buyer clarity work together so quality and licensing readiness move in the same direction."
        />
        <div className="mt-12">
          <FeatureGrid
            items={[
              { icon: Zap, title: "1. Artist intake", description: "Artists submit catalog-ready music with rights splits, pricing, and media assets." },
              { icon: ShieldCheck, title: "2. Review and verification", description: "Admins manage approvals, resolve compliance flags, and maintain catalog quality." },
              { icon: Sparkles, title: "3. Buyer discovery and checkout", description: "Buyers search by creative need, compare license types, and move into checkout with speed." }
            ]}
          />
        </div>
      </section>
      <CtaBand
        title="Built for faster decisions when creative and clearance both matter."
        description="The workflow is intentionally structured so music teams, producers, and agencies can move with more confidence."
        actions={
          <Button asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        }
      />
    </main>
  );
}
