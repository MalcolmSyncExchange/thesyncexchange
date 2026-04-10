"use client";

import { LayoutGrid, Rows3 } from "lucide-react";

import { TrackCard } from "@/components/catalog/track-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useCatalogFilters } from "@/hooks/use-catalog-filters";
import type { Track } from "@/types/models";

export function CatalogBrowser({ tracks, basePath }: { tracks: Track[]; basePath: string }) {
  const genres = Array.from(new Set(tracks.map((track) => track.genre)));
  const moods = Array.from(new Set(tracks.flatMap((track) => track.mood)));
  const licenseTypes = Array.from(new Set(tracks.flatMap((track) => track.license_options.map((option) => option.slug))));
  const {
    filteredTracks,
    genre,
    mood,
    query,
    setGenre,
    setMood,
    setQuery,
    sort,
    setSort,
    licenseType,
    setLicenseType,
    vocalProfile,
    setVocalProfile,
    explicitFilter,
    setExplicitFilter,
    priceBand,
    setPriceBand,
    minBpm,
    setMinBpm,
    maxBpm,
    setMaxBpm,
    layout,
    setLayout
  } = useCatalogFilters(tracks);

  return (
    <div className="grid gap-8 lg:grid-cols-[280px,1fr]">
      <aside className="space-y-5 rounded-lg border border-border bg-background p-5">
        <div className="space-y-2">
          <p className="text-sm font-medium">Search</p>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, artist, genre" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Genre</p>
          <Select value={genre} onValueChange={setGenre}>
            <SelectTrigger>
              <SelectValue placeholder="All genres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All genres</SelectItem>
              {genres.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Mood</p>
          <Select value={mood} onValueChange={setMood}>
            <SelectTrigger>
              <SelectValue placeholder="All moods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All moods</SelectItem>
              {moods.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">License type</p>
          <Select value={licenseType} onValueChange={setLicenseType}>
            <SelectTrigger>
              <SelectValue placeholder="All licenses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All licenses</SelectItem>
              {licenseTypes.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Vocal profile</p>
          <Select value={vocalProfile} onValueChange={setVocalProfile}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="vocals">Vocals</SelectItem>
              <SelectItem value="instrumental">Instrumental</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Explicitness</p>
          <Select value={explicitFilter} onValueChange={setExplicitFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="clean">Non-explicit</SelectItem>
              <SelectItem value="explicit">Explicit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Price band</p>
          <Select value={priceBand} onValueChange={setPriceBand}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="under-2000">Under $2K</SelectItem>
              <SelectItem value="2000-5000">$2K to $5K</SelectItem>
              <SelectItem value="5000-plus">$5K+</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">BPM range</p>
          <div className="grid grid-cols-2 gap-2">
            <Input value={minBpm} onChange={(event) => setMinBpm(event.target.value)} placeholder="Min" />
            <Input value={maxBpm} onChange={(event) => setMaxBpm(event.target.value)} placeholder="Max" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Sort</p>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="featured">Featured first</SelectItem>
              <SelectItem value="price-low">Price: low to high</SelectItem>
              <SelectItem value="tempo-high">Tempo: high to low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </aside>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{filteredTracks.length} tracks available</p>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">Fast-cleared licensing with visible rights splits</p>
            <div className="flex items-center gap-1">
              <Button variant={layout === "grid" ? "secondary" : "ghost"} size="sm" onClick={() => setLayout("grid")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button variant={layout === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setLayout("list")}>
                <Rows3 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        {filteredTracks.length ? (
          <div className={layout === "grid" ? "grid gap-6 md:grid-cols-2 xl:grid-cols-3" : "space-y-4"}>
            {filteredTracks.map((track) => (
              <TrackCard key={track.id} track={track} href={`${basePath}/${track.slug}`} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
            No tracks match this filter set yet.
          </div>
        )}
      </div>
    </div>
  );
}
