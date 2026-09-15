"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckCircle2, ChevronRight, Circle, CircleDot, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDuration } from "@/lib/utils";
import { getArtistDashboardStatus, getInitialDashboardTrack, type ArtistDashboardTrack, type ArtistDashboardSummary } from "@/lib/artist-dashboard";

const steps = ["Draft", "In review", "Live"];
const nextSteps = [
  ["Submit", "Send your track with all the details and supporting materials."],
  ["Review", "Our team reviews your submission and may follow up if needed."],
  ["Live", "Once approved, eligible tracks appear in the buyer catalog."]
];

export function ArtistDashboard({ tracks, summary }: { tracks: ArtistDashboardTrack[]; summary: ArtistDashboardSummary }) {
  const [selectedId, setSelectedId] = useState(() => getInitialDashboardTrack(tracks)?.id);
  const active = tracks.find(track => track.id === selectedId) ?? getInitialDashboardTrack(tracks);
  const state = active ? getArtistDashboardStatus(active.status) : null;
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Artist dashboard</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[44px] xl:leading-tight">Your next release starts here.</h1>
        <p className="text-base text-muted-foreground">Continue a draft or check where your music stands.</p>
        <Button asChild className="min-h-11"><Link href="/artist/submit">Submit music<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></Button>
      </header>

      <section aria-label="Account catalog overview" className="space-y-3">
        <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[["Total tracks", summary.total], ["Drafts", summary.drafts], ["In review", summary.inReview], ["Live", summary.live]].map(([label, count]) => <div key={label} className="rounded-lg border border-border bg-card p-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{count}</dd></div>)}
        </dl>
        {summary.rejected || summary.archived ? <p className="text-sm text-muted-foreground">Also in your catalog: {summary.rejected} rejected · {summary.archived} archived.</p> : null}
      </section>

      {active && state ? (
        <section aria-label="Selected submission" className="grid overflow-hidden rounded-lg border border-border bg-card xl:grid-cols-[1.65fr,1fr]">
          <div className="min-w-0 p-5 sm:p-7">
            <ol aria-label="Submission progress" className="grid grid-cols-3 gap-2">
              {steps.map((step, index) => {
                const Icon = state.stage === index ? CircleDot : state.stage > index ? CheckCircle2 : Circle;
                return <li key={step} aria-current={state.stage === index ? "step" : undefined} className={cn("flex flex-col items-center gap-2 text-sm text-muted-foreground", state.stage >= index && "text-foreground")}>
                  <Icon aria-hidden="true" className={cn("h-8 w-8", state.stage >= index && "text-accent")} />
                  <span>{step}</span>
                </li>;
              })}
            </ol>
            <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">{state.stage < 0 ? "This submission is outside the active submission journey." : "Submitting sends your track for review. Approval is a separate step."}</p>
            <div className="mt-7 flex flex-col gap-5 sm:flex-row" aria-live="polite" aria-atomic="true">
              <Cover track={active} className="h-32 w-32 sm:h-36 sm:w-36" />
              <div className="min-w-0 flex-1 space-y-3">
                <h2 className="break-words text-2xl font-semibold tracking-tight">{active.title}</h2>
                <StatusBadge status={active.status} />
                <p className="text-sm leading-6 text-muted-foreground">{state.description}</p>
                <Button asChild className="min-h-11 w-full sm:w-auto">
                  <Link href={`/artist/tracks/${active.slug}`}>{state.action}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
                </Button>
              </div>
            </div>
          </div>
          <aside className="border-t border-border bg-muted/25 p-5 sm:p-7 xl:border-l xl:border-t-0">
            <h2 className="text-lg font-semibold">What happens next</h2>
            <ol className="mt-7 space-y-7">
              {nextSteps.map(([title, description], index) => <li key={title} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-sm" aria-hidden="true">{index + 1}</span>
                <div><h3 className="font-medium">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>
              </li>)}
            </ol>
          </aside>
        </section>
      ) : (
        <section className="flex flex-col items-start gap-4 rounded-lg border border-border bg-card p-6 sm:p-10">
          <Music2 aria-hidden="true" className="h-10 w-10 text-accent" />
          <h2 className="text-2xl font-semibold">Your first track starts here.</h2>
          <p className="text-muted-foreground">Save a draft, add the details, then submit it for review.</p>
          <Button asChild className="min-h-11"><Link href="/artist/submit">Create a draft<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></Button>
        </section>
      )}

      {tracks.length ? <section aria-labelledby="recent-submissions-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="recent-submissions-title" className="text-xl font-semibold">Your recent submissions</h2>
          <Link href="/artist/catalog" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium underline-offset-4 hover:underline">View all in My catalog<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </div>
        <ul className="space-y-3">
          {tracks.map(track => <li key={track.id}>
            <button type="button" aria-pressed={active?.id === track.id} onClick={() => setSelectedId(track.id)} className={cn("flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:gap-4 sm:p-4", active?.id === track.id && "border-accent/60")}>
              <Cover track={track} className="h-14 w-14 sm:h-16 sm:w-16" decorative />
              <span className="min-w-0 flex-1"><span className="block break-words font-medium">{track.title}</span><span className="mt-1 block text-sm text-muted-foreground">{track.duration > 0 ? formatDuration(Math.floor(track.duration)) : "Duration unavailable"}</span></span>
              <StatusBadge status={track.status} />
              <ChevronRight aria-hidden="true" className="hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />
            </button>
          </li>)}
        </ul>
      </section> : null}
      <div className="flex flex-wrap gap-3 border-t border-border pt-5">
        {tracks.length ? <Button asChild variant="outline" className="min-h-11"><Link href="/artist/submit">Submit music<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></Button> : null}
        <Link href="/artist/rights-holders" className="inline-flex min-h-11 items-center px-3 text-sm underline-offset-4 hover:underline">Manage rights holders</Link>
        <Link href="/artist/payout-settings" className="inline-flex min-h-11 items-center px-3 text-sm underline-offset-4 hover:underline">Payout settings</Link>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={cn("inline-flex shrink-0 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium", status === "pending_review" && "border-accent/40 text-foreground", status === "approved" && "border-accent/40 text-accent", status === "rejected" && "border-destructive/40 text-foreground")}>{getArtistDashboardStatus(status).label}</span>;
}

function Cover({ track, className, decorative = false }: { track: ArtistDashboardTrack; className: string; decorative?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <div className={cn("relative shrink-0 overflow-hidden rounded-md bg-muted", className)}>
    {track.coverUrl && failedUrl !== track.coverUrl ? <Image src={track.coverUrl} alt={decorative ? "" : `${track.title} cover art`} fill sizes="144px" className="object-cover" onError={() => setFailedUrl(track.coverUrl)} /> : <div className="flex h-full items-center justify-center"><Music2 aria-hidden="true" className="h-8 w-8 text-muted-foreground" /><span className="sr-only">{decorative ? "" : "No cover art available"}</span></div>}
  </div>;
}
