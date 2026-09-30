"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckCircle2, ChevronRight, Circle, CircleDot, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDuration } from "@/lib/utils";
import { getArtistDashboardStatus, getInitialDashboardTrack, type ArtistDashboardTrack, type ArtistDashboardSummary } from "@/lib/artist-dashboard";

import styles from "./artist-dashboard.module.css";

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
    <div className={styles.dashboard}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Artist dashboard</p>
        <h1 className={styles.title}>Your next release starts here.</h1>
        <p className={styles.subtitle}>Continue a draft or check where your music stands.</p>
      </header>

      <section aria-label="Account catalog overview" className="space-y-3">
        <dl className={styles.summary}>
          {[["Total tracks", summary.total], ["Drafts", summary.drafts], ["In review", summary.inReview], ["Live", summary.live]].map(([label, count]) => <div key={label} className={styles.stat}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{count}</dd></div>)}
        </dl>
        {summary.rejected || summary.archived ? <p className="text-sm text-muted-foreground">Also in your catalog: {summary.rejected} rejected · {summary.archived} archived.</p> : null}
      </section>

      {active && state ? (
        <section aria-label="Selected submission" className={styles.journey}>
          <div className={styles.progress}>
            <ol aria-label="Submission progress" className={styles.stages}>
              {steps.map((step, index) => {
                const Icon = state.stage === index ? CircleDot : state.stage > index ? CheckCircle2 : Circle;
                return <li key={step} aria-current={state.stage === index ? "step" : undefined} className={cn(styles.stage, state.stage >= index && styles.reached)}>
                  <Icon aria-hidden="true" className="h-9 w-9" />
                  <span>{step}</span>
                </li>;
              })}
            </ol>
            <p className={styles.stageNote}>{state.stage < 0 ? "This submission is outside the active submission journey." : "Submitting sends your track for review. Approval is a separate step."}</p>
            <div className={styles.trackFeature} aria-live="polite" aria-atomic="true">
              <Cover track={active} className={styles.featureCover} />
              <div className={styles.trackDetails}>
                <h2 className={styles.trackTitle}>{active.title}</h2>
                <StatusBadge status={active.status} />
                <p className={styles.description}>{state.description}</p>
                <Button asChild className={styles.primary}>
                  <Link href={`/artist/tracks/${active.slug}`}>{state.action}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
                </Button>
              </div>
            </div>
          </div>
          <aside className={styles.next}>
            <h2 className={styles.nextTitle}>What happens next</h2>
            <ol className={styles.nextList}>
              {nextSteps.map(([title, description], index) => <li key={title} className={styles.nextStep}>
                <span className={styles.number} aria-hidden="true">{index + 1}</span>
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

      {tracks.length ? <section aria-labelledby="recent-submissions-title" className={styles.submissions}>
        <div className={styles.sectionHeading}>
          <h2 id="recent-submissions-title" className="text-xl font-semibold">Your recent submissions</h2>
          <Link href="/artist/catalog" className={styles.catalogLink}>View all in My catalog<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </div>
        <ul className={styles.trackList}>
          {tracks.map(track => <li key={track.id}>
            <button type="button" aria-pressed={active?.id === track.id} onClick={() => setSelectedId(track.id)} className={cn(styles.trackRow, active?.id === track.id && styles.selected)}>
              <Cover track={track} className={styles.rowCover} decorative />
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
  return <span className={cn(styles.badge, styles[status])}>{getArtistDashboardStatus(status).label}</span>;
}

function Cover({ track, className, decorative = false }: { track: ArtistDashboardTrack; className: string; decorative?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <div className={cn("relative shrink-0 overflow-hidden rounded-md bg-muted", className)}>
    {track.coverUrl && failedUrl !== track.coverUrl ? <Image src={track.coverUrl} alt={decorative ? "" : `${track.title} cover art`} fill sizes="144px" className="object-cover" onError={() => setFailedUrl(track.coverUrl)} /> : <div className="flex h-full items-center justify-center"><Music2 aria-hidden="true" className="h-8 w-8 text-muted-foreground" /><span className="sr-only">{decorative ? "" : "No cover art available"}</span></div>}
  </div>;
}
