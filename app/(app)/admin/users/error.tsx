"use client";

export default function AdminUsersError({ reset }: { reset: () => void }) {
  return <div role="alert" className="rounded-[14px] border border-amber-500/60 bg-card p-6">
    <h1 className="text-2xl font-semibold">User records are unavailable.</h1>
    <p className="mt-2 text-sm text-muted-foreground">No account status is inferred from a failed read. Please try again.</p>
    <button type="button" onClick={reset} className="mt-4 min-h-11 rounded-lg border border-border px-4 font-semibold hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Retry</button>
  </div>;
}
