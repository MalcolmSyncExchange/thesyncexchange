import Link from "next/link";
import { notFound } from "next/navigation";

import { AudioPlayer } from "@/components/audio/audio-player";
import { FavoriteButton } from "@/components/catalog/favorite-button";
import { TrackCard } from "@/components/catalog/track-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDuration } from "@/lib/utils";
import { requireSession } from "@/services/auth/session";
import { getBuyerCatalogTracks, getBuyerTrackBySlug } from "@/services/buyer/queries";

export default async function BuyerTrackDetailPage({ params }: { params: { slug: string } }) {
  const user = await requireSession("buyer");
  const track = await getBuyerTrackBySlug(params.slug, user.id);
  if (!track) notFound();

  const tracks = await getBuyerCatalogTracks(user.id);
  const related = tracks.filter((item) => item.genre === track.genre && item.id !== track.id).slice(0, 3);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge>{track.genre}</Badge>
            {track.mood.map((mood) => (
              <Badge key={mood} variant="outline">
                {mood}
              </Badge>
            ))}
          </div>
          <h1 className="mt-4 text-4xl font-semibold">{track.title}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{track.artist_name}</p>
        </div>
        <div className="flex items-center gap-3">
          <FavoriteButton trackId={track.id} initialFavorite={Boolean(track.is_favorite)} revalidatePathname={`/buyer/catalog/${track.slug}`} />
          <Button asChild size="lg">
            <Link href={`/buyer/checkout/${track.slug}`}>License This Track</Link>
          </Button>
        </div>
      </div>
      <AudioPlayer title={track.title} artist={track.artist_name} />
      <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
        <Card>
          <CardHeader>
            <CardTitle>Track detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">{track.description}</p>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {[
                ["BPM", `${track.bpm}`],
                ["Key", track.key],
                ["Duration", formatDuration(track.duration_seconds)],
                ["Vocals", track.vocals ? "Yes" : "No"],
                ["Instrumental", track.instrumental ? "Yes" : "No"],
                ["Explicit", track.explicit ? "Yes" : "No"]
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-border p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 font-medium">{value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium">Rights holders</p>
              <div className="mt-4 grid gap-3">
                {track.rights_holders.map((holder) => (
                  <div key={holder.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
                    <div>
                      <p className="font-medium">{holder.name}</p>
                      <p className="text-sm text-muted-foreground">{holder.role_type}</p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{holder.ownership_percent}%</p>
                      <p>{holder.approval_status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Available licenses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {track.license_options.map((option) => (
              <div key={option.id} className="rounded-md border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{option.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{option.terms_summary}</p>
                  </div>
                  <p className="font-medium">{formatCurrency(option.price_override || option.base_price)}</p>
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {option.exclusive ? "Exclusive negotiation path" : "Standard non-exclusive license"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Related tracks</h2>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {related.map((item) => (
            <TrackCard key={item.id} track={item} href={`/buyer/catalog/${item.slug}`} />
          ))}
        </div>
      </section>
    </div>
  );
}
