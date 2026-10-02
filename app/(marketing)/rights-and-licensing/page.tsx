import Link from "next/link";

import { FeatureGrid } from "@/components/marketing/feature-grid";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeader } from "@/components/marketing/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function RightsAndLicensingPage() {
  return (
    <main>
      <PageHero
        eyebrow="Rights & licensing"
        title="“Clear it” means understand the offer."
        description="Review the rights information, availability, and terms tied to the offered license. It does not mean The Sync Exchange guarantees every right."
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader eyebrow="Two rights layers" title="The recording and the song are separate." description="A track may involve different people and organizations at each layer." />
        <div className="mt-10"><FeatureGrid columns="two" items={[
          { title: "The recording", description: "The recording is the specific audio performance, often called the master. Its ownership and control are handled separately from the song." },
          { title: "The song", description: "The composition is the song itself, including publishing rights. Owning the recording does not always mean you control the song." }
        ]} /></div>
      </section>
      <section className="border-y border-border bg-card/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <FeatureGrid items={[
            { title: "Different music needs different details.", description: "Original songs, covers, public-domain claims, arrangements, samples, interpolations, and third-party beats follow different paths. Artists can save a draft instead of guessing." },
            { title: "Review has limits.", description: "Artists and rightsholders provide information and make representations. Platform review is not a blanket guarantee of ownership or legal clearance." },
            { title: "The offered terms control the license.", description: "Artists choose from supported prices. The Sync Exchange controls the license terms that explain permitted use, limits, and restrictions." }
          ]} />
          <Card className="mt-8"><CardContent className="p-6 text-sm leading-7 text-muted-foreground"><strong className="text-foreground">Purchase-time terms matter.</strong> The intended record keeps the version of the terms that applied when a license was bought. Final authoritative legal terms and version binding remain required before unrestricted live purchasing.</CardContent></Card>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild><Link href="/faq">Read rights questions</Link></Button>
            <Button asChild variant="outline"><Link href="/contact">Report a rights issue</Link></Button>
          </div>
        </div>
      </section>
    </main>
  );
}
