import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShieldCheck, SlidersHorizontal, Zap } from "lucide-react";

import { CtaBand } from "@/components/marketing/cta-band";
import { SectionHeader } from "@/components/marketing/section-header";
import { StatStrip } from "@/components/marketing/stat-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { tracks } from "@/lib/demo-data";
import { formatCurrency } from "@/lib/utils";

const featuredTracks = tracks.slice(0, 3);

const trustSignals = [
  { value: "20+", label: "Curated demo tracks spanning cinematic, indie, pop, and electronic briefs" },
  { value: "5", label: "Artist profiles with rights-aware onboarding and structured metadata" },
  { value: "<48h", label: "Target review cadence for catalog submissions entering moderation" },
  { value: "4", label: "License pathways covering campaign, promo, broadcast, and exclusive use" }
];

const platformBenefits = [
  {
    icon: Zap,
    title: "Submission to buyer-ready faster",
    description: "Artists deliver tracks with rights holders, splits, and licensing details in one controlled workflow."
  },
  {
    icon: ShieldCheck,
    title: "Buyer confidence built into the listing",
    description: "Approved tracks surface license options, metadata, and fulfillment context without sending teams into a side-channel chase."
  },
  {
    icon: SlidersHorizontal,
    title: "Operations that stay legible under pressure",
    description: "Admin review, compliance, and order state all move through a single system instead of scattered follow-up."
  }
];

export function Homepage() {
  return (
    <main className="bg-background">
      <section className="border-b border-border bg-gradient-to-b from-muted/40 via-background to-background">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:px-8 lg:py-20">
          <div className="flex max-w-3xl flex-col justify-center">
            <Badge variant="outline" className="w-fit">
              Premium sync licensing marketplace
            </Badge>
            <div className="mt-6 space-y-5">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Music licensing built for speed, trust, and clean execution.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                The Sync Exchange helps artists deliver licensable music with complete rights context and gives buyers a polished catalog where pricing,
                metadata, and fulfillment are clear enough to move quickly.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">Log in</Link>
              </Button>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-card/80 p-4">
                <p className="text-sm font-medium text-foreground">For artists</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Submit tracks with splits, metadata, licensing preferences, and a presentation strong enough for real review.
                </p>
              </div>
              <div className="rounded-md border border-border bg-card/80 p-4">
                <p className="text-sm font-medium text-foreground">For buyers</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Search approved material, compare license pathways, and purchase with a clear operational record.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:pl-6">
            <div className="relative min-h-[360px] overflow-hidden rounded-lg border border-border bg-card">
              <Image
                src="https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1400&q=80"
                alt="Studio microphone in a premium recording environment"
                fill
                priority
                sizes="(min-width: 1024px) 42vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="rounded-md border border-white/15 bg-black/35 p-4 text-white backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/70">Catalog preview</p>
                  <p className="mt-2 text-lg font-semibold">Curated discovery with visible licensing context</p>
                  <p className="mt-2 text-sm leading-6 text-white/80">
                    Premium tracks, cleaner metadata, and a confirmation flow that keeps the commercial record attached to payment.
                  </p>
                </div>
              </div>
            </div>

            <Card className="bg-card/80">
              <CardContent className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Live listing style</p>
                    <h2 className="text-xl font-semibold">Buyer-facing clarity</h2>
                  </div>
                  <Badge>Trusted clearance</Badge>
                </div>
                <div className="space-y-3">
                  {featuredTracks.map((track) => (
                    <div key={track.id} className="flex items-center justify-between gap-4 rounded-md border border-border bg-background/80 p-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{track.title}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {track.artist_name} • {track.genre} • {track.bpm} BPM
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-medium">{formatCurrency(track.license_options[0]?.price_override || 0)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatStrip items={trustSignals} />
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Platform benefits"
          title="A marketplace that reads like a professional system from the first click."
          description="The product needs to feel credible to artists, supervisors, brands, agencies, and the operations team behind the catalog."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {platformBenefits.map((benefit) => (
            <Card key={benefit.title}>
              <CardContent className="p-6">
                <benefit.icon className="h-8 w-8 text-primary" />
                <h3 className="mt-5 text-xl font-semibold">{benefit.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{benefit.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-muted/35">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit">
              How it works
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight">From upload to license delivery without the usual drag.</h2>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              Artists submit ready-to-clear material. Admins review quality, ownership, and compliance. Buyers discover approved tracks and move through a
              checkout flow that keeps the order record, payment state, and agreement delivery in sync.
            </p>
          </div>
          <div className="grid gap-4">
            {[
              "Artists submit tracks with splits, metadata, and licensing preferences.",
              "Admin review ensures only approved, commercially usable material reaches the buyer catalog.",
              "Buyers shortlist, compare license options, purchase through Stripe, and access agreements from their order history."
            ].map((item, index) => (
              <div key={item} className="flex items-start gap-4 rounded-lg border border-border bg-background p-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-sm font-semibold">
                  {index + 1}
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Bring premium catalog supply and faster licensing into the same system."
        description="Start with artist intake, buyer discovery, or a direct conversation about enterprise licensing workflows."
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
