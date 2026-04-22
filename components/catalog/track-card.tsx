import Image from "next/image";
import Link from "next/link";
import { Music4 } from "lucide-react";

import { FavoriteButton } from "@/components/catalog/favorite-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDuration } from "@/lib/utils";
import type { Track } from "@/types/models";

export function TrackCard({ track, href }: { track: Track; href: string }) {
  return (
    <Card className="overflow-hidden" data-testid="catalog-track-card">
      <div className="relative aspect-[4/3] overflow-hidden">
        {track.cover_art_url ? (
          <Image src={track.cover_art_url} alt={track.title} fill className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-muted">
            <Music4 className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
      </div>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{track.title}</h3>
            <p className="text-sm text-muted-foreground">{track.artist_name}</p>
          </div>
          <FavoriteButton trackId={track.id} initialFavorite={Boolean(track.is_favorite)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{track.genre}</Badge>
          {track.mood.slice(0, 2).map((mood) => (
            <Badge key={mood}>{mood}</Badge>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
          <span>{track.bpm} BPM</span>
          <span>{track.key}</span>
          <span>{formatDuration(track.duration_seconds)}</span>
          <span>{track.vocals ? "Vocals" : "Instrumental"}</span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{formatCurrency(track.license_options[0]?.price_override || 0)}</p>
          <Button asChild>
            <Link href={href}>View Track</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
