import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileAudio, Music2, Plus, Search, ShieldAlert } from "lucide-react";

import { PreviewAudioButton } from "@/components/audio/preview-audio-provider";
import { ArtistTrackStatus } from "@/components/artist/tracks/artist-track-status";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/ui/data-state";
import { FirstUseState } from "@/components/ui/first-use-state";
import { DomainStatus } from "@/components/ui/domain-status";
import { cn } from "@/lib/utils";
import type { ArtistCatalogPageData, ArtistCatalogStatusFilter } from "@/services/artist/catalog-contract";
import styles from "./artist-catalog-view.module.css";

const filters: Array<{ value: ArtistCatalogStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "discoverable", label: "Discoverable" },
  { value: "in_review", label: "In review" },
  { value: "draft", label: "Draft" }
];

export function ArtistCatalogView({ data }: { data: ArtistCatalogPageData }) {
  const firstUse = data.counts.total === 0 && !data.query && data.status === "all";
  return (
    <div className={styles.page} data-testid="artist-catalog">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Artist catalog</p>
          <h1>Your music, organized.</h1>
          <p>{firstUse ? "This is where your tracks and their review status will live." : "Review each track’s Buyer visibility, assets, rights records, and active license options."}</p>
        </div>
        {!firstUse ? <Button asChild size="lg"><Link href="/artist/submit"><Plus aria-hidden="true" className="h-4 w-4" />Add track</Link></Button> : null}
      </header>

      {!firstUse ? <dl className={styles.summary} aria-label="Catalog summary">
        <SummaryItem label="Tracks" value={data.counts.total} />
        <SummaryItem label="Discoverable" value={data.counts.discoverable} />
        <SummaryItem label="In review" value={data.counts.inReview} />
        <SummaryItem label="Drafts" value={data.counts.drafts} />
      </dl> : null}

      {!firstUse ? <div className={styles.toolbar}>
        <form action="/artist/catalog" className={styles.search} role="search">
          <label htmlFor="artist-catalog-search" className="sr-only">Search your catalog</label>
          <Search aria-hidden="true" className="h-4 w-4" />
          <input id="artist-catalog-search" name="query" type="search" defaultValue={data.query} placeholder="Search title or genre" />
          {data.status !== "all" ? <input type="hidden" name="status" value={data.status} /> : null}
          <Button type="submit" variant="secondary" size="sm">Search</Button>
        </form>
        <nav className={styles.filters} aria-label="Filter catalog by status">
          {filters.map(filter => {
            const href = buildCatalogHref({ query: data.query, status: filter.value, page: 1 });
            return <Link key={filter.value} href={href} aria-current={data.status === filter.value ? "page" : undefined}>{filter.label}</Link>;
          })}
        </nav>
      </div> : null}

      {firstUse ? <FirstUseState
        icon={Music2}
        eyebrow="My catalog · 0 tracks"
        title="Your catalog starts with one track."
        description="Add your music here. Drafts stay private while you work; submission sends a track for review."
        action={<Button asChild size="lg"><Link href="/artist/submit"><Plus aria-hidden="true" className="h-4 w-4" />Add your first track</Link></Button>}
        steps={[
          { title: "Start a draft", description: "Enter the track details you have now." },
          { title: "Complete the submission", description: "Add the required information before review." },
          { title: "Follow its status", description: "Return here to see where the track stands." }
        ]}
      /> : data.items.length ? (
        <div className={styles.table} role="table" aria-label="Artist catalog">
          <div className={styles.tableHead} role="row">
            <span role="columnheader">Track</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Assets</span>
            <span role="columnheader">Rights</span>
            <span role="columnheader">Licenses</span>
            <span role="columnheader">Updated</span>
          </div>
          <div role="rowgroup">
            {data.items.map(track => (
              <article className={styles.row} role="row" key={track.id}>
                <div className={styles.trackCell} role="cell" data-label="Track">
                  <div className={styles.artwork}>
                    {track.coverArtUrl ? <Image src={track.coverArtUrl} alt="" fill sizes="56px" className={styles.artworkImage} /> : <Music2 aria-hidden="true" />}
                    {track.preview ? <PreviewAudioButton track={{ ...track.preview, href: `/artist/tracks/${track.slug}` }} compact className={styles.previewButton} /> : null}
                  </div>
                  <div className={styles.trackText}>
                    <Link href={`/artist/tracks/${track.slug}`}>{track.title}</Link>
                    <span>{[track.artistName, track.genre, track.subgenre].filter(Boolean).join(" · ")}</span>
                  </div>
                </div>
                <div className={styles.cell} role="cell" data-label="Status">
                  <ArtistTrackStatus track={track} className={styles.statusSummary} />
                  <Link className={styles.mobileOpen} href={`/artist/tracks/${track.slug}`} aria-label={`View details for ${track.title}`}>View details <ChevronRight aria-hidden="true" /></Link>
                </div>
                <div className={styles.cell} role="cell" data-label="Assets">
                  <span className={cn(styles.assetCount, track.assets.availableCount === track.assets.trackedCount && styles.complete)}><FileAudio aria-hidden="true" />{track.assets.availableCount} of {track.assets.trackedCount}</span>
                  <small>{track.assets.buyerPreviewReady ? "Buyer preview ready" : "Preview needed"}</small>
                </div>
                <div className={styles.cell} role="cell" data-label="Rights">
                  <DomainStatus tone={track.legacyRights.holderCount && !track.legacyRights.pendingCount ? "info" : "warning"}>
                    {track.legacyRights.holderCount ? "Legacy records" : "Not provided"}
                  </DomainStatus>
                  <small>{track.legacyRights.holderCount ? `${track.legacyRights.holderCount} recorded ${track.legacyRights.holderCount === 1 ? "party" : "parties"}` : "Needs attention"}</small>
                </div>
                <div className={styles.cell} role="cell" data-label="Licenses">
                  <strong>{track.activeLicenseCount}</strong>
                  <small>{track.activeLicenseCount === 1 ? "active option" : "active options"}</small>
                </div>
                <div className={styles.cell} role="cell" data-label="Updated">
                  <time dateTime={track.updatedAt}>{formatShortDate(track.updatedAt)}</time>
                  <Link className={styles.openLink} href={`/artist/tracks/${track.slug}`} aria-label={`Open ${track.title}`}>Open <ChevronRight aria-hidden="true" /></Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <DataState
          icon={data.counts.total ? Search : ShieldAlert}
          title="No tracks match this view"
          description={data.counts.total ? "Try a different title or clear the current status filter." : "Clear this search or filter to start your catalog."}
          action={<Button asChild variant="outline"><Link href="/artist/catalog">Clear search and filters</Link></Button>}
        />
      )}

      {data.pageCount > 1 ? (
        <nav className={styles.pagination} aria-label="Catalog pages">
          {data.page === 1 ? <span className={styles.disabledLink} aria-disabled="true"><ChevronLeft aria-hidden="true" />Previous</span> : <Button asChild variant="outline"><Link href={buildCatalogHref({ query: data.query, status: data.status, page: data.page - 1 })}><ChevronLeft aria-hidden="true" />Previous</Link></Button>}
          <span>Page {data.page} of {data.pageCount}</span>
          {data.page === data.pageCount ? <span className={styles.disabledLink} aria-disabled="true">Next<ChevronRight aria-hidden="true" /></span> : <Button asChild variant="outline"><Link href={buildCatalogHref({ query: data.query, status: data.status, page: data.page + 1 })}>Next<ChevronRight aria-hidden="true" /></Link></Button>}
        </nav>
      ) : null}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function buildCatalogHref({ query, status, page }: { query: string; status: ArtistCatalogStatusFilter; page: number }) {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const value = params.toString();
  return value ? `/artist/catalog?${value}` : "/artist/catalog";
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}
