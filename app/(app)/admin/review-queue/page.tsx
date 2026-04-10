import type { ReactNode } from "react";

import Link from "next/link";
import { ArrowRight, ShieldAlert, SlidersHorizontal, UserCheck } from "lucide-react";

import { ReviewQueueCard } from "@/components/admin/review-queue-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminReviewQueue } from "@/services/admin/queries";

export default async function ReviewQueuePage() {
  const tracks = await getAdminReviewQueue();
  const flaggedCount = tracks.filter((track) => track.open_flag_count > 0).length;
  const splitGapCount = tracks.filter((track) => Math.round(track.rights_split_total) !== 100).length;
  const verificationGapCount = tracks.filter((track) => track.verification_status !== "verified").length;

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card/80 p-6 shadow-panel">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge variant="outline" className="border-accent/20 bg-accent/10 text-accent">
              Submission moderation
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Review the queue before tracks reach buyers.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Every submission here is still waiting on an approval decision. Use rights coverage, flag history, and
              profile verification signals to decide what can move forward and what needs follow-up first.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/admin/compliance">
                Open compliance
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/tracks">
                Open all tracks
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <QueueSummaryCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Flagged submissions"
          value={String(flaggedCount)}
          detail={flaggedCount ? "Tracks with open compliance issues are grouped first." : "No pending submissions currently carry open flags."}
        />
        <QueueSummaryCard
          icon={<SlidersHorizontal className="h-4 w-4" />}
          label="Split coverage gaps"
          value={String(splitGapCount)}
          detail={splitGapCount ? "Ownership totals should be resolved before approval." : "All pending submissions currently declare full ownership splits."}
        />
        <QueueSummaryCard
          icon={<UserCheck className="h-4 w-4" />}
          label="Verification gaps"
          value={String(verificationGapCount)}
          detail={
            verificationGapCount
              ? "Some artist profiles still need verification follow-up alongside the track review."
              : "All pending submissions come from verified artists."
          }
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Pending submissions</CardTitle>
            <CardDescription>
              Ordered by moderation risk so tracks with compliance pressure and incomplete rights data rise first.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{tracks.length} awaiting review</Badge>
            <Badge variant="outline">{flaggedCount} with active flags</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {tracks.length ? (
            tracks.map((track) => <ReviewQueueCard key={track.id} track={track} />)
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8">
              <p className="text-base font-semibold text-foreground">The submission queue is clear.</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                New artist submissions will appear here the moment they are published for review. Until then, the admin
                team can focus on compliance follow-up, featured curation, and order fulfillment.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href="/admin/compliance">Review compliance</Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/admin/dashboard">Back to dashboard</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QueueSummaryCard({
  icon,
  label,
  value,
  detail
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="mt-4 text-3xl font-semibold text-foreground">{value}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
