import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileAudio, Music2, Plus, Search, ShieldAlert } from "lucide-react";

import { PreviewAudioButton } from "@/components/audio/preview-audio-provider";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/ui/data-state";
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
  return (
    <div className={styles.page} data-testid="artist-catalog">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Artist catalog</p>
          <h1>Your music, organized.</h1>
          <p>Review each track’s Buyer visibility, assets, rights records, and active license options.</p>
        </div>
        <Button asChild size="lg"><Link href="/artist/submit"><Plus aria-hidden="true" className="h-4 w-4" />Add track</Link></Button>
      </header>

      <dl className={styles.summary} aria-label="Catalog summary">
        <SummaryItem label="Tracks" value={data.counts.total} />
        <SummaryItem label="Discoverable" value={data.counts.discoverable} />
        <SummaryItem label="In review" value={data.counts.inReview} />
        <SummaryItem label="Drafts" value={data.counts.drafts} />
      </dl>

      <div className={styles.toolbar}>
        <form action="/artist/catalog" className={styles.search} role="search">
          <label htmlFor="artist-catalog-search" className="sr-only">Search your catalog</label>
          <Search aria-hidden="true" className="h-4 w-4" />
          <input id="artist-catalog-search" name="query" type="search" defaultValue={data.query} placeholder="Search title, genre, or catalog slug" />
          {data.status !== "all" ? <input type="hidden" name="status" value={data.status} /> : null}
          <Button type="submit" variant="secondary" size="sm">Search</Button>
        </form>
        <nav className={styles.filters} aria-label="Filter catalog by status">
          {filters.map(filter => {
            const href = buildCatalogHref({ query: data.query, status: filter.value, page: 1 });
            return <Link key={filter.value} href={href} aria-current={data.status === filter.value ? "page" : undefined}>{filter.label}</Link>;
          })}
        </nav>
      </div>

      {data.items.length ? (
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
                    <span>{[track.genre, track.subgenre].filter(Boolean).join(" · ") || "Music details not provided"}</span>
                  </div>
                </div>
                <div className={styles.cell} role="cell" data-label="Status">
                  <DomainStatus tone={track.buyerVisibility.tone}>{track.buyerVisibility.label}</DomainStatus>
                  <small>{track.statusLabel}</small>
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
          title={data.counts.total ? "No tracks match this view" : "Your catalog is ready for its first track"}
          description={data.counts.total ? "Try a different title or clear the current status filter." : "Add a track when you are ready. Drafts stay private until you submit them for review."}
          action={data.counts.total ? <Button asChild variant="outline"><Link href="/artist/catalog">Clear search and filters</Link></Button> : <Button asChild><Link href="/artist/submit">Add your first track</Link></Button>}
        />
      )}

      {data.pageCount > 1 ? (
        <nav className={styles.pagination} aria-label="Catalog pages">
          <Button asChild variant="outline" aria-disabled={data.page === 1} className={data.page === 1 ? styles.disabledLink : undefined}>
            <Link href={buildCatalogHref({ query: data.query, status: data.status, page: Math.max(1, data.page - 1) })}><ChevronLeft aria-hidden="true" />Previous</Link>
          </Button>
          <span>Page {data.page} of {data.pageCount}</span>
          <Button asChild variant="outline" aria-disabled={data.page === data.pageCount} className={data.page === data.pageCount ? styles.disabledLink : undefined}>
            <Link href={buildCatalogHref({ query: data.query, status: data.status, page: Math.min(data.pageCount, data.page + 1) })}>Next<ChevronRight aria-hidden="true" /></Link>
          </Button>
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
