import type { ReactNode } from "react";

import Image from "next/image";
import Link from "next/link";
import { AlertCircle, ArrowRight, FileAudio2, FileText, ShieldCheck } from "lucide-react";

import { ReviewQueueRecordLink } from "@/components/admin/review-queue-position";
import { Button } from "@/components/ui/button";
import { TrackQueueReviewBand } from "@/components/admin/track-review-actions";
import { CheckedTrackReviewActions } from "@/components/admin/checked-track-review-actions";
import { FlagSeverityBadge, TrackStatusBadge, VerificationStatusBadge } from "@/components/shared/state-badges";
import { Badge } from "@/components/ui/badge";
import { trackReviewHref, type CatalogQueueContext } from "@/lib/admin/review-queue-navigation";
import { cn, formatDateTime, formatDuration } from "@/lib/utils";
import queueStyles from "./review-queue-table.module.css";
import type { AdminFlagSeverity, TrackStatus, VerificationStatus } from "@/types/models";

export interface ReviewQueueTrackCardData {
  id: string;
  title: string;
  artist_name: string;
  genre: string;
  subgenre: string;
  mood: string[];
  bpm: number;
  duration_seconds: number;
  explicit: boolean;
  status: TrackStatus;
  featured?: boolean;
  created_at: string;
  cover_art_url?: string | null;
  rights_holder_count: number;
  rights_split_total: number;
  open_flag_count: number;
  review_note_count: number;
  highest_flag_severity: AdminFlagSeverity | null;
  verification_status: VerificationStatus;
  open_flag_types: string[];
}

export function ReviewQueueCard({
  track,
  compact = false,
  reviewQueueContext
}: {
  track: ReviewQueueTrackCardData;
  compact?: boolean;
  reviewQueueContext?: CatalogQueueContext;
}) {
  const detailHref = reviewQueueContext ? trackReviewHref(track.id, reviewQueueContext) : `/admin/tracks/${track.id}`;
  const hasFlags = track.open_flag_count > 0;
  const metadataBadges = [
    track.genre,
    track.subgenre,
    track.bpm==null?'Tempo unspecified':`${track.bpm} BPM`,
    formatDuration(track.duration_seconds),
    track.explicit ? "Explicit" : "Clean"
  ];

  const ownershipTotal = Math.round(track.rights_split_total * 100) / 100;
  const ownershipBlocked = ownershipTotal !== 100;
  const recordLabel = `Open record for ${track.title}`;

  return (
    <article className={cn(queueStyles.row, "grid min-w-0 gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 lg:gap-2")}>
      <div className={cn(queueStyles.identityBand, "grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_fit-content(50%)] sm:items-center sm:gap-x-4")}>
        <div className={cn(queueStyles.record, "flex min-w-0 items-start gap-3")}>
          <Artwork coverArtUrl={track.cover_art_url} title={track.title} />
          <div className="min-w-0">
            <h3 className="font-semibold leading-tight [overflow-wrap:anywhere]">{track.title}</h3>
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{track.artist_name}</p>
          </div>
        </div>
        <div className={cn(queueStyles.badgeActions, "flex min-w-0 flex-wrap items-center justify-between gap-1.5 sm:justify-end sm:gap-2")}>
          <div className={cn(queueStyles.badges, "flex min-w-0 flex-wrap gap-1.5")}>
            <TrackStatusBadge status={track.status} />
            {!compact && <VerificationStatusBadge status={track.verification_status} />}
            {track.featured && <Badge variant="outline">Featured</Badge>}
            {hasFlags && track.highest_flag_severity && <FlagSeverityBadge severity={track.highest_flag_severity} />}
          </div>
          <Button asChild size="sm" className={cn(queueStyles.openRecord, "ml-auto min-h-11 shrink-0 px-2 sm:min-h-10 sm:px-3")}>
            {reviewQueueContext ? (
              <ReviewQueueRecordLink href={detailHref} record={track.id} tab="track" context={reviewQueueContext} aria-label={recordLabel}>
                Open Record <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </ReviewQueueRecordLink>
            ) : (
              <Link href={detailHref} aria-label={recordLabel}>Open Record <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            )}
          </Button>
        </div>
      </div>

      <TrackQueueReviewBand actions={
        <CheckedTrackReviewActions trackId={track.id} status={track.status} featured={track.featured} ownershipTotal={ownershipTotal} declaredOwnership={ownershipTotal} layout="queue" />
      }>
        <p className="mb-1.5 text-xs text-muted-foreground">Submitted {formatDateTime(track.created_at)}</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {metadataBadges.filter(Boolean).map(item => <Badge key={item} variant="secondary">{item}</Badge>)}
          {track.mood.slice(0, compact ? 2 : 4).map(mood => <Badge key={mood} variant="outline">{mood}</Badge>)}
        </div>
        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MetricTile icon={<ShieldCheck className="h-4 w-4" />} label="Rights holders"
            value={String(track.rights_holder_count)} detail={`${ownershipTotal}% declared`} tone={ownershipBlocked ? "warning" : "neutral"} />
          <MetricTile icon={<AlertCircle className="h-4 w-4" />} label="Open flags" value={String(track.open_flag_count)}
            detail={hasFlags ? track.open_flag_types.slice(0, 2).join(", ") : "No active blockers"} tone={hasFlags ? "warning" : "neutral"} />
          <MetricTile icon={<FileText className="h-4 w-4" />} label="Reviewer notes"
            value={String(track.review_note_count)} detail={track.review_note_count ? "Notes captured" : "No notes yet"} />
          {!compact && <MetricTile icon={<FileAudio2 className="h-4 w-4" />} label="Verification"
            value={track.verification_status === "verified" ? "Verified" : track.verification_status === "pending" ? "Pending" : "Unverified"}
            detail="Artist profile state" />}
        </dl>
      </TrackQueueReviewBand>
    </article>
  );
}

function Artwork({
  coverArtUrl,
  title
}: {
  coverArtUrl?: string | null;
  title: string;
}) {
  const sizeClassName = "size-9 sm:size-10";

  if (coverArtUrl) {
    return (
      <div className={`relative shrink-0 overflow-hidden rounded-md border border-border bg-muted ${sizeClassName}`}>
        <Image src={coverArtUrl} alt={title} fill className="object-cover" sizes="40px" />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-md border border-border bg-muted text-lg font-semibold text-muted-foreground ${sizeClassName}`}
    >
      {title.slice(0, 2).toUpperCase()}
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  detail,
  tone = "neutral"
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className={`min-w-0 rounded-md border p-2 ${tone === "warning" ? "border-amber-500/20 bg-amber-500/10" : "border-border bg-muted/30"}`}>
      <dt className="flex items-start gap-1.5 text-xs font-medium text-muted-foreground">
        <span aria-hidden="true" className="shrink-0">{icon}</span>
        <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{value}</dd>
      <dd className="text-xs leading-5 [overflow-wrap:anywhere] text-muted-foreground">{detail}</dd>
    </div>
  );
}
