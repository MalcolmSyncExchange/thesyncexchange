import Image from "next/image";
import Link from "next/link";
import { Music4 } from "lucide-react";
import { PreviewButton } from "@/components/audio/buyer-discovery-provider";
import { FavoriteButton } from "@/components/catalog/favorite-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCatalogPrice } from "@/lib/catalog-discovery";
import { cn, formatCurrency, formatDuration } from "@/lib/utils";
import type { Track } from "@/types/models";

export function BuyerTrackCard({ track, href, layout = "grid", licenseType = "all" }: { track: Track; href: string; layout?: "grid" | "list"; licenseType?: string }) {
  const price = getCatalogPrice(track, licenseType);
  const compact = layout === "list";
  return (
    <article className={cn("overflow-hidden rounded-lg border border-border bg-card", compact && "flex flex-wrap items-center gap-4 p-4")} data-testid="catalog-track-card">
      <div className={cn("relative overflow-hidden", compact ? "h-16 w-16 shrink-0 rounded-md" : "aspect-[4/3]")}>
        {track.cover_art_url ? <Image src={track.cover_art_url} alt="" fill sizes={compact ? "64px" : "(max-width: 768px) 100vw, 360px"} className="object-cover" /> : <div className="flex h-full items-center justify-center bg-muted"><Music4 aria-hidden="true" className="h-8 w-8 text-muted-foreground" /></div>}
      </div>
      <div className={cn("min-w-0", compact ? "flex-1 basis-40" : "px-5 pt-5")}>
        <h3 className="text-lg font-semibold"><Link href={href} className="underline-offset-4 hover:underline">{track.title}</Link></h3>
        <p className="text-sm text-muted-foreground">{track.artist_name}</p>
        <div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline">{track.genre}</Badge>{track.mood.slice(0, 2).map(mood => <Badge key={mood}>{mood}</Badge>)}</div>
        <p className="mt-2 text-sm text-muted-foreground">{track.bpm} BPM · {formatDuration(track.duration_seconds)} · {track.vocals ? "Vocals" : "Instrumental"}</p>
      </div>
      <div className={cn("space-y-3", compact ? "w-full sm:w-auto" : "p-5")}>
        <div><p className="text-sm font-medium">{price ? `From ${formatCurrency(price.amount)}` : "License unavailable"}</p>{price ? <p className="text-xs text-muted-foreground">{price.name}</p> : null}</div>
        <div className="flex flex-wrap items-start gap-2"><PreviewButton track={track} /><FavoriteButton trackId={track.id} trackTitle={track.title} initialFavorite={Boolean(track.is_favorite)} revalidatePathname={href} />{!compact ? <Button asChild variant="ghost" className="h-11"><Link href={href}>Details</Link></Button> : null}</div>
      </div>
    </article>
  );
}
