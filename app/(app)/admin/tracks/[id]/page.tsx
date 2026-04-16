import Link from "next/link";
import { notFound } from "next/navigation";

import { ComplianceFlagActions } from "@/components/admin/compliance-flag-actions";
import { ComplianceFlagForm } from "@/components/admin/compliance-flag-form";
import { ReviewNoteForm } from "@/components/admin/review-note-form";
import { FlagSeverityBadge, FlagStatusBadge } from "@/components/shared/state-badges";
import { TrackReviewActions } from "@/components/admin/track-review-actions";
import { AudioPlayer } from "@/components/audio/audio-player";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDateTime, formatDuration, formatEnumLabel } from "@/lib/utils";
import { getAdminTrackById } from "@/services/admin/queries";

export default async function AdminTrackDetailPage({ params }: { params: { id: string } }) {
  const data = await getAdminTrackById(params.id);
  if (!data) notFound();

  const { track, flags, reviewNotes, auditLog } = data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/tracks" className="text-sm text-muted-foreground hover:text-foreground">
            Back to Track Management
          </Link>
          <h1 className="mt-3 text-3xl font-semibold">{track.title}</h1>
          <p className="mt-2 text-muted-foreground">
            {track.artist_name} • {track.genre} • {track.subgenre}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{track.status}</Badge>
          <TrackReviewActions trackId={track.id} status={track.status} featured={track.featured} />
        </div>
      </div>

      <AudioPlayer title={track.title} artist={track.artist_name} src={track.audio_file_url} />

      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Track metadata</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {[
                ["BPM", `${track.bpm}`],
                ["Key", track.key],
                ["Duration", formatDuration(track.duration_seconds)],
                ["Release year", String(track.release_year)],
                ["Primary price", formatCurrency(track.license_options[0]?.price_override || track.license_options[0]?.base_price || 0)],
                ["Explicit", track.explicit ? "Yes" : "No"]
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-border p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 font-medium">{value}</p>
                </div>
              ))}
              <div className="rounded-md border border-border p-4 md:col-span-2">
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="mt-1">{track.description}</p>
              </div>
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

        <div className="space-y-6">
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
