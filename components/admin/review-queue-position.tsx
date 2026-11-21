"use client";

import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  reviewQueueHref, reviewQueueRecordAnchor, reviewQueueRecordId,
  type CatalogQueueContext, type ReviewQueueTab
} from "@/lib/admin/review-queue-navigation";

export function ReviewQueueRecordLink({
  record, tab, context, ...props
}: Omit<ComponentProps<typeof Link>, "id" | "onNavigate"> & {
  record: string;
  tab: ReviewQueueTab;
  context: CatalogQueueContext;
}) {
  return <Link {...props} id={reviewQueueRecordAnchor(record)} onNavigate={() => {
    // Mark the current history entry before leaving. Back restores the same URL as the explicit return.
    window.history.replaceState(window.history.state, "", reviewQueueHref(tab, context, record));
  }} />;
}

export function ReviewQueuePosition({ ready = true, canCheckRecord = true }: {
  ready?: boolean;
  canCheckRecord?: boolean;
}) {
  const record = reviewQueueRecordId(useSearchParams().get("record"));
  const [missing, setMissing] = useState<string>();

  useEffect(() => {
    if (!record || !ready) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const link = document.getElementById(reviewQueueRecordAnchor(record));
        const target = link ?? document.getElementById("review-queue-heading");
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ block: link ? "center" : "start", behavior: "instant" });
        setMissing(!link && canCheckRecord ? record : undefined);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [record, ready, canCheckRecord]);

  return record && missing === record && ready && canCheckRecord ? (
    <p role="status" className="text-sm text-muted-foreground">That record is no longer listed in this view.</p>
  ) : null;
}
