import { getAdminTrackReviewMedia } from "@/services/media/admin-track-review";
import { findTrackUpload } from "@/services/media/uploads";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Music4 } from "lucide-react";

import { ComplianceFlagActions } from "@/components/admin/compliance-flag-actions";
import { ComplianceFlagForm } from "@/components/admin/compliance-flag-form";
import { ReviewNoteForm } from "@/components/admin/review-note-form";
import { FlagSeverityBadge, FlagStatusBadge, TrackStatusBadge } from "@/components/shared/state-badges";
import { TrackReviewActions } from "@/components/admin/track-review-actions";
import { RecordingPlayer } from "@/components/audio/recording-player";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { catalogQueueContext, catalogReviewHref, reviewQueueHref } from "@/lib/admin/review-queue-navigation";
import { formatCurrency, formatDateTime, formatDuration, formatEnumLabel } from "@/lib/utils";
import { getAdminTrackById } from "@/services/admin/queries";

export default async function AdminTrackDetailPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; status?: string; page?: string }> }) {
  const params = await props.params;
  const { from, status, page } = await props.searchParams;
  const fromReviewQueue = from === "review-queue";
  const queueContext = catalogQueueContext(status, page);
  const backHref = fromReviewQueue ? reviewQueueHref("track", queueContext, params.id) : "/admin/tracks";
  const data = await getAdminTrackById(params.id);
  if (!data) notFound();

  const { track, flags, reviewNotes, auditLog } = data;
  const reviewMedia = await getAdminTrackReviewMedia(track.id);
  const mediaSubmission = reviewMedia.status === "ready" ? reviewMedia.submission : await findTrackUpload(track.id);
  const totalOwnership = track.rights_holders.reduce((sum, holder) => sum + Math.round(Number(holder.ownership_percent || 0) * 100), 0) / 100;
  const hasCompleteOwnership = totalOwnership === 100;
  const activeLicenseOptions = track.license_options.filter((option) => option.active !== false);
  const reviewWarnings = [
    track.rights_holders.length === 0 ? "No rights holders have been added to this submission." : null,
    track.rights_holders.length > 0 && !hasCompleteOwnership
      ? `Rights holder ownership totals ${formatOwnershipPercent(totalOwnership)}%. It should equal 100%.`
      : null,
    activeLicenseOptions.length === 0 ? "No active license options are configured for buyer checkout." : null
  ].filter((warning): warning is string => Boolean(warning));
  const evidenceLink = "inline-flex min-h-11 items-center rounded-sm text-sm text-foreground underline decoration-muted-foreground/60 underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9";

  return (
    <div className="mx-auto min-w-0 max-w-[1400px] space-y-4 sm:space-y-5">
      <header className="min-w-0 space-y-2">
        <Link href={backHref} className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {fromReviewQueue ? "Back to Track Submissions" : "Back to Track Management"}
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <CoverArtwork coverArtUrl={track.cover_art_url} title={track.title} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{track.title}</h1>
              <TrackStatusBadge status={track.status} />
            </div>
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{track.artist_name} • {track.genre} • {track.subgenre}</p>
          </div>
        </div>
        <nav aria-label="Track evidence" className="flex flex-wrap gap-x-4">
          <Link className={evidenceLink} href={"/admin/rights?track=" + track.id} aria-label="Rights evidence for master and publishing">Rights evidence</Link>
          <Link className={evidenceLink} href={fromReviewQueue ? catalogReviewHref(track.id, queueContext, true) : "/admin/catalog?track=" + track.id} aria-label="Catalog review and publication">Catalog review</Link>
          {mediaSubmission && <Link className={evidenceLink} href={"/admin/media?draft=" + mediaSubmission} aria-label="Inspect media in Media Operations">Inspect media</Link>}
        </nav>
        <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2">
          {reviewWarnings.length > 0 && (
            <ul className="min-w-0 space-y-1 rounded-md border border-destructive/25 bg-destructive/10 px-2.5 py-2 text-sm text-destructive">
              {reviewWarnings.map((warning) => (
                <li key={warning} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          )}
          <TrackReviewActions trackId={track.id} status={track.status} featured={track.featured} ownershipTotal={totalOwnership}
            className="space-y-1.5 [&_button]:min-h-11 sm:[&_button]:min-h-9" />
        </div>
      </header>

      {reviewMedia.status === "ready" ? (
        <RecordingPlayer
          key={reviewMedia.source.id}
          submission={reviewMedia.submission}
          source={reviewMedia.source}
          waveformUrl={reviewMedia.waveformUrl}
          selection={reviewMedia.selection}
          readOnly
        />
      ) : (
        <Card>
          <CardHeader className="p-4">
            <h2 className="text-base font-semibold">Review media unavailable</h2>
            <CardDescription>The current working master and its matching waveform must both be ready for playback here.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="px-4 pb-3 pt-4">
              <CardTitle>Track metadata</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                {[
                  ["BPM", `${track.bpm}`],
                  ["Key", track.key],
                  ["Duration", formatDuration(track.duration_seconds)],
                  ["Release year", String(track.release_year)],
                  ["Primary price", formatCurrency(track.license_options[0]?.price_override || track.license_options[0]?.base_price || 0)],
                  ["Explicit", track.explicit ? "Yes" : "No"]
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="text-sm font-medium">{value}</dd>
                  </div>
                ))}
                <div className="col-span-full border-t border-border pt-2">
                  <dt className="text-xs text-muted-foreground">Description</dt>
                  <dd className="text-sm [overflow-wrap:anywhere]">{track.description}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rights Holders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Ownership</p>
                  <p className="mt-1 text-2xl font-semibold">{formatOwnershipPercent(totalOwnership)}%</p>
                </div>
                <Badge
                  variant={hasCompleteOwnership ? "default" : "outline"}
                  className={hasCompleteOwnership ? undefined : "border-destructive/30 text-destructive"}
                >
                  {hasCompleteOwnership ? "Balanced" : "Review Required"}
                </Badge>
              </div>
              {track.rights_holders.length ? (
                <div className="grid gap-3">
                  {track.rights_holders.map((holder) => (
                    <div key={holder.id} className="rounded-md border border-border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{holder.name}</p>
                          <p className="text-sm text-muted-foreground">{holder.email}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            {formatEnumLabel(holder.role_type)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold">{formatOwnershipPercent(holder.ownership_percent)}%</p>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            {formatEnumLabel(holder.approval_status)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No rights holders were submitted with this track.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>License Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {track.license_options.length ? (
                track.license_options.map((option) => (
                  <div key={option.id} className="rounded-md border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{option.name}</p>
                          <Badge variant={option.active !== false ? "default" : "secondary"}>
                            {option.active !== false ? "Active" : "Inactive"}
                          </Badge>
                          <Badge variant="outline">{option.exclusive ? "Exclusive" : "Non-Exclusive"}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{option.terms_summary || option.description}</p>
                      </div>
                      <p className="text-lg font-semibold">{formatCurrency(option.price_override ?? option.base_price ?? 0)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No license options were configured for this track.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reviewer notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ReviewNoteForm trackId={track.id} />
              {reviewNotes.length ? reviewNotes.map((note: any) => (
                <div key={note.id} className="rounded-md border border-border p-4">
                  <p className="text-sm">{note.note}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {note.author_name || "Unknown reviewer"} • {formatDateTime(note.created_at)}
                  </p>
                </div>
              )) : <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">No reviewer notes yet.</div>}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Compliance flags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ComplianceFlagForm trackId={track.id} />
              {flags.length ? flags.map((flag: any) => (
                <div key={flag.id} className="rounded-md border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{flag.flag_type}</p>
                        <FlagStatusBadge status={flag.status} />
                        <FlagSeverityBadge severity={flag.severity} />
                      </div>
                      <p className="text-sm text-muted-foreground">{flag.notes}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {flag.created_by_name || "Unknown reviewer"} • {formatDateTime(flag.created_at)}
                      </p>
                    </div>
                    <ComplianceFlagActions flagId={flag.id} status={flag.status} />
                  </div>
                </div>
              )) : <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">No active compliance flags on this track.</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {auditLog.length ? auditLog.map((event: any) => (
                <div key={event.id} className="rounded-md border border-border p-4">
                  <p className="font-medium">{formatEnumLabel(event.action)}</p>
                  {event.metadata && Object.keys(event.metadata).length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(event.metadata).map(([key, value]) => (
                        <Badge key={key} variant="outline">
                          {formatEnumLabel(key)}: {String(value)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {event.actor_name || "System"} • {formatDateTime(event.created_at)}
                  </p>
                </div>
              )) : <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">No audit history yet.</div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CoverArtwork({ coverArtUrl, title }: { coverArtUrl?: string | null; title: string }) {
  return (
    <div className="relative aspect-square size-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted sm:size-16 lg:size-20">
      {coverArtUrl ? (
        <Image src={coverArtUrl} alt={`${title} cover artwork`} fill sizes="(min-width: 1024px) 80px, (min-width: 640px) 64px, 56px" className="object-cover" priority />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Music4 className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function formatOwnershipPercent(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
