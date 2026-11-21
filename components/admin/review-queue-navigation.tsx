"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CatalogWorkbench } from "@/components/artist/catalog/catalog-workbench";
import { catalogQueueContext, reviewQueueHref } from "@/lib/admin/review-queue-navigation";

function useQueueContext() {
  const params = useSearchParams();
  return catalogQueueContext(params.get("status"), params.get("page"));
}

export function ReviewQueueNavigation({ active }: { active: "track" | "catalog" }) {
  const context = useQueueContext();

  return (
    <nav aria-label="Review queue views" className="flex w-full flex-wrap gap-1 rounded-lg border border-border bg-card p-0.5 sm:w-fit">
      {(["track", "catalog"] as const).map(tab => (
        <Link key={tab} href={reviewQueueHref(tab, context)} aria-current={active === tab ? "page" : undefined}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-center text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-accent/15 aria-[current=page]:text-foreground sm:min-h-9 sm:flex-none sm:px-4">
          {tab === "track" ? "Track Submissions" : "Catalog Reviews"}
        </Link>
      ))}
    </nav>
  );
}

export function AdminCatalogReviewQueue() {
  const context = useQueueContext();
  return <CatalogWorkbench admin queueContext={context} onQueueChange={next => {
    window.history.pushState(null, "", reviewQueueHref("catalog", next));
  }} />;
}
