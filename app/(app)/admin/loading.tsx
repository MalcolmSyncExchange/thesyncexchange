export default function AdminLoading() {
  return <div className="space-y-5" role="status" aria-label="Loading Admin workspace">
    <span className="sr-only">Loading Admin workspace</span>
    <div className="h-3 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
    <div className="h-10 max-w-[520px] animate-pulse rounded bg-muted motion-reduce:animate-none" />
    <div className="h-5 max-w-[680px] animate-pulse rounded bg-muted motion-reduce:animate-none" />
    <div className="h-64 animate-pulse rounded-[14px] border border-border bg-card motion-reduce:animate-none" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-[14px] border border-border bg-card motion-reduce:animate-none" />)}
    </div>
  </div>;
}
