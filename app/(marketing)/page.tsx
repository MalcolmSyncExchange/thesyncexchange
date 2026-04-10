import Image from "next/image";
import Link from "next/link";
import { Headphones, ShieldCheck, Sparkles, Zap } from "lucide-react";

import { CtaBand } from "@/components/marketing/cta-band";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeader } from "@/components/marketing/section-header";
import { StatStrip } from "@/components/marketing/stat-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { tracks } from "@/lib/demo-data";
import { formatCurrency } from "@/lib/utils";

const featuredTracks = tracks.slice(0, 3);
const workflowSteps = [
  {
    icon: Zap,
    title: "Artists submit ready-to-clear tracks",
    description: "Metadata, rights holders, splits, and pricing are collected in one workflow."
  },
  {
    icon: ShieldCheck,
    title: "Admins review quality and compliance",
    description: "Submissions move through approval, verification, and issue resolution before going live."
  },
  {
    icon: Sparkles,
    title: "Buyers search and license with confidence",
    description: "Track pages expose usage options, price ranges, and agreement placeholders for quick decision-making."
  }
];

const trustSignals = [
  { value: "20+", label: "Curated demo tracks across cinematic, pop, indie, and electronic use cases" },
  { value: "5", label: "Artist profiles with rights-aware submission structure" },
  { value: "<48h", label: "Target review cadence for premium catalog intake" },
  { value: "4", label: "License pathways spanning campaign, broadcast, promo, and exclusive use" }
];

export default function HomePage() {
  return (
    <main>
      <PageHero
        eyebrow="Premium sync licensing marketplace"
        title="Music licensing built for speed, trust, and clean execution."
        description="The Sync Exchange helps artists deliver fully licensable music and gives buyers a polished catalog with visible rights, clear pricing, and faster clearance."
        actions={
          <>
            <Button asChild size="lg">
              <Link href="/signup/artist">Start as an Artist</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/signup/buyer">Start as a Buyer</Link>
            </Button>
          </>
        }
        aside={
          <div className="space-y-5">
            <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-border">
              <Image
                src="https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1400&q=80"
                alt="Studio session"
                fill
                className="object-cover"
                priority
              />
            </div>
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Catalog preview</p>
                  <h2 className="text-xl font-semibold">Curated discovery</h2>
                </div>
                <Badge>Trusted clearance</Badge>
              </div>
              <div className="space-y-3">
                {featuredTracks.map((track) => (
                  <div key={track.id} className="flex items-center justify-between rounded-md border border-border p-3">
                    <div>
                      <p className="font-medium">{track.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {track.artist_name} • {track.genre} • {track.bpm} BPM
                      </p>
                    </div>
                    <p className="text-sm font-medium">{formatCurrency(track.license_options[0]?.price_override || 0)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
      />

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatStrip items={trustSignals} />
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="How it works"
          title="From artist delivery to licensed placement without the usual drag."
          description="The platform keeps submissions structured, rights visible, and purchasing clear enough for real production workflows."
        />
        <div className="mt-12">
          <FeatureGrid items={workflowSteps} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Why teams use it"
          title="Built to feel credible on both sides of the licensing table."
          description="Artists need a submission environment that respects the value of their work. Buyers need a catalog that reduces uncertainty instead of adding it."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <Headphones className="h-8 w-8 text-primary" />
              <h3 className="mt-5 text-xl font-semibold">For artists</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Deliver tracks with complete metadata, visible splits, and a presentation strong enough for real supervisor review.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <ShieldCheck className="h-8 w-8 text-primary" />
              <h3 className="mt-5 text-xl font-semibold">For buyers</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Search premium material, compare license pathways quickly, and move forward with cleaner operational context.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <CtaBand
        title="Bring premium catalog supply and faster licensing into the same system."
        description="Start with artist intake, buyer discovery, or an enterprise licensing conversation."
        actions={
          <>
            <Button asChild>
              <Link href="/signup/artist">Create an artist account</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/signup/buyer">Create a buyer account</Link>
            </Button>
          </>
        }
      />
    </main>
  );
}
