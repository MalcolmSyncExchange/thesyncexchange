import type { ReactNode } from "react";

import Link from "next/link";
import { AlertTriangle, ArrowRight, ShieldAlert, SlidersHorizontal, UserCheck } from "lucide-react";

import { RetryTrackSubmissions } from "@/components/admin/retry-track-submissions";
import { ReviewQueuePosition } from "@/components/admin/review-queue-position";
import { ReviewQueueCard } from "@/components/admin/review-queue-card";
import { AdminCatalogReviewQueue, ReviewQueueNavigation } from "@/components/admin/review-queue-navigation";
import { TrackQueueDecisionFeedback } from "@/components/admin/track-review-actions";
import styles from "@/components/admin-v2/operations.module.css";
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
    <div className={`${styles.page} mx-auto w-full max-w-[1400px] grid-cols-1`}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.kicker}>Admin Operations</p>
          <h1 id="review-queue-heading" tabIndex={-1}>Review Queue</h1>
          <p>Review incoming track submissions and submitted catalog metadata.</p>
        </div>
      </header>
      <ReviewQueueNavigation active={active} />
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
        <CardHeader>
          <div className="flex items-start gap-3" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <div className="min-w-0">
              <CardTitle>Track submissions unavailable</CardTitle>
              <CardDescription className="mt-1">Track submissions could not be loaded. Try again to check the queue.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
    <div className="space-y-4">
      <ReviewQueuePosition />
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <QueueSummaryCard icon={<ShieldAlert className="h-4 w-4" />} label="Flagged submissions" value={flaggedCount} />
        <QueueSummaryCard icon={<SlidersHorizontal className="h-4 w-4" />} label="Ownership gaps" value={splitGapCount} />
        <QueueSummaryCard icon={<UserCheck className="h-4 w-4" />} label="Verification gaps" value={verificationGapCount} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div>
            <CardTitle>Pending submissions</CardTitle>
            <CardDescription>
              Review ownership, open flags, and artist verification.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{tracks.length} awaiting review</Badge>
            <Badge variant="outline">{flaggedCount} with active flags</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-4 sm:px-6">
          <TrackQueueDecisionFeedback>
            {tracks.length ? (
              tracks.map((track) => <ReviewQueueCard key={track.id} track={track} reviewQueueContext={context} />)
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-5 sm:p-8">
                <p className="text-base font-semibold text-foreground">The submission queue is clear.</p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Tracks will appear here when artists submit them for track review.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button asChild variant="outline">
                    <Link href="/admin/compliance">Review Compliance</Link>
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href="/admin/dashboard">Back to Dashboard</Link>
                  </Button>
                </div>
              </div>
            )}
          </TrackQueueDecisionFeedback>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="ghost"><Link href="/admin/compliance">Open Compliance</Link></Button>
        <Button asChild variant="ghost">
          <Link href="/admin/tracks">Open All Tracks <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </Button>
      </div>
    </div>
  );
}

function QueueSummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <Card className="min-w-0">
      <CardContent className="flex min-w-0 flex-col gap-1 p-2.5 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
        <span aria-hidden="true" className="hidden text-muted-foreground sm:block">{icon}</span>
        <span className="text-lg font-semibold leading-tight">{value}</span>
        <span className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere] sm:text-sm">{label}</span>
      </CardContent>
    </Card>
  );
}
