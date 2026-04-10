import type { ReactNode } from "react";

import Image from "next/image";
import Link from "next/link";
import { AlertCircle, FileAudio2, FileText, ShieldCheck } from "lucide-react";

import { TrackReviewActions } from "@/components/admin/track-review-actions";
import { FlagSeverityBadge, TrackStatusBadge, VerificationStatusBadge } from "@/components/shared/state-badges";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatDuration } from "@/lib/utils";
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
  compact = false
}: {
  track: ReviewQueueTrackCardData;
  compact?: boolean;
}) {
  const detailHref = `/admin/tracks/${track.id}`;
  const hasFlags = track.open_flag_count > 0;
  const metadataBadges = [
    track.genre,
    track.subgenre,
    `${track.bpm} BPM`,
    formatDuration(track.duration_seconds),
    track.explicit ? "Explicit" : "Clean"
  ];

  return (
    <article className="rounded-lg border border-border bg-background p-5 shadow-panel">
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex min-w-0 flex-1 gap-4">
          <Artwork coverArtUrl={track.cover_art_url} title={track.title} compact={compact} />
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={detailHref} className="truncate text-lg font-semibold text-foreground hover:underline">
                    {track.title}
                  </Link>
                  <TrackStatusBadge status={track.status} />
                  {track.featured ? <Badge variant="outline" className="border-accent/20 bg-accent/10 text-accent">Featured</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{track.artist_name}</p>
                <p className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Submitted {formatDateTime(track.created_at)}
                </p>
              </div>
              {!compact ? <VerificationStatusBadge status={track.verification_status} /> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {metadataBadges.map((item) => (
                <Badge key={item} variant="secondary">
                  {item}
                </Badge>
              ))}
              {track.mood.slice(0, compact ? 2 : 4).map((mood) => (
                <Badge key={mood} variant="outline">
                  {mood}
                </Badge>
              ))}
            </div>

            <div className={`grid gap-3 ${compact ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
              <MetricTile
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Rights holders"
                value={`${track.rights_holder_count}`}
                detail={`${track.rights_split_total}% declared`}
              />
              <MetricTile
                icon={<AlertCircle className="h-4 w-4" />}
                label="Open flags"
                value={`${track.open_flag_count}`}
                detail={hasFlags ? track.open_flag_types.slice(0, 2).join(", ") : "No active blockers"}
                tone={hasFlags ? "warning" : "neutral"}
              />
              <MetricTile
                icon={<FileText className="h-4 w-4" />}
                label="Reviewer notes"
                value={`${track.review_note_count}`}
                detail={track.review_note_count ? "Notes captured" : "No notes yet"}
              />
              {!compact ? (
                <MetricTile
                  icon={<FileAudio2 className="h-4 w-4" />}
                  label="Verification"
                  value={track.verification_status === "verified" ? "Verified" : track.verification_status === "pending" ? "Pending" : "Unverified"}
                  detail="Artist profile state"
                />
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-auto lg:min-w-[220px] lg:items-end">
          {hasFlags && track.highest_flag_severity ? (
            <div className="flex flex-wrap gap-2">
              <FlagSeverityBadge severity={track.highest_flag_severity} />
              <Badge variant="outline">{track.open_flag_count} issue{track.open_flag_count === 1 ? "" : "s"}</Badge>
            </div>
          ) : (
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              Ready for review
            </Badge>
          )}
          <TrackReviewActions trackId={track.id} status={track.status} featured={track.featured} detailHref={detailHref} />
        </div>
      </div>
    </article>
  );
}

function Artwork({
  coverArtUrl,
  title,
  compact
}: {
  coverArtUrl?: string | null;
  title: string;
  compact?: boolean;
}) {
  const sizeClassName = compact ? "h-20 w-20" : "h-24 w-24";

  if (coverArtUrl) {
    return (
      <div className={`relative shrink-0 overflow-hidden rounded-md border border-border bg-muted ${sizeClassName}`}>
        <Image src={coverArtUrl} alt={title} fill className="object-cover" sizes="96px" />
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
    <div className={`rounded-md border p-3 ${tone === "warning" ? "border-amber-500/20 bg-amber-500/10" : "border-border bg-muted/30"}`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <span className={tone === "warning" ? "text-amber-700 dark:text-amber-300" : ""}>{icon}</span>
        {label}
      </div>
      <p className="mt-3 text-base font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}
