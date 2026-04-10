import Link from "next/link";

import { TrackReviewActions } from "@/components/admin/track-review-actions";
import { Badge } from "@/components/ui/badge";
import { getAdminTracks } from "@/services/admin/queries";

export default async function AdminTracksPage() {
  const tracks = await getAdminTracks();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Track management</h1>
      <div className="space-y-4">
        {tracks.map((track) => (
          <div key={track.id} className="rounded-lg border border-border bg-background p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <Link href={`/admin/tracks/${track.id}`} className="font-medium hover:underline">
                  {track.title}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {track.artist_name} • {track.genre}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={track.featured ? "default" : "outline"}>{track.featured ? "Featured" : "Standard"}</Badge>
                <Badge variant="secondary">{track.status}</Badge>
                <TrackReviewActions trackId={track.id} status={track.status} featured={track.featured} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
