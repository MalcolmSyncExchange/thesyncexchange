export default function ArtistTrackLoading() {
  return (
    <div className="space-y-5 pt-8" aria-label="Loading track detail" role="status">
      <div className="h-10 w-32 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-[110px,1fr] gap-5"><div className="aspect-square animate-pulse rounded-lg bg-muted" /><div className="space-y-4"><div className="h-5 w-36 animate-pulse rounded bg-muted" /><div className="h-12 w-3/5 animate-pulse rounded bg-muted" /><div className="h-5 w-2/5 animate-pulse rounded bg-muted" /></div></div>
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-12 animate-pulse border-b border-border bg-muted/50" />
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
      <span className="sr-only">Loading track detail</span>
    </div>
  );
}
