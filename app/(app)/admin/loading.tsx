export default function AdminLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="rounded-lg border border-border bg-card/80 p-6 shadow-panel">
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="mt-4 h-10 w-full max-w-2xl rounded bg-muted" />
        <div className="mt-3 h-5 w-full max-w-3xl rounded bg-muted" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-border bg-card p-6 shadow-panel">
            <div className="h-4 w-28 rounded bg-muted" />
            <div className="mt-5 h-8 w-20 rounded bg-muted" />
            <div className="mt-3 h-4 w-full rounded bg-muted" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr,0.9fr]">
        <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-panel">
          <div className="h-6 w-48 rounded bg-muted" />
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-border bg-muted/20 p-5">
              <div className="h-5 w-40 rounded bg-muted" />
              <div className="mt-3 h-4 w-full rounded bg-muted" />
              <div className="mt-3 h-20 rounded bg-muted" />
            </div>
          ))}
        </div>

        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-border bg-card p-6 shadow-panel">
              <div className="h-6 w-40 rounded bg-muted" />
              <div className="mt-4 h-20 rounded bg-muted" />
              <div className="mt-4 h-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
