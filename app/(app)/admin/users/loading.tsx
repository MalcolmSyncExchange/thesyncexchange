export default function AdminUsersLoading() {
  return <div role="status" aria-label="Loading users" className="space-y-5">
    <span className="sr-only">Loading users</span>
    <div className="h-3 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
    <div className="h-11 max-w-[400px] animate-pulse rounded bg-muted motion-reduce:animate-none" />
    <div className="h-16 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none" />
    {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none" />)}
  </div>;
}
