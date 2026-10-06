export default function ArtistCatalogLoading() {
  return (
    <div className="space-y-6 pt-8" aria-label="Loading artist catalog" role="status">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="h-12 w-3/5 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="space-y-px overflow-hidden rounded-xl border border-border">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-24 animate-pulse bg-muted/70" />)}</div>
      <span className="sr-only">Loading your catalog</span>
    </div>
  );
}
