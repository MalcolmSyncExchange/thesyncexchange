import Link from "next/link";
import { ReviewQueuePosition, ReviewQueueRecordLink } from "@/components/admin/review-queue-position";
import { ArrowRight, ClipboardCheck, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { catalogReviewHref, type CatalogQueueContext } from "@/lib/admin/review-queue-navigation";
import { blockerLabels, catalogStates, type CatalogQueue } from "@/lib/catalog/contract";
import { formatEnumLabel } from "@/lib/utils";

export function CatalogReviewPanel({ context, queue, status, onChange, onRefresh }: {
  context: CatalogQueueContext;
  queue: CatalogQueue | null;
  status: "loading" | "success" | "error" | "denied";
  onChange: (next: CatalogQueueContext) => void;
  onRefresh: () => void;
}) {
  const { filter, page } = context;
  const busy = status === "loading";
  const hasRecords = Boolean(queue?.items.length);
  const statusText = busy ? (queue ? "Refreshing catalog results…" : "Loading catalog…")
    : status === "success" && queue ? `${queue.total} catalog record${queue.total === 1 ? "" : "s"} loaded.` : "";
  const refreshLabel = status === "denied" ? "Check catalog access again"
    : status === "error" ? "Retry catalog request" : "Refresh catalog results";

  return (
    <section aria-label="Catalog Reviews" className="min-w-0 space-y-2.5 sm:space-y-3">
      <ReviewQueuePosition ready={!busy} canCheckRecord={status === "success"} />
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-2.5 sm:items-center sm:px-3">
        <label className="grid min-w-0 gap-1 text-sm font-medium sm:flex sm:items-center sm:gap-2">
          Review status
          <select className="h-11 min-w-0 rounded-md border border-border bg-background px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10"
            value={filter} onChange={event => onChange({ filter: event.target.value, page: 1 })}>
            <option value="">All statuses</option>
            <option value="not_started">Not started</option>
            {catalogStates.map(state => <option key={state} value={state}>{formatEnumLabel(state)}</option>)}
          </select>
        </label>
        <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-10" disabled={busy} onClick={onRefresh} aria-label={refreshLabel}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {status === "loading" || status === "success" ? "Refresh" : refreshLabel}
        </Button>
      </div>

      <p className={busy ? "text-sm text-muted-foreground" : "sr-only"} role="status">{statusText}</p>
      {status === "denied" && <p role="alert" className="rounded-lg border border-border bg-muted p-4 text-sm">
        <strong>Catalog access denied.</strong> Sign in with an authorized account and complete the required security verification before checking access again.
      </p>}
      {status === "error" && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        <strong>Catalog results could not be loaded.</strong> Retry the request.
        {hasRecords && " Previously loaded results are shown and may be out of date."}
      </p>}
      {busy && !hasRecords && <div aria-hidden="true" className="h-28 rounded-lg border border-border bg-muted/50 motion-safe:animate-pulse" />}

      {hasRecords && queue && <ul aria-label="Catalog records" className="divide-y divide-border rounded-lg border border-border bg-card">
        {queue.items.map(record => (
          <li key={record.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 px-2.5 py-2.5 sm:items-center sm:gap-x-4 sm:px-4">
            <div className="grid min-w-0 gap-x-4 gap-y-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:py-1">
                <h3 className="min-w-0 font-semibold [overflow-wrap:anywhere]">{record.title}</h3>
                <CatalogStatusBadge state={record.state} />
              </div>
              <div className="min-w-0 text-sm md:py-1">
                <p className="text-muted-foreground">
                  {record.visible ? "Published and eligible" : "Unavailable to new buyers"}
                </p>
                {record.blockers.length > 0 && <details>
                  <summary className="min-h-11 cursor-pointer rounded-sm py-3 text-xs font-semibold text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-300 sm:min-h-9 sm:py-2">
                    {record.blockers.length} publication {record.blockers.length === 1 ? "blocker" : "blockers"}
                  </summary>
                  <ul className="list-disc space-y-1 pb-1 pl-5 text-muted-foreground">
                    {record.blockers.map(blocker => <li key={blocker}>{blockerLabels[blocker] || formatEnumLabel(blocker)}</li>)}
                  </ul>
                </details>}
              </div>
            </div>
            <Button asChild size="sm" className="min-h-11 sm:min-h-10" variant={record.state === "submitted" ? "default" : "outline"}>
              <ReviewQueueRecordLink href={catalogReviewHref(record.id, context)} record={record.id} tab="catalog" context={context} aria-label={`Open ${record.state === "submitted" ? "review" : "record"} for ${record.title}`}>
                {record.state === "submitted" ? "Open review" : "Open record"}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </ReviewQueueRecordLink>
            </Button>
          </li>
        ))}
      </ul>}

      {status === "success" && !hasRecords && <div className="rounded-lg border border-dashed border-border bg-muted/25 p-4">
        <ClipboardCheck className="mb-2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h3 className="font-semibold">{filter === "submitted" && page === 1
          ? "No catalog submissions awaiting review"
          : queue?.total ? "No catalog records on this page" : "No catalog records match this status"}</h3>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">{filter === "submitted" && page === 1
          ? "Catalog drafts stay out of this queue until an artist submits them for review. Track submissions are reviewed separately."
          : "Change the review status or return to the first page to see other records."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {filter !== "" || page > 1 ? <Button type="button" variant="outline" size="lg"
            onClick={() => onChange({ filter: "", page: 1 })}>View all statuses</Button> : null}
          {filter === "submitted" && page === 1 && <Button asChild variant="ghost" size="lg">
            <Link href="/admin/review-queue">View track submissions</Link>
          </Button>}
        </div>
      </div>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        {queue && (hasRecords || page > 1) && <nav aria-label="Catalog queue pages" className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-sm text-muted-foreground">
            {page <= queue.page_count ? `Page ${page} of ${queue.page_count} · ` : ""}
            {queue.total} {queue.total === 1 ? "record" : "records"}
          </span>
          {(queue.page_count > 1 || page > 1) && <div className="flex gap-2">
            <Button type="button" size="lg" variant="outline" disabled={busy || page <= 1}
              onClick={() => onChange({ filter, page: page - 1 })}>Previous</Button>
            <Button type="button" size="lg" variant="outline" disabled={busy || page >= queue.page_count || page >= 10_000}
              onClick={() => onChange({ filter, page: page + 1 })}>Next</Button>
          </div>}
        </nav>}
        <Button asChild variant="ghost" size="sm" className="ml-auto min-h-11 sm:min-h-10">
          <Link href="/admin/media">Media queue</Link>
        </Button>
      </div>
    </section>
  );
}

export function CatalogStatusBadge({ state }: { state: string }) {
  return <Badge variant="outline" className={state === "submitted" || state === "changes_requested"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
    : state === "published" || state === "approved"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
      : "bg-muted text-muted-foreground"}>{formatEnumLabel(state)}</Badge>;
}
