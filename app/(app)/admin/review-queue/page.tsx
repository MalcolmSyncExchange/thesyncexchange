import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { RetryTrackSubmissions } from "@/components/admin/retry-track-submissions";
import { ReviewQueuePosition } from "@/components/admin/review-queue-position";
import { ReviewQueueCard } from "@/components/admin/review-queue-card";
import { AdminCatalogReviewQueue, ReviewQueueNavigation } from "@/components/admin/review-queue-navigation";
import { TrackQueueDecisionFeedback } from "@/components/admin/track-review-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { catalogQueueContext, type CatalogQueueContext } from "@/lib/admin/review-queue-navigation";
import { getAdminReviewQueueResult } from "@/services/admin/queries";

export default async function ReviewQueuePage({
  searchParams
}: {
  searchParams: Promise<{ view?: string; status?: string; page?: string }>;
}) {
  const { view, status, page } = await searchParams;
  const active = view === "catalog" ? "catalog" : "track";
  return (
    <div className="mx-auto grid w-full min-w-0 max-w-[1400px] grid-cols-1 gap-3 sm:gap-4">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 id="review-queue-heading" tabIndex={-1} className="rounded-sm text-2xl font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-3xl">Review Queue</h1>
        <ReviewQueueNavigation active={active} />
      </header>
      {active === "catalog" ? <AdminCatalogReviewQueue /> : <TrackSubmissions context={catalogQueueContext(status, page)} />}
    </div>
  );
}

async function TrackSubmissions({ context }: { context: CatalogQueueContext }) {
  const result = await getAdminReviewQueueResult();
  if (result.status === "unavailable") {
    return (
      <Card className="min-w-0">
        <ReviewQueuePosition canCheckRecord={false} />
        <CardHeader className="p-4">
          <div className="flex items-start gap-3" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <div className="min-w-0">
              <CardTitle>Track submissions unavailable</CardTitle>
              <CardDescription className="mt-1">Track submissions could not be loaded. Try again to check the queue.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <RetryTrackSubmissions />
        </CardContent>
      </Card>
    );
  }

  const tracks = result.items;
  const flaggedCount = tracks.filter((track) => track.open_flag_count > 0).length;
  const splitGapCount = tracks.filter((track) => Math.round(track.rights_split_total * 100) !== 10_000).length;
  const verificationGapCount = tracks.filter((track) => track.verification_status !== "verified").length;

  return (
    <section aria-labelledby="pending-submissions-heading" className="min-w-0 space-y-2.5 sm:space-y-3">
      <ReviewQueuePosition />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="pending-submissions-heading" className="text-base font-semibold">Pending submissions</h2>
          <Badge variant="secondary">{tracks.length} awaiting review</Badge>
        </div>
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Submission summary">
          <QueueSummaryItem label="Flagged" value={flaggedCount} />
          <QueueSummaryItem label="Ownership gaps" value={splitGapCount} />
          <QueueSummaryItem label="Verification gaps" value={verificationGapCount} />
        </dl>
      </div>
      <TrackQueueDecisionFeedback>
        {tracks.length ? (
          tracks.map((track) => <ReviewQueueCard key={track.id} track={track} reviewQueueContext={context} />)
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
            <p className="font-semibold text-foreground">The submission queue is clear.</p>
            <p className="mt-1 text-sm text-muted-foreground">Tracks appear here after an artist submits them for track review.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" className="min-h-11 sm:min-h-10"><Link href="/admin/compliance">Review Compliance</Link></Button>
              <Button asChild variant="ghost" className="min-h-11 sm:min-h-10"><Link href="/admin/dashboard">Back to Dashboard</Link></Button>
            </div>
          </div>
        )}
      </TrackQueueDecisionFeedback>
      {tracks.length > 0 && <div className="flex flex-wrap gap-2">
        <Button asChild variant="ghost"><Link href="/admin/compliance">Open Compliance</Link></Button>
        <Button asChild variant="ghost">
          <Link href="/admin/tracks">Open All Tracks <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </Button>
      </div>}
      {!tracks.length && <Button asChild variant="ghost" className="min-h-11 sm:min-h-10">
        <Link href="/admin/tracks">Open All Tracks <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </Button>}
    </section>
  );
}

function QueueSummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="order-2">{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
