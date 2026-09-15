"use client";

import styles from "@/components/buyer/buyer-workspace.module.css";
import { LayoutGrid, Rows3, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { BuyerTrackCard } from "@/components/catalog/buyer-track-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBuyerDiscovery } from "@/components/audio/buyer-discovery-provider";
import { filterCatalog, defaultCatalogFilters, type CatalogFilters } from "@/lib/catalog-discovery";
import type { Track } from "@/types/models";

const selectStyle = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";
export function BuyerCatalogBrowser({ tracks, basePath, interests }: { tracks: Track[]; basePath: string; interests?: { genres: string[]; moods: string[] } }) {
  const { filters, setFilters } = useBuyerDiscovery();
  const filteredTracks = useMemo(() => filterCatalog(tracks, filters), [tracks, filters]);
  const [open, setOpen] = useState(false);
  const results = useRef<HTMLHeadingElement>(null);
  const update = <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const fields = [
    { key: "genre", label: "Genre", options: [...new Set(tracks.map(t => t.genre))].sort().map(v => [v, v]) },
    { key: "mood", label: "Mood", options: [...new Set(tracks.flatMap(t => t.mood))].sort().map(v => [v, v]) },
    { key: "licenseType", label: "License type", options: [...new Map(tracks.flatMap(t => t.license_options.filter(o => o.active !== false).map(o => [o.slug, o.name]))).entries()] },
    { key: "vocalProfile", label: "Vocals", options: [["vocals", "Vocals"], ["instrumental", "Instrumental"]] },
    { key: "explicitFilter", label: "Explicitness", options: [["clean", "Non-explicit"], ["explicit", "Explicit"]] },
    { key: "priceBand", label: "License budget", options: [["under-2000", "Under $2K"], ["2000-5000", "$2K to $5K"], ["5000-plus", "Over $5K"]] }
  ] as const;
  const chips = fields.filter(field => filters[field.key] !== "all").map(field => ({
    key: field.key as keyof CatalogFilters,
    label: `${field.label}: ${field.options.find(option => option[0] === filters[field.key])?.[1] || filters[field.key]}`
  }));
  if (filters.minBpm) chips.push({ key: "minBpm", label: `Min ${filters.minBpm} BPM` });
  if (filters.maxBpm) chips.push({ key: "maxBpm", label: `Max ${filters.maxBpm} BPM` });
  const tempoError = filters.minBpm !== "" && filters.maxBpm !== "" && Number(filters.minBpm) > Number(filters.maxBpm);
  const suggestions = fields.slice(0, 2).flatMap(field => field.options.filter(([value]) =>
    (field.key === "genre" ? interests?.genres : interests?.moods)?.some(interest => interest.toLowerCase() === value.toLowerCase())
  ).map(([value]) => ({ key: field.key, value })));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1 space-y-2">
          <label htmlFor="catalog-search" className="text-sm font-medium">Find your next track</label>
          <Input id="catalog-search" type="search" className="h-11" value={filters.query} onChange={e => update("query", e.target.value)} placeholder="Track, artist, genre or mood" />
        </div>
        <Button type="button" variant="outline" className="h-11" aria-expanded={open} aria-controls="catalog-filters" onClick={() => setOpen(!open)}>
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" /> Filters{chips.length ? ` (${chips.length})` : ""}
        </Button>
      </div>
      {suggestions.length ? <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Start with a saved interest. Select one to filter this search.</p>
        <div className="flex flex-wrap gap-2">{suggestions.map(({ key, value }) => <Button key={`${key}-${value}`} type="button" variant="outline" className="min-h-11" aria-pressed={filters[key] === value} onClick={() => update(key, filters[key] === value ? "all" : value)}>{value}</Button>)}</div>
      </div> : null}
      <div id="catalog-filters" hidden={!open}>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {fields.map(field => <div key={field.key} className="space-y-2">
              <label htmlFor={`filter-${field.key}`} className="text-sm font-medium">{field.label}</label>
              <select id={`filter-${field.key}`} className={selectStyle} value={filters[field.key]} onChange={e => update(field.key, e.target.value)}>
                <option value="all">All</option>
                {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>)}
            <div className="space-y-2"><label htmlFor="min-bpm" className="text-sm font-medium">Minimum BPM</label><Input id="min-bpm" type="number" min={0} className="h-11" value={filters.minBpm} onChange={e => update("minBpm", e.target.value)} aria-invalid={tempoError} aria-describedby={tempoError ? "tempo-error" : undefined} /></div>
            <div className="space-y-2"><label htmlFor="max-bpm" className="text-sm font-medium">Maximum BPM</label><Input id="max-bpm" type="number" min={0} className="h-11" value={filters.maxBpm} onChange={e => update("maxBpm", e.target.value)} aria-invalid={tempoError} aria-describedby={tempoError ? "tempo-error" : undefined} /></div>
          </div>
          {tempoError ? <p id="tempo-error" role="alert" className="mt-3 text-sm text-destructive">Minimum BPM must not exceed maximum BPM.</p> : null}
          <Button type="button" className="mt-4" onClick={() => { setOpen(false); results.current?.focus(); }}>Show {filteredTracks.length} tracks</Button>
        </div>
      </div>
      {chips.length ? <div className="flex flex-wrap gap-2" aria-label="Active filters">
        {chips.map(chip => <Button type="button" key={chip.key} variant="secondary" className="min-h-11 text-xs" aria-label={`Remove ${chip.label}`} onClick={() => update(chip.key, defaultCatalogFilters[chip.key])}>{chip.label}<X aria-hidden="true" className="h-3 w-3" /></Button>)}
        <Button type="button" variant="ghost" onClick={() => setFilters(current => ({ ...defaultCatalogFilters, query: current.query, layout: current.layout, sort: current.sort }))}>Clear filters</Button>
      </div> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 ref={results} tabIndex={-1} className="text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-live="polite" aria-atomic="true">{filteredTracks.length} {filteredTracks.length === 1 ? "track" : "tracks"} available</h2>
        <div className="flex items-center gap-2">
          <label htmlFor="catalog-sort" className="sr-only">Sort tracks</label>
          <select id="catalog-sort" value={filters.sort} onChange={e => update("sort", e.target.value)} className={`${selectStyle} max-w-[185px]`}>
            <option value="featured">Featured first</option><option value="price-low">Price: low to high</option><option value="tempo-high">Tempo: high to low</option>
          </select>
          <Button type="button" variant={filters.layout === "list" ? "secondary" : "ghost"} className="h-11 w-11 p-0" aria-label="List view" aria-pressed={filters.layout === "list"} onClick={() => update("layout", "list")}><Rows3 className="h-4 w-4" aria-hidden="true" /></Button>
          <Button type="button" variant={filters.layout === "grid" ? "secondary" : "ghost"} className="h-11 w-11 p-0" aria-label="Grid view" aria-pressed={filters.layout === "grid"} onClick={() => update("layout", "grid")}><LayoutGrid className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
      </div>
      {filteredTracks.length ? <div className={filters.layout === "grid" ? "grid gap-5 md:grid-cols-2 xl:grid-cols-3" : styles.trackList}>
        {filteredTracks.map(track => <BuyerTrackCard key={track.id} track={track} href={`${basePath}/${track.slug}`} layout={filters.layout} licenseType={filters.licenseType} />)}
      </div> : <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
        <h3 className="text-lg font-semibold">{tracks.length ? "No tracks match your search" : "New music is on its way"}</h3>
        <p className="my-3 text-sm text-muted-foreground">{tracks.length ? "Try a different mood, widen your budget, or start again." : "Approved tracks will appear here when they are available."}</p>
        {tracks.length ? <Button type="button" variant="outline" onClick={() => setFilters(current => ({ ...defaultCatalogFilters, layout: current.layout }))}>Reset search and filters</Button> : null}
      </div>}
    </div>
  );
}
