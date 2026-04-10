export default function OnboardingLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 border-b border-border/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-md border border-border bg-muted" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-7 w-28 animate-pulse rounded-full border border-border bg-muted" />
        </div>
        <div className="mt-8 grid flex-1 gap-6 lg:grid-cols-[340px,1fr] xl:grid-cols-[360px,1fr]">
          <div className="animate-pulse rounded-lg border border-border bg-card/90 p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-3 w-28 rounded bg-muted" />
                <div className="mt-3 h-4 w-24 rounded bg-muted" />
              </div>
              <div className="h-10 w-16 rounded bg-muted" />
            </div>
            <div className="mt-8 h-3 w-24 rounded bg-muted" />
            <div className="mt-4 h-8 w-52 rounded bg-muted" />
            <div className="mt-3 h-4 w-full rounded bg-muted" />
            <div className="mt-2 h-4 w-4/5 rounded bg-muted" />
            <div className="mt-8 rounded-lg border border-border bg-background/70 p-4">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="mt-3 h-1.5 w-full rounded bg-muted" />
              <div className="mt-4 h-4 w-full rounded bg-muted" />
            </div>
            <div className="mt-8 space-y-5">
              <div className="flex gap-4">
                <div className="h-8 w-8 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-3 w-24 rounded bg-muted" />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="h-8 w-8 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 rounded bg-muted" />
                  <div className="h-3 w-28 rounded bg-muted" />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="h-8 w-8 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-28 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                </div>
              </div>
            </div>
          </div>
          <div className="animate-pulse rounded-lg border border-border bg-card/95 p-6 shadow-panel sm:p-10">
            <div className="mx-auto max-w-3xl space-y-8">
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-10 w-72 rounded bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
              <div className="h-4 w-4/5 rounded bg-muted" />
              <div className="rounded-lg border border-border bg-background/80 p-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="h-11 rounded bg-muted" />
                  </div>
                  <div className="space-y-3">
                    <div className="h-4 w-28 rounded bg-muted" />
                    <div className="h-11 rounded bg-muted" />
                  </div>
                </div>
                <div className="mt-6 space-y-3">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-11 rounded bg-muted" />
                </div>
                <div className="mt-6 h-20 rounded-md bg-muted" />
              </div>
              <div className="flex items-center justify-between border-t border-border pt-6">
                <div className="h-4 w-36 rounded bg-muted" />
                <div className="h-11 w-44 rounded bg-muted" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
